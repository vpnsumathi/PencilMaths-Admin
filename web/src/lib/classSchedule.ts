import 'server-only';
import { whatsappNumber } from '@/app/(portal)/_dashboard/homework';
import { CLASS_WINDOW } from '@/lib/classLink';
import { classMembers, classroomProblem, type Member } from '@/lib/google/classroom';
import {
  buildLive, classState, classTimes, ukNow, type CallLink, type Expected, type GoogleLink, type Guest, type InCall, type LivePerson,
} from '@/lib/liveClass';
import { classCallPeople } from '@/lib/meetCalls';
import { withinTime } from '@/lib/withinTime';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// The Class Schedule page's data (guide 21, section 12). Classes and people come from the app (class times,
// batch students, the register); who is in the call comes from Google Meet (every call in the room during the
// class's check-in time, lib/meetCalls.ts), asked only while someone has the page open, and kept for 20 seconds.
// Nothing is written on every refresh: the page saves new Google account links found on a Classroom class list,
// and the check-in from Meet (lib/meetCheck.ts) saves what Meet saw at most every 2 minutes per class.
// "This is…" and "Not them?" go through the database's link functions (20261118000001_meet_linking.sql), which
// check who may link whom.

export const TEACHER_LATE_MINUTES = 5; // the teacher shows in red if not in the call this long after the start

type BatchRow = {
  id: string; code: string; name: string | null; teacher_id: string | null;
  subjects: { name: string } | null; teachers: { first_name: string; last_name: string } | null;
  batch_slots: { weekday: number; start_time: string }[];
};
export type TodayClass = {
  batchId: string; code: string; name: string | null; subject: string | null; teacher: string | null; time: string;
  state: 'later' | 'soon' | 'live' | 'done'; minutesIn: number; hasRoom: boolean;
  register: { present: number; late: number; absent: number; clicked: number } | null;
};
export type WeekSlot = { batchId: string; code: string; subject: string | null; teacher: string | null; time: string };

const fullName = (p: { first_name: string; last_name: string } | null) => (p ? `${p.first_name} ${p.last_name}` : null);

// teacherId: the teacher's own Class Schedule (guide 21, section 13). The database rules already give a teacher only
// their own open batches (and their rooms, classes and attendance); asking for teacher_id as well is a second lock,
// so the teacher page can never show another teacher's class even if a rule is changed by mistake.
export async function loadSchedule({ teacherId }: { teacherId?: string } = {}, now = new Date()) {
  const supabase = await createClient();
  const uk = ukNow(now);
  let batchQuery = supabase.from('batches')
    .select('id, code, name, teacher_id, subjects(name), teachers(first_name, last_name), batch_slots(weekday, start_time)')
    .is('closed_on', null);
  if (teacherId) batchQuery = batchQuery.eq('teacher_id', teacherId);
  const [{ data: batches, error }, { data: rooms, error: roomError }] = await Promise.all([
    batchQuery.order('code'),
    supabase.from('batch_meet_rooms').select('batch_id'),
  ]);
  if (error) throw error;
  const withRoom = new Set((rooms ?? []).map((r) => r.batch_id as string));
  const list = (batches ?? []) as unknown as BatchRow[];

  const week: WeekSlot[][] = Array.from({ length: 7 }, () => []);
  for (const b of list) {
    for (const s of b.batch_slots) {
      week[s.weekday - 1].push({ batchId: b.id, code: b.code, subject: b.subjects?.name ?? null, teacher: fullName(b.teachers), time: s.start_time.slice(0, 5) });
    }
  }
  for (const day of week) day.sort((a, b) => a.time.localeCompare(b.time) || a.code.localeCompare(b.code));

  const todays = week[uk.weekday - 1];
  const ids = [...new Set(todays.map((c) => c.batchId))];
  const { data: sessions } = ids.length
    ? await supabase.from('class_sessions').select('batch_id, attendance(status, source)').in('batch_id', ids).eq('class_date', uk.date)
    : { data: [] };
  const registers = new Map((sessions ?? []).map((s) => {
    const marks = (s.attendance ?? []) as { status: string; source: string }[];
    return [s.batch_id as string, {
      present: marks.filter((m) => m.status === 'present' && m.source !== 'auto').length,
      late: marks.filter((m) => m.status === 'late').length,
      absent: marks.filter((m) => m.status === 'absent' || m.source === 'auto').length,
      clicked: marks.filter((m) => m.source === 'link').length,
    }];
  }));

  const today: TodayClass[] = todays.map((c) => {
    const b = list.find((x) => x.id === c.batchId)!;
    return {
      ...c, name: b.name, ...classState(c.time, CLASS_WINDOW, uk.minute), hasRoom: withRoom.has(c.batchId),
      register: registers.get(c.batchId) ?? null,
    };
  });
  // Open batches with no class time yet: they can't be on the timetable, so the teacher page lists them.
  const unscheduled = list.filter((b) => b.batch_slots.length === 0)
    .map((b) => ({ batchId: b.id, code: b.code, name: b.name, subject: b.subjects?.name ?? null }));
  return { date: uk.date, weekday: uk.weekday, today, week, unscheduled, batchCount: list.length, meetReady: !roomError };
}

