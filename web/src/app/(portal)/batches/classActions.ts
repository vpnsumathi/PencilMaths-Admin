'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff, requireStaffOrTeacher } from '@/lib/auth';
import { CLASS_LINK_HELP, cleanClassLink } from '@/lib/classLink';
import { redirectWith, text } from '@/lib/form';
import { formatDate } from '@/lib/format';
import { todayInUk, UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// The class link (Google Classroom) and the attendance register on the batch page.
// See Help/21-class-link-attendance.md and supabase/migrations/20261111000001_class_link_attendance.sql.

const NOT_READY = 'The database is not ready for this yet: run 20261111000001_class_link_attendance.sql in Supabase first.';

// What to show when the database refused or failed.
// P0001 = a message raised on purpose (safe to show). PGRST202 / 42703 / PGRST204 = the function or column
// doesn't exist yet: the database script hasn't been run on this Supabase project.
function dbProblem(error: { code?: string; message: string }, fallback: string) {
  if (error.code === 'P0001') return error.message;
  if (error.code === 'PGRST202' || error.code === '42703' || error.code === 'PGRST204') return NOT_READY;
  return fallback;
}

// Staff paste, replace or remove a batch's class link. Students get the new link the next time they press Join class.
export async function saveClassLink(form: FormData) {
  await requireStaff();
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/batches', 'error', 'Batch not found.');
  const path = `/batches/${id}`;

  const pasted = form.get('remove') === 'true' ? '' : text(form, 'class_link');
  const link = pasted ? cleanClassLink(pasted) : null;
  if (pasted && !link) redirectWith(path, 'error', `That link can't be used. ${CLASS_LINK_HELP}`);

  const supabase = await createClient();
  // Who changed it and when is filled in by the database (batch_class_link_stamp).
  const { data, error } = await supabase.from('batches').update({ class_link: link }).eq('id', id).select('id');
  if (error || data.length === 0) {
    console.error('saveClassLink failed:', error?.message ?? 'no rows updated');
    // 23514 = the database's own check that the link is a Google Classroom or Google Meet address.
    redirectWith(path, 'error', error?.code === '23514'
      ? `That link can't be used. ${CLASS_LINK_HELP}`
      : error ? dbProblem(error, 'Could not save the class link.') : 'Could not save the class link.');
  }

  revalidatePath(path);
  revalidatePath('/batches');
  redirectWith(path, 'ok', link ? 'Class link saved. Students and the teacher now see Join class.' : 'Class link removed.');
}

// Staff or the batch's teacher save the register of one class day. The form sends status_<student id> for each
// student that was ticked (students who haven't checked in start unticked, so they stay open to check in). One database function saves it all, or nothing; it also checks whose batch it is.
export async function saveRegister(form: FormData) {
  await requireStaffOrTeacher();
  const batchId = text(form, 'batch_id');
  if (!UUID.test(batchId)) redirectWith('/batches', 'error', 'Batch not found.');
  const classDate = text(form, 'class_date');
  const path = `/batches/${batchId}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(classDate)) redirectWith(path, 'error', 'Choose the class date.');
  const back = `${path}?class_date=${classDate}`;
  if (classDate > todayInUk()) redirectWith(path, 'error', 'The register can\'t be taken for a date in the future.');

  const marks: { student_id: string; status: string; reason?: string }[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('status_')) continue;
    const studentId = key.slice('status_'.length);
    // The reason is kept with the change (attendance_changes); the database asks for one when it is needed.
    const reason = text(form, `reason_${studentId}`).slice(0, 300);
    if (UUID.test(studentId) && typeof value === 'string' && value) {
      marks.push({ student_id: studentId, status: value, ...(reason ? { reason } : {}) });
    }
  }
  // "Save and mark the rest absent": everyone on the form left unticked is saved as Absent too.
  if (form.get('rest_absent') === 'true') {
    for (const value of form.getAll('student')) {
      const studentId = String(value);
      if (UUID.test(studentId) && !marks.some((m) => m.student_id === studentId)) marks.push({ student_id: studentId, status: 'absent' });
    }
  }
  if (marks.length === 0) redirectWith(back, 'error', 'Tick Present, Late or Absent for at least one student first.');

  const supabase = await createClient();
  const { data: changed, error } = await supabase.rpc('save_register', { p_batch: batchId, p_date: classDate, p_marks: marks });
  if (error) {
    console.error('saveRegister failed:', error.message);
    redirectWith(back, 'error', dbProblem(error, 'Could not save the register. Nothing was changed.'));
  }

  revalidatePath(path);
  revalidatePath('/batches');
  redirectWith(back, 'ok', `Register saved for ${formatDate(classDate)}: `
    + (changed === 0 ? 'nothing needed changing.' : changed === 1 ? '1 entry changed.' : `${changed} entries changed.`));
}
