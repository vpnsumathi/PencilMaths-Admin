'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { redirectWith, text } from '@/lib/form';
import { EMAIL, STUDENT_STATUSES, UUID, YEARS } from '@/lib/options';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ensureStudentDriveFolder } from '@/lib/students/driveFolder';
import { siteUrl } from '@/lib/siteUrl';

// Adds or updates a student. The database function save_student (file 4) saves the student,
// family, main parent, subjects and folder link together, so a half-saved student is impossible.
export async function saveStudent(form: FormData) {
  const id = text(form, 'id');
  if (id && !UUID.test(id)) redirectWith('/students', 'error', 'Student not found.');
  const formPath = id ? `/students/${id}` : '/students/new';

  const status = text(form, 'status') || 'active';
  const yearGroup = Number(text(form, 'year_group'));
  if (!(status in STUDENT_STATUSES)) redirectWith(formPath, 'error', 'Choose a valid status.');
  if (!YEARS.includes(yearGroup)) redirectWith(formPath, 'error', 'Choose a year group.');

  // One enrolment for each ticked subject, with its batch and teacher (both optional).
  const enrolments = form.getAll('enrol').map(String).map((subjectId) => ({
    id: text(form, `enrolment_id_${subjectId}`),
    subject_id: subjectId,
    teacher_id: text(form, `teacher_${subjectId}`),
    batch_id: text(form, `batch_${subjectId}`),
  }));

  const p = {
    id,
    first_name: text(form, 'first_name'),
    last_name: text(form, 'last_name'),
    year_group: yearGroup,
    school: text(form, 'school'),
    date_of_birth: text(form, 'date_of_birth'),
    status,
    start_date: text(form, 'start_date'),
    guardian: {
      full_name: text(form, 'guardian_name'),
      relationship: text(form, 'guardian_relationship'),
      phone: text(form, 'guardian_phone'),
      email: text(form, 'guardian_email'),
    },
    enrolments,
    folder_url: text(form, 'folder_url'),
  };

  const supabase = await createClient();
  const { data: studentId, error } = await supabase.rpc('save_student', { p });
  if (error) {
    console.error('saveStudent failed:', error.message);
    // P0001 = a message raised on purpose by save_student, e.g. "Add at least one subject". Safe to show.
    redirectWith(formPath, 'error', error.code === 'P0001' ? error.message : 'Could not save the student.');
  }

  revalidatePath('/students');
  revalidatePath('/batches');
  revalidatePath('/');
  // New students get their Google Drive folder straight away.
if (!id) {
  const driveOk = await ensureStudentDriveFolder(studentId).then(
    () => true,
    (err) => { console.error('Drive folder failed:', err); return false; },
  );
  if (!driveOk) {
    redirectWith(`/students/${studentId}`, 'error', 'Student added, but the Drive folder could not be made. Use "Create Drive folder" below.');
  }
}
redirectWith(`/students/${studentId}`, 'ok', id ? 'Student updated.' : 'Student and Drive folder added.');
}
// "Create Drive folder" button on the student page (existing students, or after a Drive problem).
export async function createDriveFolder(form: FormData) {
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/students', 'error', 'Student not found.');
  const path = `/students/${id}`;

  const driveOk = await ensureStudentDriveFolder(id).then(
    () => true,
    (err) => { console.error('createDriveFolder failed:', err); return false; },
  );
  revalidatePath(path);
  redirectWith(
    path,
    driveOk ? 'ok' : 'error',
    driveOk ? 'Drive folder created.' : 'Could not create the Drive folder. Check the connection at /google-drive.',
  );
}
// Makes a new secret hand-in code; the old WhatsApp link stops working immediately.
export async function resetHandInLink(form: FormData) {
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/students', 'error', 'Student not found.');
  const path = `/students/${id}`;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('students')
    .update({ handin_code: crypto.randomUUID().replaceAll('-', '') })
    .eq('id', id)
    .select('id');
  if (error || data.length === 0) {
    console.error('resetHandInLink failed:', error?.message ?? 'no rows updated');
    redirectWith(path, 'error', 'Could not reset the link.');
  }
  revalidatePath(path);
  redirectWith(path, 'ok', 'New hand-in link created. The old link no longer works.');
}
// ---- Student login (portal access) -------------------------------------------------------------