export type Live = {
  batchId: string; code: string; time: string;
  status: 'ok' | 'no_room' | 'no_call' | 'error';
  problem: string | null; updatedAt: string; callStartedAt: string | null;
  teacher: LivePerson | null; students: LivePerson[]; guests: Guest[]; inMeet: number;
  teacherLate: boolean; // started at least TEACHER_LATE_MINUTES ago and the teacher isn't in the call
};

// Meet's answer for one weekly class today: every call in its check-in time (lib/meetCalls.ts, 20 seconds).
// startedAt: when the first of them started. conferences: the calls' names ("conferenceRecords/…"), which phone and
// signed-out callers' links belong to. people null: nobody has started the room in the class's time.
type MeetAnswer = { ok: true; startedAt: string | null; conferences: string[]; people: InCall[] | null } | { ok: false; problem: string };

async function askMeet(space: string, date: string, time: string): Promise<MeetAnswer> {
  const { opens, closes } = classTimes(date, time, CLASS_WINDOW);
  const found = await classCallPeople(space, opens, closes);
  if (!found.ok) return found;
  if (found.calls.length === 0) return { ok: true, startedAt: null, conferences: [], people: null };
  return { ok: true, startedAt: found.calls[0].startTime ?? null, conferences: found.calls.map((c) => c.name), people: found.people };
}

// Everyone in (or who has been in) today's Meet call of a batch, for "This is…" and "Not them?": the actions check
// that the account or caller really is in this batch's call before they link anyone. The batch is read with the
// signed-in login's rules, so a teacher gets nothing for a batch that isn't theirs. Uses the same 20-second answer
// the page showed, so someone on the page is found. null: no call today, no room, or Meet can't be reached.
export async function todaysCall(batchId: string, now = new Date()) {
  const supabase = await createClient();
  const uk = ukNow(now);
  const [{ data: batch }, { data: room }] = await Promise.all([
    supabase.from('batches').select('id, batch_slots(weekday, start_time)').eq('id', batchId).is('closed_on', null).maybeSingle(),
    supabase.from('batch_meet_rooms').select('space_name').eq('batch_id', batchId).maybeSingle(),
  ]);
  const slots = ((batch?.batch_slots ?? []) as { weekday: number; start_time: string }[]).filter((x) => x.weekday === uk.weekday);
  if (!room || slots.length === 0) return null;
  for (const s of slots) {
    const meet = await askMeet(room.space_name as string, uk.date, s.start_time.slice(0, 5));
    if (meet.ok && meet.people) return { date: uk.date, conferences: meet.conferences, people: meet.people };
  }
  return null;
}

// A Classroom class list, kept for 2 minutes per class. It is only asked for while someone in the call can't be
// recognised, so a class where everyone is known never asks. members null: Google refused (problem says why).
type Roster = { at: number; members: Member[] | null; problem: string | null };
const rosters = new Map<string, Roster>();
const ROSTER_SECONDS = 120;

async function classList(courseId: string): Promise<Roster> {
  const kept = rosters.get(courseId);
  if (kept && Date.now() - kept.at < ROSTER_SECONDS * 1000) return kept;
  let fresh: Roster;
  try {
    // At most 8 seconds for the whole list (several pages), so the Class Schedule isn't held up by Classroom.
    fresh = { at: Date.now(), members: await withinTime(classMembers(courseId), 8_000), problem: null };
  } catch (e) {
    console.error('Classroom class list check:', e);
    fresh = { at: Date.now(), members: null, problem: classroomProblem(e) };
  }
  if (rosters.size > 200) rosters.clear();
  rosters.set(courseId, fresh);
  return fresh;
}

// The same Google account however its email is written: case doesn't matter, and Gmail ignores dots and anything
// after + in the name part (j.smith@gmail.com and JSmith+pm@gmail.com are one account).
export function emailKey(email: string | null | undefined) {
  const e = email?.trim().toLowerCase();
  const at = e ? e.lastIndexOf('@') : -1;
  if (!e || at < 1) return null;
  const [name, domain] = [e.slice(0, at), e.slice(at + 1)];
  return domain === 'gmail.com' || domain === 'googlemail.com' ? `${name.split('+')[0].replaceAll('.', '')}@gmail.com` : e;
}

