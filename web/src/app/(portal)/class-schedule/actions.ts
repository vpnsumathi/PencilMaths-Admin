'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffOrTeacher } from '@/lib/auth';
import { todaysCall } from '@/lib/classSchedule';
import { redirectWith, text } from '@/lib/form';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// "This is…" and "Not them?" on the Class Schedule page (guide 21, sections 12 and 13), for staff and for the
// batch's own teacher:
// - a signed-in Google account is linked to a student or the teacher once, and recognised in every class after;
// - someone who joined by phone or without signing in to Google has no lasting id, so they are linked for this one
//   call only.
// Who may link whom is decided by the database's link functions (they run as the signed-in login, so a teacher can
// only link people in their own open batch, and can't move an account linked to someone outside it). Before asking,
// the action checks with Google Meet that the account or caller really is in this batch's call today, so a made-up
// id can't be linked. Each link and unlink is kept in the history (google_link_events).

const GOOGLE_ID = /^[0-9A-Za-z_-]{1,64}$/;
const PARTICIPANT = /^conferenceRecords\/[A-Za-z0-9_-]{1,128}\/participants\/[A-Za-z0-9_-]{1,128}$/;
const back = (batchId: string) => `/class-schedule${UUID.test(batchId) ? `?class=${batchId}` : ''}`;

// The person picked in "This is…": "s:<student id>" or "t:<teacher id>".
function picked(form: FormData) {
  const [kind, personId] = text(form, 'person').split(':');
  return ['s', 't'].includes(kind) && UUID.test(personId ?? '') ? { kind, personId } : null;
}

// The database's own reason (raised by the link functions) when it refuses, else a general message.
function refused(batchId: string, where: string, error: { code?: string; message: string }, fallback: string): never {
  console.error(`${where}:`, error.message);
  redirectWith(back(batchId), 'error', error.code === 'P0001' ? error.message : fallback);
}

const NOT_IN_CALL = 'That person isn\'t in this batch\'s Meet call today, so they can\'t be linked. Refresh the page and try again.';

export async function linkGooglePerson(form: FormData) {
  await requireStaffOrTeacher();
  const batchId = text(form, 'batch_id');
  const googleId = text(form, 'google_id');
  const who = picked(form);
  if (!UUID.test(batchId) || !GOOGLE_ID.test(googleId) || !who) redirectWith(back(batchId), 'error', 'Pick who this is first.');
  const call = await todaysCall(batchId);
  const seen = call?.people.find((p) => p.googleId === googleId);
  if (!seen) redirectWith(back(batchId), 'error', NOT_IN_CALL);
  const supabase = await createClient();
  const { error } = await supabase.rpc('link_google_account', {
    p_batch: batchId, p_google_id: googleId, p_kind: who.kind, p_person: who.personId, p_display_name: seen.name,
  });
  if (error) refused(batchId, 'linkGooglePerson', error, 'Could not save who this is. Please try again.');
  revalidatePath('/class-schedule');
  redirectWith(back(batchId), 'ok', 'Saved. This Google account is recognised in every class from now on.');
}

export async function unlinkGooglePerson(form: FormData) {
  await requireStaffOrTeacher();
  const batchId = text(form, 'batch_id');
  const googleIds = text(form, 'google_ids').split(',').filter((id) => GOOGLE_ID.test(id));
  if (!UUID.test(batchId) || googleIds.length === 0) redirectWith(back(batchId), 'error', 'Nothing to take away.');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('unlink_google_accounts', { p_batch: batchId, p_google_ids: googleIds });
  if (error) refused(batchId, 'unlinkGooglePerson', error, 'Could not take the link away. Please try again.');
  revalidatePath('/class-schedule');
  if (!data) redirectWith(back(batchId), 'error', 'That link was already taken away.');
  redirectWith(back(batchId), 'ok', 'Link taken away. That Google account now shows as an unidentified guest, so you can pick the right person.');
}

// Phone and signed-out callers: for this call only. The caller's name and how they joined are taken from Meet,
// not from the form.
export async function linkCallGuest(form: FormData) {
  await requireStaffOrTeacher();
  const batchId = text(form, 'batch_id');
  const participant = text(form, 'participant_id');
  const who = picked(form);
  if (!UUID.test(batchId) || !PARTICIPANT.test(participant) || !who) redirectWith(back(batchId), 'error', 'Pick who this is first.');
  const call = await todaysCall(batchId);
  const seen = call?.people.find((p) => p.participantId === participant && !p.googleId && p.kind !== 'signed_in');
  if (!call || !seen || !participant.startsWith(`${call.conference}/participants/`)) redirectWith(back(batchId), 'error', NOT_IN_CALL);
  const supabase = await createClient();
  const { error } = await supabase.rpc('link_call_guest', {
    p_batch: batchId, p_class_date: call.date, p_participant: participant, p_guest_kind: seen.kind,
    p_display_name: seen.name, p_kind: who.kind, p_person: who.personId,
  });
  if (error) refused(batchId, 'linkCallGuest', error, 'Could not save who this is. Please try again.');
  revalidatePath('/class-schedule');
  redirectWith(back(batchId), 'ok', `Saved for this class only. ${seen.kind === 'phone' ? 'A phone caller' : 'Someone not signed in to Google'} can't be recognised in another class, so choose who they are again next time.`);
}

export async function unlinkCallGuest(form: FormData) {
  await requireStaffOrTeacher();
  const batchId = text(form, 'batch_id');
  const participants = text(form, 'participant_ids').split(',').filter((id) => PARTICIPANT.test(id));
  if (!UUID.test(batchId) || participants.length === 0) redirectWith(back(batchId), 'error', 'Nothing to take away.');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('unlink_call_guests', { p_batch: batchId, p_participants: participants });
  if (error) refused(batchId, 'unlinkCallGuest', error, 'Could not take the link away. Please try again.');
  revalidatePath('/class-schedule');
  if (!data) redirectWith(back(batchId), 'error', 'That link was already taken away.');
  redirectWith(back(batchId), 'ok', 'Link taken away. That caller now shows as an unidentified guest, so you can pick the right person.');
}
