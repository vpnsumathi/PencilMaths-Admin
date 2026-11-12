'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { requireAdmin, requireStaff } from '@/lib/auth';
import { optional, optionalNumber, redirectWith, text } from '@/lib/form';
import { EMAIL, TEACHER_STATUSES, UUID } from '@/lib/options';
import { deleteLogin, discardNewLogin, inviteOrFindLogin, resendInvite } from '@/lib/logins';
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
  // The last name is optional: some teachers are known by one name.
  if (!row.first_name) redirectWith(formPath, 'error', 'Enter the first name.');
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

  // An email that already has a login (for example a staff member who also teaches) is linked instead.
  let loginId: string;
  let existing: boolean;
  try {
    // full_name is used by the invite email template.
    ({ id: loginId, existing } = await inviteOrFindLogin(email, { role: 'teacher', full_name: `${teacher.first_name} ${teacher.last_name}` }));
  } catch (e) {
    unstable_rethrow(e); // let redirects through
    console.error('giveTeacherLogin failed:', e);
    redirectWith(path, 'error', 'Could not send the invite. Check SUPABASE_SECRET_KEY is set.');
  }

  // The database refuses a student or family login here, with a message (P0001).
  const { data, error } = await supabase.from('teachers').update({ auth_user_id: loginId }).eq('id', teacher.id).select('id');
  if (error || data.length === 0) {
    console.error('giveTeacherLogin save failed:', error?.message ?? 'no rows updated');
    if (!existing) await discardNewLogin(loginId); // don't leave a new login linked to nobody
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
  let outcome: 'sent' | 'accepted';
  try {
    outcome = await resendInvite(teacher.auth_user_id);
  } catch (e) {
    console.error('resendTeacherInvite failed:', e);
    redirectWith(path, 'error', 'Could not resend the invite. Try Remove access, then send the invite again.');
  }
  if (outcome === 'accepted') redirectWith(path, 'error', 'The invite was already accepted.');
  redirectWith(path, 'ok', 'Invite sent again.');
}

// Removes the teacher's login. Their record, batches and marks are kept. A staff login is only unlinked.
export async function removeTeacherLogin(form: FormData) {
  const { supabase, teacher, path } = await teacherForAccess(form);
  const loginId = teacher.auth_user_id;
  if (!loginId) redirectWith(path, 'error', 'This teacher has no login.');

  const { data: unlinked, error: unlinkError } = await supabase.from('teachers').update({ auth_user_id: null }).eq('id', teacher.id).select('id');
  if (unlinkError || unlinked.length === 0) {
    console.error('removeTeacherLogin unlink failed:', unlinkError?.message ?? 'no rows updated');
    redirectWith(path, 'error', 'Could not remove the login.');
  }
  const { data: staff } = await supabase.from('staff').select('id').eq('id', loginId).maybeSingle();
  if (staff) {
    revalidatePath(path);
    redirectWith(path, 'ok', 'Unlinked. That login belongs to staff, so it was kept.');
  }

  try {
    await deleteLogin(loginId);
  } catch (e) {
    console.error('removeTeacherLogin failed:', e);
    redirectWith(path, 'error', 'Unlinked, but the login could not be deleted. They can no longer see anything.');
  }
  revalidatePath(path);
  redirectWith(path, 'ok', 'Teacher login removed. They can no longer sign in.');
}
