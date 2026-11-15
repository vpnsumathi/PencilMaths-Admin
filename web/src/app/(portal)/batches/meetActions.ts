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
