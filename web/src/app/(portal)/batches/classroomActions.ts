'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { disconnectClassroom, runClassroomSetup } from '@/lib/classroomSetup';
import { redirectWith, text } from '@/lib/form';
import { UUID } from '@/lib/options';

// The batch page's Create Google Classroom, Finish setup / Check now, Resend invite and Disconnect buttons
// (guide 21, section 11). Staff only; the steps themselves are in lib/classroomSetup.ts.

async function batchFrom(form: FormData) {
  const viewer = await requireStaff();
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/batches', 'error', 'Batch not found.');
  return { id, staffId: viewer.userId };
}

function done(id: string, result: { ok: boolean; message: string }): never {
  revalidatePath(`/batches/${id}`);
  revalidatePath('/batches');
  redirectWith(`/batches/${id}`, result.ok ? 'ok' : 'error', result.message);
}

// Create, and also Finish setup / Check now: the same steps, carrying on from the last one that worked.
export async function setUpClassroom(form: FormData) {
  const { id, staffId } = await batchFrom(form);
  done(id, await runClassroomSetup(id, staffId));
}

// A teacher who declined the invitation (or was removed from the class) is invited again.
export async function resendClassroomInvite(form: FormData) {
  const { id, staffId } = await batchFrom(form);
  done(id, await runClassroomSetup(id, staffId, { resend: true }));
}

export async function disconnectClassroomAction(form: FormData) {
  const { id } = await batchFrom(form);
  done(id, await disconnectClassroom(id));
}
