// The Class Schedule page's working out (guide 21, section 12) and what Meet saw in a class for the check-in from
// Meet (guide 21, section 15), kept apart from the database and Google calls so it can be tested on its own
// (liveClass.test.ts, npm test). All times are UK times.

import type { ClassWindow } from './classLink';
import { clock12 } from './format.ts';

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
// participantIds: every entry of theirs in the calls (for the teacher's join stretches, see lib/meetCheck.ts).
export type LivePerson = Expected & {
  state: PersonState; joinedAt: string | null; leftAt: string | null; googleIds: string[];
  calls: { participantId: string; kind: 'phone' | 'anonymous'; name: string }[]; participantIds: string[];
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
    if (!inCall) return { ...e, state: 'unknown', joinedAt: null, leftAt: null, googleIds: [], calls: [], participantIds: [] };
    const mine = inCall.filter((p) => whose(p) === e.id);
    if (mine.length === 0) return { ...e, state: 'not_detected', joinedAt: null, leftAt: null, googleIds: [], calls: [], participantIds: [] };
    const byTime = (a: string, b: string) => Date.parse(a) - Date.parse(b);
    const joinedAt = mine.map((p) => p.joinedAt).filter((t): t is string => Boolean(t)).sort(byTime)[0] ?? null;
    const now = mine.some((p) => !p.leftAt);
    const leftAt = now ? null : mine.map((p) => p.leftAt!).sort(byTime).at(-1) ?? null;
    return {
      ...e, state: now ? 'in_meet' : 'left', joinedAt, leftAt,
      googleIds: mine.filter((p) => p.googleId).map((p) => p.googleId!),
      calls: mine.filter((p) => !p.googleId && p.kind !== 'signed_in')
        .map((p) => ({ participantId: p.participantId, kind: p.kind as 'phone' | 'anonymous', name: p.name })),
      participantIds: mine.map((p) => p.participantId),
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

// A UK date and time ("2026-11-16", "16:00") as a moment, in summer (BST) and winter (GMT) alike.
export function ukMoment(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  // How far UK time is ahead of UTC at a moment, in minutes (0 or 60).
  const ahead = (at: number) => {
    const n = ukNow(new Date(at));
    const [ny, nm, nd] = n.date.split('-').map(Number);
    return (Date.UTC(ny, nm - 1, nd, Math.floor(n.minute / 60), n.minute % 60) - Math.floor(at / 60_000) * 60_000) / 60_000;
  };
  const first = guess - ahead(guess) * 60_000;
  return new Date(guess - ahead(first) * 60_000);
}

// When check-in opens and closes for a weekly class on `date` at `time` (UK): from before_minutes before the start
// to after_minutes after it. Meet calls going on at any point in that time belong to this class.
export function classTimes(date: string, time: string, window: ClassWindow) {
  const starts = ukMoment(date, time);
  return {
    starts, opens: new Date(starts.getTime() - window.before_minutes * 60_000),
    closes: new Date(starts.getTime() + window.after_minutes * 60_000),
  };
}

// ---------- What Meet saw in one class, for the check-in from Meet (lib/meetCheck.ts, guide 21 section 15) ----------
export type MeetCall = { name: string; startTime?: string; endTime?: string };

// Is the class over for good, so Meet need not be asked again? Its check-in time has ended and every call in it has
// ended (a call still going on may still have someone joining late), or the class was on an earlier day.
export function isFinal(calls: MeetCall[], closes: Date, now: Date) {
  if (now.getTime() <= closes.getTime()) return false;
  return calls.every((c) => Boolean(c.endTime)) || ukNow(closes).date < ukNow(now).date;
}

// The teacher's minutes in the call and how many times they dropped out, from each stretch they were in it (a new
// stretch starts every time they rejoin). Stretches that overlap (a laptop and a phone at once) count once, and only
// a gap between stretches is a drop. A stretch with no end is still going on (counted up to `now`).
export function teacherStretches(stretches: { startTime: string; endTime: string | null }[], now: Date) {
  const spans = stretches.map((s) => [Date.parse(s.startTime), s.endTime ? Date.parse(s.endTime) : now.getTime()] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a).sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of spans) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const ms = merged.reduce((sum, [a, b]) => sum + (b - a), 0);
  return { minutes: Math.round(ms / 60_000), drops: Math.max(merged.length - 1, 0) };
}

// From the matched call (buildLive): each student's first join, the teacher's first join and last leave, and how
// many people in the call the app couldn't match. A Google account linked to someone outside the class is known
// (knownElsewhere), so it isn't counted: it can't be one of the class's students.
export function meetFindings(live: Pick<ReturnType<typeof buildLive>, 'people' | 'guests'>, knownElsewhere: Set<string> = new Set()) {
  const students = live.people.filter((p) => p.kind === 'student' && p.joinedAt).map((p) => ({ id: p.id, first_join: p.joinedAt! }));
  const t = live.people.find((p) => p.kind === 'teacher' && p.joinedAt) ?? null;
  const unknown = live.guests.filter((g) => !(g.googleId && knownElsewhere.has(g.googleId))).length;
  return {
    students, unknown,
    teacher: t ? { id: t.id, first_join: t.joinedAt!, last_leave: t.leftAt, participantIds: t.participantIds } : null,
  };
}

// Google accounts brothers and sisters may share (a parent's account; one account belongs to only one person in the
// app). knownElsewhere: accounts in the call linked to someone outside the class, which can't be one of its students,
// leaving out those linked to a brother or sister of a student in the class (that child may be using it).
// shared: accounts in the call linked to a student of the class whose brother or sister is in the class too (the
// other child may be on it). Both count as unidentified in meetFindings, so the Join class presses are kept.
export function familyAccounts(students: { id: string; familyId: string | null }[], people: InCall[], links: GoogleLink[],
  elsewhere: { google_user_id: string; students: { family_id: string | null } | null }[]) {
  const families = new Set(students.map((s) => s.familyId).filter(Boolean));
  const knownElsewhere = new Set(elsewhere
    .filter((e) => !(e.students?.family_id && families.has(e.students.family_id))).map((e) => e.google_user_id));
  const familyOf = new Map(students.map((s) => [s.id, s.familyId]));
  const inClass = (familyId: string | null | undefined) => (familyId ? students.filter((s) => s.familyId === familyId).length : 0);
  const inCall = new Set(people.map((p) => p.googleId).filter(Boolean));
  const shared = new Set(links.filter((l) => l.student_id && inCall.has(l.google_user_id) && inClass(familyOf.get(l.student_id)) > 1)
    .map((l) => l.google_user_id)).size;
  return { knownElsewhere, shared };
}
