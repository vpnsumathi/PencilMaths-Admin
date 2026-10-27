'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { requireAdmin, requireStaff } from '@/lib/auth';
import { optional, optionalNumber, redirectWith, text } from '@/lib/form';
import { EMAIL, TEACHER_STATUSES, UUID } from '@/lib/options';
import { siteUrl } from '@/lib/siteUrl';
import { createAdminClient, findUserByEmail } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// Adds a teacher, or updates one when the form includes an id.
export async function saveTeacher(form: FormData) {
  await requireStaff();
  const id = text(form, 'id');
  if (id && !UUID.test(id)) redirectWith('/teachers', 'error', 'Teacher not found.');
  const formPath = id ? `/teachers/${id}` : '/teachers/new';

  const row = {
    first_name: text(form, 'first_name'),
    last_name: text(form, 'last_name'),
    personal_email: optional(form, 'personal_email'),
    phone: optional(form, 'phone'),
    subject_id: optional(form, 'subject_id'),
    year_min: optionalNumber(form, 'year_min'),
    year_max: optionalNumber(form, 'year_max'),
    status: text(form, 'status') || 'active',
    joined_on: optional(form, 'joined_on'),
    notes: optional(form, 'notes'),
  };
  if (!row.first_name || !row.last_name) redirectWith(formPath, 'error', 'Enter the first and last name.');
  if (row.personal_email && !EMAIL.test(row.personal_email)) redirectWith(formPath, 'error', 'Enter a valid email address.');
  if (!(row.status in TEACHER_STATUSES)) redirectWith(formPath, 'error', 'Choose a valid status.');
  if (row.year_min && row.year_max && row.year_min > row.year_max) {
    redirectWith(formPath, 'error', 'The lowest year group cannot be above the highest.');
  }

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from('teachers').update(row).eq('id', id).select('id')
    : await supabase.from('teachers').insert(row).select('id');
  if (error || data.length === 0) {
    console.error('saveTeacher failed:', error?.message ?? 'no rows saved');
    redirectWith(formPath, 'error', error?.code === '23505' ? 'Another teacher already uses that email.' : 'Could not save the teacher.');
  }

  revalidatePath('/teachers');
  revalidatePath('/');
  redirectWith('/teachers', 'ok', id ? 'Teacher updated.' : 'Teacher added.');
}

// ---- Teacher login ------------------------------------------------------------------------------
// A teacher signs in to see only their own batches and the students in them (database rules in
// 20261027000004_teacher_login.sql). Giving, resending and removing a login is for admins only.

async function teacherForAccess(form: FormData) {
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/teachers', 'error', 'Teacher not found.');
  const path = `/teachers/${id}`;
  const { supabase } = await requireAdmin(path);
  const { data: teacher } = await supabase.from('teachers').select('id, first_name, last_name, status, auth_user_id').eq('id', id).maybeSingle();
  if (!teacher) redirectWith('/teachers', 'error', 'Teacher not found.');
  return { supabase, teacher, path };
}

// Sends an invite email. The teacher clicks it, chooses a password and lands on their dashboard.
export async function giveTeacherLogin(form: FormData) {
  const { supabase, teacher, path } = await teacherForAccess(form);
  const email = text(form, 'email').toLowerCase();
  if (!EMAIL.test(email)) redirectWith(path, 'error', 'Enter a valid email address.');
  if (teacher.status === 'left') redirectWith(path, 'error', 'This teacher has left, so they cannot have a login.');
  if (teacher.auth_user_id) redirectWith(path, 'error', 'This teacher already has a login.');

  let loginId: string;
  let existing = false;
  try {
    const { data, error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
      data: { role: 'teacher', full_name: `${teacher.first_name} ${teacher.last_name}` }, // used by the invite email template
      redirectTo: `${await siteUrl()}/auth/accept`,
    });
    if (error) {
      // The email already has a login (for example a staff member who also teaches): link that login instead.
      if (!/already|registered|exists/i.test(error.message)) throw new Error(error.message);
      const found = await findUserByEmail(email);
      if (!found) throw new Error(error.message);
      loginId = found;
      existing = true;
    } else {
      loginId = data.user.id;
    }
  } catch (e) {
    unstable_rethrow(e); // let redirects through
    console.error('giveTeacherLogin failed:', e);
    redirectWith(path, 'error', 'Could not send the invite. Check SUPABASE_SECRET_KEY is set.');
  }

  // The database refuses a student or family login here, with a message (P0001).
  const { data, error } = await supabase.from('teachers').update({ auth_user_id: loginId }).eq('id', teacher.id).select('id');
  if (error || data.length === 0) {
    console.error('giveTeacherLogin save failed:', error?.message ?? 'no rows updated');
    if (!existing) await createAdminClient().auth.admin.deleteUser(loginId); // don't leave a new login linked to nobody
    redirectWith(path, 'error', error?.code === 'P0001' ? error.message
      : error?.code === '23505' ? 'That login already belongs to another teacher.' : 'Could not save the login.');
  }

  const { data: staff } = existing
    ? await supabase.from('staff').select('id').eq('id', loginId).maybeSingle()
    : { data: null };
  revalidatePath(path);
  redirectWith(path, 'ok', staff
    ? `${email} is a staff login, so it is now linked to this teacher too. They keep the full staff view.`
    : existing
      ? `${email} already had a login, so it is now linked to this teacher. They sign in with that password (or use Forgot password).`
      : `Invite sent to ${email}.`);
}

// Sends the invite email again (only while it has not been accepted).
export async function resendTeacherInvite(form: FormData) {
  const { teacher, path } = await teacherForAccess(form);
  if (!teacher.auth_user_id) redirectWith(path, 'error', 'This teacher has no login yet.');
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(teacher.auth_user_id);
    if (!data.user?.email) throw new Error('login not found');
    if (data.user.last_sign_in_at) redirectWith(path, 'error', 'The invite was already accepted.');
    const { error } = await admin.auth.admin.inviteUserByEmail(data.user.email, {
      redirectTo: `${await siteUrl()}/auth/accept`,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    unstable_rethrow(e); // let redirects through
    console.error('resendTeacherInvite failed:', e);
    redirectWith(path, 'error', 'Could not resend the invite. Try Remove access, then send the invite again.');
  }
  redirectWith(path, 'ok', 'Invite sent again.');
}

// Removes the teacher's login. Their record, batches and marks are kept. A staff login is only unlinked.
export async function removeTeacherLogin(form: FormData) {
  const { supabase, teacher, path } = await teacherForAccess(form);
  const loginId = teacher.auth_user_id;
  if (!loginId) redirectWith(path, 'error', 'This teacher has no login.');

  const { error: unlinkError } = await supabase.from('teachers').update({ auth_user_id: null }).eq('id', teacher.id);
  if (unlinkError) {
    console.error('removeTeacherLogin unlink failed:', unlinkError.message);
    redirectWith(path, 'error', 'Could not remove the login.');
  }
  const { data: staff } = await supabase.from('staff').select('id').eq('id', loginId).maybeSingle();
  if (staff) {
    revalidatePath(path);
    redirectWith(path, 'ok', 'Unlinked. That login belongs to staff, so it was kept.');
  }

  try {
    const { error } = await createAdminClient().auth.admin.deleteUser(loginId);
    if (error) throw new Error(error.message);
  } catch (e) {
    unstable_rethrow(e);
    console.error('removeTeacherLogin failed:', e);
    redirectWith(path, 'error', 'Unlinked, but the login could not be deleted. They can no longer see anything.');
  }
  revalidatePath(path);
  redirectWith(path, 'ok', 'Teacher login removed. They can no longer sign in.');
}
