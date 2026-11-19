'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff, requireStaffOrTeacher } from '@/lib/auth';
import { redirectWith, text } from '@/lib/form';
import { meetProblem } from '@/lib/google/meet';
import { syncClass } from '@/lib/meetCheck';
import { ensureMeetRoom, recreateMeetRoom } from '@/lib/meetRoom';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// The batch page's Create Meet room and Recreate room buttons (guide 21, section 12). Staff only.
// Also Refresh from Meet and the teacher's attendance correction on a class's attendance (section 15).

async function run(form: FormData, replace: boolean) {
  const viewer = await requireStaff();
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/batches', 'error', 'Batch not found.');
  let message: string;
  let ok = true;
  try {
    if (replace) {
      const closed = await recreateMeetRoom(id, viewer.userId);
      message = closed
        ? 'New Meet room made: Join class uses its new link from now on. The old room is closed, so the old link no longer lets anyone in.'
        : 'New Meet room made: Join class uses its new link from now on. Google wouldn\'t close the old room, so anyone who kept the old link may still get in.';
    } else {
      await ensureMeetRoom(id, viewer.userId);
      message = 'Meet room made. At class time, Join class opens it, and the Class Schedule page shows who is in the call.';
    }
  } catch (e) {
    console.error('Meet room:', e);
    ok = false;
    message = /batch_meet_rooms/.test(String(e))
      ? 'The database is not ready for this yet: run 20261114000001_meet_rooms.sql in Supabase first.'
      : meetProblem(e);
  }
  revalidatePath(`/batches/${id}`);
  revalidatePath('/class-schedule');
  redirectWith(`/batches/${id}`, ok ? 'ok' : 'error', message);
}

export async function createMeetRoomAction(form: FormData) { await run(form, false); }
export async function recreateMeetRoomAction(form: FormData) { await run(form, true); }

// ---------- Checked in from Google Meet (guide 21, section 15) ----------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const register = (id: string, date: string) => `/batches/${id}?class_date=${date}`;

// Refresh from Meet on a class's attendance: asks Google now, for staff and the batch's own teacher. The batch is
// read with the viewer's own database rules first, so a teacher can only refresh their own batch.
export async function refreshMeetCheckAction(form: FormData) {
  await requireStaffOrTeacher();
  const id = text(form, 'batch_id');
  const date = text(form, 'class_date');
  if (!UUID.test(id) || !DATE.test(date)) redirectWith('/batches', 'error', 'Class not found.');
  const supabase = await createClient();
  const { data: batch } = await supabase.from('batches').select('id').eq('id', id).maybeSingle();
  if (!batch) redirectWith('/batches', 'error', 'Batch not found.');
  const result = await syncClass({ kind: 'batch', batchId: id, date }, { force: true });
  revalidatePath(`/batches/${id}`);
  if (!result) redirectWith(register(id, date), 'error', 'Nothing to check with Google Meet for this class (no Meet room made by the app, the check-in hasn\'t opened yet, or the class is more than 30 days ago).');
  if (result.state === 'error') redirectWith(register(id, date), 'error', `Google Meet couldn't be asked: ${result.problem}`);
  const message = result.state === 'no_call'
    ? 'Checked with Google Meet: nobody started the Meet room for this class, so Join class presses count.'
    : `Checked with Google Meet: ${result.checkedIn} ${result.checkedIn === 1 ? 'student' : 'students'} seen in the call${result.takenBack ? `, ${result.takenBack} Join class ${result.takenBack === 1 ? 'press' : 'presses'} with no join in Meet taken back` : ''}.`;
  redirectWith(register(id, date), 'ok', message);
}

// Staff correct a teacher's attendance for one class (On time, Late or Absent), with a reason. The database checks
// it is staff and keeps the change (correct_teacher_attendance).
export async function correctTeacherAttendanceAction(form: FormData) {
  await requireStaff();
  // Back to where it was made: a batch's attendance for that day, or an extra class's page.
  const id = text(form, 'batch_id');
  const date = text(form, 'class_date');
  const extraId = text(form, 'id');
  const back = UUID.test(id) && DATE.test(date) ? register(id, date) : UUID.test(extraId) ? `/extra-classes/${extraId}` : '/attendance?tab=teachers';
  const record = Number(text(form, 'record_id'));
  if (!Number.isSafeInteger(record) || record <= 0) redirectWith(back, 'error', 'Teacher attendance not found.');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('correct_teacher_attendance', {
    p_id: record, p_status: text(form, 'status'), p_reason: text(form, 'reason'),
  });
  if (error) {
    console.error('correctTeacherAttendance:', error.message);
    redirectWith(back, 'error', error.code === 'P0001' ? error.message : 'Could not save the change. Please try again.');
  }
  revalidatePath(UUID.test(id) ? `/batches/${id}` : `/extra-classes/${extraId}`);
  revalidatePath('/attendance');
  redirectWith(back, 'ok', data === 0 ? 'That was already saved.' : 'Teacher\'s attendance corrected. The change and its reason are kept.');
}
