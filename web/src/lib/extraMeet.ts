import 'server-only';
import { callPeople, createSpace, getSpace, latestCall, meetProblem, retireSpace } from '@/lib/google/meet';
import { buildLive, type GoogleLink, type Guest, type InCall, type LivePerson } from '@/lib/liveClass';
import { createAdminClient } from '@/lib/supabase/admin';
import { whatsappNumber } from '@/app/(portal)/_dashboard/homework';
import type { Detail } from './extraClasses';

// Each extra class's own Google Meet room (guide 24), made with the app's Google account like the batch rooms
// (guide 21, section 12), so the app can see who is in the call. Kept on the extra class itself (meet_space_name).
// Its link is asked from Google when someone joins and kept for a few hours. Only the server writes these columns,
// after the database has said the person may see the class.

const LINK_HOURS = 6;
const MEET_LINK = /^https:\/\/meet\.google\.com\/[a-z0-9-]{1,64}$/;
const cleanUri = (uri: string | undefined) => (uri && MEET_LINK.test(uri) ? uri : null);

type Room = { meet_space_name: string | null; meeting_uri: string | null; uri_checked_at: string | null; cancelled_at: string | null };

async function getRoom(id: string): Promise<Room | null> {
  const { data, error } = await createAdminClient().from('extra_classes')
    .select('meet_space_name, meeting_uri, uri_checked_at, cancelled_at').eq('id', id).maybeSingle();
  if (error) throw new Error(`extra_classes: ${error.message}`);
  return data as Room | null;
}

// Makes the class's room if it has none (not for a cancelled class). Two presses at once are harmless: the room is
// only saved while the class still has none, so the first one is kept (the other room is never shown to anyone).
export async function ensureExtraMeetRoom(id: string) {
  const room = await getRoom(id);
  if (!room) throw new Error('Extra class not found.');
  if (room.meet_space_name || room.cancelled_at) return;
  const space = await createSpace();
  const { error } = await createAdminClient().from('extra_classes')
    .update({ meet_space_name: space.name, meeting_uri: cleanUri(space.meetingUri), uri_checked_at: new Date().toISOString() })
    .eq('id', id).is('meet_space_name', null);
  if (error) throw new Error(`Saving the Meet room failed: ${error.message}`);
}

// A new room in place of the old one. Join class uses the new link straight away; the old room is then closed
// (retireSpace). Returns false if Google wouldn't close the old room, so its old link may still let people in.
export async function recreateExtraMeetRoom(id: string): Promise<boolean> {
  const old = await getRoom(id);
  const space = await createSpace();
  const { error } = await createAdminClient().from('extra_classes')
    .update({ meet_space_name: space.name, meeting_uri: cleanUri(space.meetingUri), uri_checked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Saving the Meet room failed: ${error.message}`);
  return old?.meet_space_name ? retireSpace(old.meet_space_name) : true;
}

// The room's link to send someone to (making the room first if the class has none). Asks Google again after a few
// hours; if Google can't be reached, the link saved before is used.
export async function extraMeetLink(id: string): Promise<string | null> {
  let room = await getRoom(id);
  if (!room || room.cancelled_at) return null;
  if (!room.meet_space_name) {
    await ensureExtraMeetRoom(id);
    room = await getRoom(id);
    if (!room?.meet_space_name) return null;
  }
  const fresh = room.uri_checked_at && Date.now() - new Date(room.uri_checked_at).getTime() < LINK_HOURS * 3600_000;
  if (fresh && room.meeting_uri) return room.meeting_uri;
  try {
    const uri = cleanUri((await getSpace(room.meet_space_name)).meetingUri);
    if (uri) {
      await createAdminClient().from('extra_classes')
        .update({ meeting_uri: uri, uri_checked_at: new Date().toISOString() }).eq('id', id);
      return uri;
    }
  } catch (e) {
    console.error('Extra class Meet link check:', e);
  }
  return room.meeting_uri;
}

// ---------- Who is in the call now (the class page, while the class is on) ----------
export type ExtraLive = {
  status: 'ok' | 'no_room' | 'no_call' | 'error';
  problem: string | null; callStartedAt: string | null;
  teacher: LivePerson | null; students: LivePerson[]; guests: Guest[]; inMeet: number;
};

// Meet's answer for a room, kept for 20 seconds so staff watching the same class don't each ask Google. The cache
// lives in one server copy's memory: on Vercel several copies can run, each with its own, so it is best-effort
// (enough at this size; a shared cache would be needed only if Google's limits were ever reached).
type Answer = { ok: true; startedAt: string | null; people: InCall[] | null } | { ok: false; problem: string };
const cache = new Map<string, { at: number; answer: Answer }>();

async function askMeet(space: string, opensAt: string): Promise<Answer> {
  const hit = cache.get(space);
  if (hit && Date.now() - hit.at < 20_000) return hit.answer;
  let answer: Answer;
  try {
    const call = await latestCall(space);
    // Only a call started for this class counts (from 15 minutes before the check-in opens).
    const forThis = call?.startTime && new Date(call.startTime).getTime() >= new Date(opensAt).getTime() - 15 * 60_000;
    answer = call && forThis ? { ok: true, startedAt: call.startTime ?? null, people: await callPeople(call.name) } : { ok: true, startedAt: null, people: null };
  } catch (e) {
    console.error('Extra class Meet check:', e);
    answer = { ok: false, problem: meetProblem(e) };
  }
  if (cache.size > 200) cache.clear();
  cache.set(space, { at: Date.now(), answer });
  return answer;
}

// Matches the people in the class's call to its teacher and students, using the saved Google account links
// (the same ones the Class Schedule page uses). Staff only.
export async function loadExtraLive(c: Detail): Promise<ExtraLive> {
  const db = createAdminClient();
  const { data: room } = await db.from('extra_classes').select('meet_space_name').eq('id', c.id).maybeSingle();
  const ids = c.students.map((s) => s.id);
  const { data: links } = await db.from('google_people').select('google_user_id, student_id, teacher_id')
    .or([ids.length ? `student_id.in.(${ids.join(',')})` : '', `teacher_id.eq.${c.teacher_id}`].filter(Boolean).join(','));
  const expected = [
    { id: c.teacher_id, kind: 'teacher' as const, name: c.teacher },
    ...c.students.map((s) => ({
      id: s.id, kind: 'student' as const, name: `${s.first_name} ${s.last_name}`,
      phone: whatsappNumber(s.parent_phone), clickedAt: s.joined_at, mark: s.mark_source === 'staff' ? s.mark : null,
    })),
  ];
  const finish = (status: ExtraLive['status'], problem: string | null, startedAt: string | null, people: InCall[] | null): ExtraLive => {
    const live = buildLive(expected, people, (links ?? []) as GoogleLink[]);
    return {
      status, problem, callStartedAt: startedAt, teacher: live.people.find((p) => p.kind === 'teacher') ?? null,
      students: live.people.filter((p) => p.kind === 'student'), guests: live.guests,
      inMeet: live.people.filter((p) => p.kind === 'student' && p.state === 'in_meet').length,
    };
  };
  const space = room?.meet_space_name as string | null;
  if (!space) return finish('no_room', null, null, null);
  const meet = await askMeet(space, c.opens_at);
  if (!meet.ok) return finish('error', meet.problem, null, null);
  if (!meet.people) return finish('no_call', null, null, []);
  return finish('ok', null, meet.startedAt, meet.people);
}
