'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { redirectWith, text } from '@/lib/form';
import { meetProblem } from '@/lib/google/meet';
import { ensureMeetRoom, recreateMeetRoom } from '@/lib/meetRoom';
import { UUID } from '@/lib/options';

// The batch page's Create Meet room and Recreate room buttons (guide 21, section 12). Staff only.

async function run(form: FormData, replace: boolean) {
  const viewer = await requireStaff();
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/batches', 'error', 'Batch not found.');
  let message: string;
  let ok = true;
  try {
    await (replace ? recreateMeetRoom(id, viewer.userId) : ensureMeetRoom(id, viewer.userId));
    message = replace
      ? 'New Meet room made. Join class uses it from now on; the old room\'s link is no longer used.'
      : 'Meet room made. At class time, Join class opens it, and the Class Schedule page shows who is in the call.';
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
