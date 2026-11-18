// The Class Schedule page's working out (guide 21, section 12), kept apart from the database and Google calls so
// it can be tested on its own. All times are UK times.

import type { ClassWindow } from './classLink';
import { clock12 } from './format';

// One person who has been in a Meet call (see lib/google/meet.ts). leftAt null: in the call now.
// participantId: Meet's id for this person in this one call ("conferenceRecords/…/participants/…"), the only id a
// phone or signed-out caller has. googleId: the Google account, for signed-in people only (the same in every call).
export type InCall = {
  participantId: string; googleId: string | null; name: string; kind: 'signed_in' | 'anonymous' | 'phone';
  joinedAt: string | null; leftAt: string | null;
};

// "in_meet": in the call now. "left": joined, then left. "not_detected": no join seen (not the same as absent:
// they may have joined with another account). "unknown": the app couldn't get Meet's answer.
export type PersonState = 'in_meet' | 'left' | 'not_detected' | 'unknown';

export type Expected = {
  id: string; kind: 'student' | 'teacher'; name: string; code?: string | null;
  phone?: string | null;      // a parent's phone, for WhatsApp (students)
  clickedAt?: string | null;  // pressed Join class in the portal (a separate signal, not proof of joining)
  mark?: string | null;       // the register's mark, if staff or the teacher set one
};
// googleIds: their linked Google accounts seen in this call. calls: phone or signed-out callers linked to them for
// this call only (with how they joined), for "Not them?".
export type LivePerson = Expected & {
  state: PersonState; joinedAt: string | null; leftAt: string | null; googleIds: string[];
  calls: { participantId: string; kind: 'phone' | 'anonymous'; name: string }[];
};
// Someone in the call who isn't one of the expected people. knownAs: linked to someone outside this batch.
// why: why the app couldn't tell who it is (from the Classroom class list); a teacher's version has no emails.
export type Guest = InCall & { knownAs: string | null; why?: string | null };
export type GoogleLink = { google_user_id: string; student_id: string | null; teacher_id: string | null };
// A phone or signed-out caller linked to a person for one call (meet_call_guests).
export type CallLink = { participant_name: string; kind: string; display_name: string | null; student_id: string | null; teacher_id: string | null };

// Matches the people in the call to the people expected: signed-in people by their saved Google account links,
// phone and signed-out callers by their links for this call (callLinks). A signed-out guest who drops and rejoins
// comes back as a new caller with the same name; within the same call they are taken to be the same person.
// inCall null: Meet's answer isn't available, so everyone is "unknown" rather than "not detected".
export function buildLive(expected: Expected[], inCall: InCall[] | null, links: GoogleLink[], knownAs: Map<string, string> = new Map(),
  callLinks: CallLink[] = []) {
  const isExpected = (id: string | null): id is string => Boolean(id) && expected.some((e) => e.id === id);
  const owner = new Map<string, string>(); // google id -> expected person id
  for (const l of links) {
    const id = l.student_id ?? l.teacher_id;
    if (isExpected(id)) owner.set(l.google_user_id, id);
  }
  const callOwner = new Map<string, string>(); // participant id -> expected person id
  const sameName = new Map<string, string>();  // "call|phone|name" -> expected person id, for a caller who rejoined
  const callOf = (participant: string) => participant.split('/participants/')[0];
  for (const l of callLinks) {
    const id = l.student_id ?? l.teacher_id;
    if (!isExpected(id)) continue;
    callOwner.set(l.participant_name, id);
    if (l.display_name) sameName.set(`${callOf(l.participant_name)}|${l.kind}|${l.display_name}`, id);
  }
  const whose = (p: InCall) => (p.googleId ? owner.get(p.googleId)
    : callOwner.get(p.participantId) ?? sameName.get(`${callOf(p.participantId)}|${p.kind}|${p.name}`)) ?? null;

  const people: LivePerson[] = expected.map((e) => {
    if (!inCall) return { ...e, state: 'unknown', joinedAt: null, leftAt: null, googleIds: [], calls: [] };
    const mine = inCall.filter((p) => whose(p) === e.id);
    if (mine.length === 0) return { ...e, state: 'not_detected', joinedAt: null, leftAt: null, googleIds: [], calls: [] };
    const joinedAt = mine.map((p) => p.joinedAt).filter(Boolean).sort()[0] ?? null;
    const now = mine.some((p) => !p.leftAt);
    const leftAt = now ? null : mine.map((p) => p.leftAt!).sort().at(-1) ?? null;
    return {
      ...e, state: now ? 'in_meet' : 'left', joinedAt, leftAt,
      googleIds: mine.filter((p) => p.googleId).map((p) => p.googleId!),
      calls: mine.filter((p) => !p.googleId && p.kind !== 'signed_in')
        .map((p) => ({ participantId: p.participantId, kind: p.kind as 'phone' | 'anonymous', name: p.name })),
    };
  });
  const guests: Guest[] = (inCall ?? [])
    .filter((p) => whose(p) === null)
    .map((p) => ({ ...p, knownAs: (p.googleId && knownAs.get(p.googleId)) || null }));
  return { people, guests, inMeet: people.filter((p) => p.state === 'in_meet').length };
}

// Now in UK time: date "2026-11-16", ISO weekday (1 = Monday) and minutes since midnight.
export function ukNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// A moment as UK "2026-11-16 16:02" (for comparing), and as "4:02 PM" (for showing).
export const ukStamp = (iso: string) => {
  const n = ukNow(new Date(iso));
  return `${n.date} ${String(Math.floor(n.minute / 60)).padStart(2, '0')}:${String(n.minute % 60).padStart(2, '0')}`;
};
export const ukClock = (iso: string | null | undefined) => (iso ? clock12(ukStamp(iso).slice(11)) : ''); // "4:02 PM", for showing

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Where a class at `time` today is: "soon" (check-in open, not started), "live", "done" or "later".
// minutesIn: minutes since the start (negative before it).
export function classState(time: string, window: ClassWindow, nowMinute: number) {
  const minutesIn = nowMinute - minutesOf(time);
  const state = minutesIn < -window.before_minutes ? 'later'
    : minutesIn < 0 ? 'soon'
    : minutesIn <= window.after_minutes ? 'live' : 'done';
  return { state: state as 'later' | 'soon' | 'live' | 'done', minutesIn };
}

// Has the Meet call that started at `callStart` begun inside this class's time (from the check-in opening on)?
// An older call in the same room (last week's class) doesn't count.
export function callIsForClass(callStart: string | undefined, date: string, time: string, window: ClassWindow) {
  if (!callStart) return false;
  const opens = minutesOf(time) - window.before_minutes;
  const stamp = ukStamp(callStart);
  if (stamp.slice(0, 10) !== date) return false;
  return minutesOf(stamp.slice(11)) >= opens - 15; // a teacher who opens the room a little early still counts
}