// Shared start: must be signed-in staff (the security rules only show students to staff).
async function studentForAccess(form: FormData) {
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/students', 'error', 'Student not found.');
  const supabase = await createClient();
  const { data: student } = await supabase
    .from('students')
    .select('id, status, auth_user_id')
    .eq('id', id)
    .maybeSingle();
  if (!student) redirectWith('/students', 'error', 'Student not found.');
  return { supabase, student, path: `/students/${id}` };
}

// Sends an invite email. The student clicks it, chooses a password and lands on their dashboard.
export async function givePortalAccess(form: FormData) {
  const { supabase, student, path } = await studentForAccess(form);
  const email = text(form, 'email').toLowerCase();
  if (!EMAIL.test(email)) redirectWith(path, 'error', 'Enter a valid email address.');
  if (student.status === 'left') redirectWith(path, 'error', 'This student has left, so they cannot have a login.');
  if (student.auth_user_id) redirectWith(path, 'error', 'This student already has a login.');

  let invitedId: string;
  let existing = false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { role: 'student' },
      redirectTo: `${await siteUrl()}/auth/accept`,
    });
    if (error) {
      // The email already has a login (staff, or used before): link that login instead.
      if (!/already|registered|exists/i.test(error.message)) throw new Error(error.message);
      const found = await findUserByEmail(email);
      if (!found) throw new Error(error.message);
      invitedId = found;
      existing = true;
    } else {
      invitedId = data.user.id;
    }
  } catch (e) {
    unstable_rethrow(e); // let redirects through
    console.error('givePortalAccess failed:', e);
    redirectWith(path, 'error', 'Could not send the invite. Check SUPABASE_SECRET_KEY is set.');
  }

  // One login opens one student, so move it here if another student had it.
  if (existing) await supabase.from('students').update({ auth_user_id: null }).eq('auth_user_id', invitedId);

  const { data, error } = await supabase.from('students').update({ auth_user_id: invitedId }).eq('id', student.id).select('id');
  if (error || data.length === 0) {
    console.error('givePortalAccess save failed:', error?.message ?? 'no rows updated');
    if (!existing) await createAdminClient().auth.admin.deleteUser(invitedId); // don't leave a new login linked to nobody
    redirectWith(path, 'error', 'Could not save the login.');
  }
  revalidatePath(path);
  redirectWith(
    path,
    'ok',
    existing
      ? `${email} already had a login, so it is now linked to this student. They sign in with that password (or use Forgot password).`
      : `Invite sent to ${email}.`,
  );
}

// Supabase has no lookup by email, so page through the logins (fine at this size).
async function findUserByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

// Sends the invite email again (only while it has not been accepted).
export async function resendPortalInvite(form: FormData) {
  const { student, path } = await studentForAccess(form);
  if (!student.auth_user_id) redirectWith(path, 'error', 'This student has no login yet.');
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(student.auth_user_id);
    if (!data.user?.email) throw new Error('login not found');
    if (data.user.last_sign_in_at) redirectWith(path, 'error', 'The invite was already accepted.');
    const { error } = await admin.auth.admin.inviteUserByEmail(data.user.email, {
      redirectTo: `${await siteUrl()}/auth/accept`,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    unstable_rethrow(e); // let redirects through
    console.error('resendPortalInvite failed:', e);
    redirectWith(path, 'error', 'Could not resend the invite. Try Remove access, then give access again.');
  }
  redirectWith(path, 'ok', 'Invite sent again.');
}

// Deletes the student's login. Their record, homework and marks are kept.
export async function removePortalAccess(form: FormData) {
  const { supabase, student, path } = await studentForAccess(form);
  if (!student.auth_user_id) redirectWith(path, 'error', 'This student has no login.');

  // A staff login is only unlinked, never deleted.
  const { data: staff } = await supabase.from('staff').select('id').eq('id', student.auth_user_id).maybeSingle();
  if (staff) {
    await supabase.from('students').update({ auth_user_id: null }).eq('id', student.id);
    revalidatePath(path);
    redirectWith(path, 'ok', 'Unlinked. That login belongs to staff, so it was kept.');
  }

  try {
    const { error } = await createAdminClient().auth.admin.deleteUser(student.auth_user_id);
    if (error) throw new Error(error.message);
  } catch (e) {
    unstable_rethrow(e);
    console.error('removePortalAccess failed:', e);
    redirectWith(path, 'error', 'Could not remove the login.');
  }
  // The database clears auth_user_id itself (on delete set null); this covers it either way.
  await supabase.from('students').update({ auth_user_id: null }).eq('id', student.id);
  revalidatePath(path);
  redirectWith(path, 'ok', 'Portal access removed. The student can no longer sign in.');
}
