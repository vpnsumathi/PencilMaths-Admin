import 'server-only';
import { createSpace, getSpace, MEET_ACCESS } from '@/lib/google/meet';
import { createAdminClient } from '@/lib/supabase/admin';

// Each batch's Google Meet room (guide 21, section 12), made with the app's Google account so the app can see who
// is in the call. Kept by its id (spaces/…). Its link is asked from Google when someone joins and kept for a few
// hours, so a link Google has changed is picked up by itself. Only the server writes batch_meet_rooms.

export type MeetRoom = { batch_id: string; space_name: string; meeting_uri: string | null; uri_checked_at: string | null; access_type: string | null };

const LINK_HOURS = 6;
const MEET_LINK = /^https:\/\/meet\.google\.com\/[a-z0-9-]{1,64}$/;
const cleanUri = (uri: string | undefined) => (uri && MEET_LINK.test(uri) ? uri : null);

async function saveRoom(batchId: string, staffId: string | null, replace: boolean) {
  const db = createAdminClient();
  const space = await createSpace();
  const row = {
    batch_id: batchId, space_name: space.name, meeting_uri: cleanUri(space.meetingUri), uri_checked_at: new Date().toISOString(),
    access_type: space.config?.accessType ?? MEET_ACCESS, created_by: staffId,
  };
  const { error } = await db.from('batch_meet_rooms').upsert(row, { onConflict: 'batch_id', ignoreDuplicates: !replace });
  if (error) throw new Error(`Saving the Meet room failed: ${error.message}`);
}

export async function getMeetRoom(batchId: string): Promise<MeetRoom | null> {
  const { data, error } = await createAdminClient().from('batch_meet_rooms').select('*').eq('batch_id', batchId).maybeSingle();
  if (error) throw new Error(`batch_meet_rooms: ${error.message}`);
  return data as MeetRoom | null;
}

// Makes the batch's room if it has none. Pressing twice at once is harmless: the first room saved is kept.
export async function ensureMeetRoom(batchId: string, staffId: string | null) {
  if (!(await getMeetRoom(batchId))) await saveRoom(batchId, staffId, false);
}

// A new room in place of the old one (the old link stops being used).
export const recreateMeetRoom = (batchId: string, staffId: string | null) => saveRoom(batchId, staffId, true);

// The room's link to send someone to, or null if the batch has no room. Asks Google again after a few hours; if
// Google can't be reached, the link saved before is used.
export async function meetLink(batchId: string): Promise<string | null> {
  const room = await getMeetRoom(batchId);
  if (!room) return null;
  const fresh = room.uri_checked_at && Date.now() - new Date(room.uri_checked_at).getTime() < LINK_HOURS * 3600_000;
  if (fresh && room.meeting_uri) return room.meeting_uri;
  try {
    const uri = cleanUri((await getSpace(room.space_name)).meetingUri);
    if (uri) {
      await createAdminClient().from('batch_meet_rooms')
        .update({ meeting_uri: uri, uri_checked_at: new Date().toISOString() }).eq('batch_id', batchId);
      return uri;
    }
  } catch (e) {
    console.error('Meet link check:', e);
  }
  return room.meeting_uri;
}