// Recognises Google accounts in the call from the class's Classroom list, by email: the teacher's Email on their
// page, or a parent's email on the family. Only a sure match is saved (one person with that email). For everyone
// else, `why` says what stopped it, so staff know whether to choose with "This is…" or fix an email.
// forTeacher: the reasons leave out the email (usually a parent's, which teachers can't see) and point to the office.
// Also used by the check-in from Meet (lib/meetCheck.ts) for classes nobody watched live (staffId null).
export async function linkFromClassroom(courseId: string, unknownIds: string[], teacher: { id: string; email: string | null } | null,
  students: { id: string; emails: string[] }[], staffId: string | null, forTeacher: boolean): Promise<{ links: GoogleLink[]; why: Map<string, string> }> {
  const why = new Map<string, string>();
  const list = await classList(courseId);
  if (!list.members) {
    for (const id of unknownIds) why.set(id, `The Google Classroom class list couldn't be read: ${list.problem}`);
    return { links: [], why };
  }
  const rows: { google_user_id: string; student_id: string | null; teacher_id: string | null; display_name: string | null; email: string; matched_by: string; linked_by: string | null }[] = [];
  for (const id of unknownIds) {
    const m = list.members.find((x) => x.googleId === id);
    if (!m) {
      why.set(id, 'Not on the Google Classroom class list (the teacher hasn\'t accepted the invitation, or the student hasn\'t joined the class), so the app can\'t tell who this is.');
      continue;
    }
    const as = m.role === 'teacher' ? 'a teacher' : 'a student';
    if (!m.email) {
      why.set(id, `On the Google Classroom class list as ${as}, but Google didn't give the account's email.`);
      continue;
    }
    const key = emailKey(m.email);
    const isTeacher = Boolean(key) && teacher?.email === key;
    const matches = key ? students.filter((s) => s.emails.includes(key)) : [];
    let row: { student_id: string | null; teacher_id: string | null } | null = null;
    if (isTeacher && matches.length === 0) row = { student_id: null, teacher_id: teacher!.id };
    else if (!isTeacher && matches.length === 1) row = { student_id: matches[0].id, teacher_id: null };
    if (row) {
      rows.push({ google_user_id: id, ...row, display_name: m.name, email: m.email, matched_by: 'classroom', linked_by: staffId });
      continue;
    }
    if (forTeacher) {
      why.set(id, `On the Google Classroom class list as ${as}, but the app can't be sure who it is from the emails it has. Choose who it is, or ask the office to check the emails.`);
      continue;
    }
    why.set(id, isTeacher
      ? `${m.email} is both the teacher's Email and a parent's email in this batch, so the app won't guess.`
      : matches.length > 1
        ? `${m.email} is the parent's email for ${matches.length} students in this batch, so the app won't guess.`
        : `On the Google Classroom class list as ${as} (${m.email}), but no teacher or parent in this batch has that email. Choose who it is, or correct the email on their page.`);
  }
  // A parent's email that belongs to a family with more than one child still here may be a Google account the
  // brothers and sisters share (one account can belong to only one person), so it is never linked to one of them
  // by itself: staff or the teacher choose with This is…, and the check-in from Meet keeps their presses.
  const sharing = await childrenInFamily(rows.map((r) => r.student_id).filter((x): x is string => Boolean(x)));
  for (let i = rows.length - 1; i >= 0; i--) {
    const n = rows[i].student_id ? sharing.get(rows[i].student_id!) ?? 1 : 1;
    if (n < 2) continue;
    why.set(rows[i].google_user_id, forTeacher
      ? `This account's email belongs to a family with ${n} children, so it may be shared and the app won't guess. Choose who it is with This is…, and check their attendance.`
      : `${rows[i].email} is the parent's email for ${n} children in the family, so the account may be shared and the app won't guess. Choose who it is with This is…, and check their attendance.`);
    rows.splice(i, 1);
  }
  if (rows.length === 0) return { links: [], why };
  const { error } = await createAdminClient().from('google_people').upsert(rows, { onConflict: 'google_user_id', ignoreDuplicates: true });
  if (error) {
    console.error('Saving Google account links:', error);
    return { links: [], why };
  }
  return { links: rows, why };
}

