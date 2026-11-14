'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { redirectWith, text } from '@/lib/form';
import { UUID } from '@/lib/options';
import { createAdminClient } from '@/lib/supabase/admin';

// "This is…" and "Not them" on the Class Schedule page (guide 21, section 12): staff link a Google account seen in
// a Meet call to a student or teacher, once, or take a wrong link away. Staff only; saved with the server's key.

const GOOGLE_ID = /^[0-9A-Za-z_-]{1,64}$/;
const back = (batchId: string) => `/class-schedule${UUID.test(batchId) ? `?class=${batchId}` : ''}`;

export async function linkGooglePerson(form: FormData) {
  const viewer = await requireStaff();
  const batchId = text(form, 'batch_id');
  const googleId = text(form, 'google_id');
  const [kind, personId] = text(form, 'person').split(':');
  if (!GOOGLE_ID.test(googleId) || !UUID.test(personId ?? '') || !['s', 't'].includes(kind)) {
    redirectWith(back(batchId), 'error', 'Pick who this is first.');
  }
  const { error } = await createAdminClient().from('google_people').upsert({
    google_user_id: googleId,
    student_id: kind === 's' ? personId : null,
    teacher_id: kind === 't' ? personId : null,
    display_name: text(form, 'display_name').slice(0, 200) || null,
    matched_by: 'staff', linked_by: viewer.userId, linked_at: new Date().toISOString(),
  }, { onConflict: 'google_user_id' });
  if (error) {
    console.error('linkGooglePerson:', error.message);
    redirectWith(back(batchId), 'error', 'Could not save who this is. Please try again.');
  }
  revalidatePath('/class-schedule');
  redirectWith(back(batchId), 'ok', 'Saved. This Google account is recognised from now on.');
}

export async function unlinkGooglePerson(form: FormData) {
  await requireStaff();
  const batchId = text(form, 'batch_id');
  const googleIds = text(form, 'google_ids').split(',').filter((id) => GOOGLE_ID.test(id));
  if (googleIds.length === 0) redirectWith(back(batchId), 'error', 'Nothing to take away.');
  const { error } = await createAdminClient().from('google_people').delete().in('google_user_id', googleIds);
  if (error) {
    console.error('unlinkGooglePerson:', error.message);
    redirectWith(back(batchId), 'error', 'Could not take the link away. Please try again.');
  }
  revalidatePath('/class-schedule');
  redirectWith(back(batchId), 'ok', 'Link taken away. That Google account now shows as an unidentified guest, so you can pick the right person.');
}