// For each of these students: how many children of their family are still here (not left), counting themselves.
export async function childrenInFamily(studentIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (studentIds.length === 0) return out;
  const db = createAdminClient();
  const { data: mine } = await db.from('students').select('id, family_id').in('id', studentIds);
  const families = [...new Set(((mine ?? []) as { family_id: string | null }[]).map((s) => s.family_id).filter(Boolean))] as string[];
  if (families.length === 0) return out;
  const { data: all } = await db.from('students').select('family_id').in('family_id', families).neq('status', 'left');
  const count = new Map<string, number>();
  for (const s of (all ?? []) as { family_id: string }[]) count.set(s.family_id, (count.get(s.family_id) ?? 0) + 1);
  for (const s of (mine ?? []) as { id: string; family_id: string | null }[]) if (s.family_id) out.set(s.id, count.get(s.family_id) ?? 1);
  return out;
}

// Who is looking: staff see everything; a batch's teacher sees their own class only, without parents' phones or
// emails, and accounts linked to someone outside the batch show without that person's name.
export type LiveViewer = { kind: 'staff'; userId: string } | { kind: 'teacher'; teacherId: string };

// One class today: who is expected, and where each of them is.
// The batch, its students, the attendance and the room are read with the viewer's own database rules (a teacher gets
// nothing for someone else's batch). The teacher's email, parents' details and the Google account links are then read
// with the server's key, because teachers can't read them, and only what this viewer may see is passed on.
export async function loadLive(c: { batchId: string; time: string; minutesIn: number }, viewer: LiveViewer, now = new Date()): Promise<Live> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const forTeacher = viewer.kind === 'teacher';
  const uk = ukNow(now);
  const [{ data: batch }, { data: enrols }, { data: session }, { data: room }, { data: classroom }] = await Promise.all([
    supabase.from('batches').select('id, code, teacher_id').eq('id', c.batchId).is('closed_on', null).maybeSingle(),
    supabase.from('enrolments').select('students(id, code, first_name, last_name, family_id)')
      .eq('batch_id', c.batchId).is('ended_on', null).lte('started_on', uk.date),
    supabase.from('class_sessions').select('attendance(student_id, status, source, joined_at)').eq('batch_id', c.batchId).eq('class_date', uk.date).maybeSingle(),
    supabase.from('batch_meet_rooms').select('space_name').eq('batch_id', c.batchId).maybeSingle(),
    supabase.from('batch_classrooms').select('course_id').eq('batch_id', c.batchId).maybeSingle(),
  ]);
  // Second lock for a teacher: only their own batch, even if a database rule were changed by mistake.
  const allowed = Boolean(batch) && (!forTeacher || batch!.teacher_id === viewer.teacherId);
  type Student = { id: string; code: string; first_name: string; last_name: string; family_id: string | null };
  type Teacher = { id: string; first_name: string; last_name: string; personal_email: string | null };
  const students = allowed ? [...new Map(((enrols ?? []) as unknown as { students: Student | null }[])
    .filter((e) => e.students).map((e) => [e.students!.id, e.students!])).values()]
    .sort((a, b) => a.first_name.localeCompare(b.first_name)) : [];
  const familyIds = [...new Set(students.map((s) => s.family_id).filter(Boolean))] as string[];
  const personIds = students.map((s) => s.id);
  const teacherId = allowed ? (batch!.teacher_id as string | null) : null;
  const [{ data: teacherRow }, { data: guardians }, { data: savedLinks }] = await Promise.all([
    teacherId ? admin.from('teachers').select('id, first_name, last_name, personal_email').eq('id', teacherId).maybeSingle() : Promise.resolve({ data: null }),
    familyIds.length ? admin.from('guardians').select('family_id, phone, email, is_primary').in('family_id', familyIds) : Promise.resolve({ data: [] }),
    personIds.length || teacherId
      ? admin.from('google_people').select('google_user_id, student_id, teacher_id')
        .or([personIds.length ? `student_id.in.(${personIds.join(',')})` : '', teacherId ? `teacher_id.eq.${teacherId}` : ''].filter(Boolean).join(','))
      : Promise.resolve({ data: [] }),
  ]);
  const t = (teacherRow ?? null) as Teacher | null;
  const marks = new Map((((session?.attendance ?? []) as { student_id: string; status: string; source: string; joined_at: string | null }[]))
    .map((a) => [a.student_id, a]));
  const family = (id: string | null) => ((guardians ?? []) as { family_id: string; phone: string | null; email: string | null; is_primary: boolean }[])
    .filter((g) => g.family_id === id).sort((a, b) => Number(b.is_primary) - Number(a.is_primary));

  const expected: Expected[] = [
    ...(t ? [{ id: t.id, kind: 'teacher' as const, name: `${t.first_name} ${t.last_name}` }] : []),
    ...students.map((s) => {
      const m = marks.get(s.id);
      return {
        id: s.id, kind: 'student' as const, name: `${s.first_name} ${s.last_name}`, code: s.code,
        phone: forTeacher ? null : whatsappNumber(family(s.family_id).find((g) => g.phone)?.phone ?? null),
        clickedAt: m?.joined_at ?? null, mark: m && m.source === 'staff' ? m.status : null,
      };
    }),
  ];

  const base = { batchId: c.batchId, code: batch?.code ?? '', time: c.time, updatedAt: now.toISOString() };
  const finish = (status: Live['status'], problem: string | null, startedAt: string | null, people: InCall[] | null, links: GoogleLink[],
    knownAs?: Map<string, string>, why?: Map<string, string>, callLinks?: CallLink[]): Live => {
    const live = buildLive(expected, people, links, knownAs, callLinks);
    const guests = live.guests.map((g) => ({ ...g, why: (g.googleId && why?.get(g.googleId)) || null }));
    const teacher = live.people.find((p) => p.kind === 'teacher') ?? null;
    return {
      ...base, status, problem, callStartedAt: startedAt, teacher, students: live.people.filter((p) => p.kind === 'student'),
      guests, inMeet: live.people.filter((p) => p.kind === 'student' && p.state === 'in_meet').length,
      teacherLate: Boolean(t) && c.minutesIn >= TEACHER_LATE_MINUTES && c.minutesIn <= CLASS_WINDOW.after_minutes
        && (status === 'ok' || status === 'no_call') && teacher?.state !== 'in_meet',
    };
  };
  if (!allowed) return finish('error', 'This class isn\'t one of yours.', null, null, []);
  if (!room) return finish('no_room', null, null, null, []);
  const meet = await askMeet(room.space_name as string, uk.date, c.time);
  if (!meet.ok) return finish('error', meet.problem, null, null, []);
  // No call yet in this class's time: nobody is in it (that is a real answer, not missing data).
  if (!meet.people) return finish('no_call', null, null, [], (savedLinks ?? []) as GoogleLink[]);

  // Phone and signed-out callers linked for this call (This is…, this class only).
  const { data: callLinks } = meet.people.some((p) => !p.googleId)
    ? await admin.from('meet_call_guests').select('participant_name, kind, display_name, student_id, teacher_id')
      .eq('batch_id', c.batchId).in('conference_name', meet.conferences)
    : { data: [] };

  let links = (savedLinks ?? []) as GoogleLink[];
  const linked = new Set(links.map((l) => l.google_user_id));
  let unknown = [...new Set(meet.people.map((p) => p.googleId).filter((id): id is string => Boolean(id) && !linked.has(id!)))];
  const why = new Map<string, string>();
  if (unknown.length && !classroom?.course_id) {
    for (const id of unknown) why.set(id, 'This batch\'s class wasn\'t made with Create Google Classroom, so the app has no class list to look in.');
  }
  if (unknown.length && classroom?.course_id) {
    const { links: found, why: reasons } = await linkFromClassroom(classroom.course_id as string, unknown,
      t ? { id: t.id, email: emailKey(t.personal_email) } : null,
      students.map((s) => ({ id: s.id, emails: family(s.family_id).map((g) => emailKey(g.email)).filter(Boolean) as string[] })),
      viewer.kind === 'staff' ? viewer.userId : null, forTeacher);
    links = [...links, ...found];
    for (const [id, text] of reasons) why.set(id, text);
    const now2 = new Set(found.map((l) => l.google_user_id));
    unknown = unknown.filter((id) => !now2.has(id));
  }
  // Accounts linked to someone outside this batch: shown as a guest, by that name for staff. A teacher sees only that
  // it is someone outside the batch (and can't move the link: the office can).
  const knownAs = new Map<string, string>();
  if (unknown.length) {
    const { data: others } = await admin.from('google_people')
      .select('google_user_id, students(first_name, last_name), teachers(first_name, last_name)').in('google_user_id', unknown);
    for (const o of (others ?? []) as unknown as { google_user_id: string; students: Teacher | null; teachers: Teacher | null }[]) {
      const n = fullName(o.students ?? o.teachers);
      if (n) knownAs.set(o.google_user_id, forTeacher ? OUTSIDE_BATCH : n);
    }
  }
  return finish('ok', null, meet.startedAt, meet.people, links, knownAs, why, (callLinks ?? []) as CallLink[]);
}

// What a teacher sees for an account linked to someone outside their batch.
export const OUTSIDE_BATCH = 'someone outside this batch';
