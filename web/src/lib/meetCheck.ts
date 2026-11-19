import 'server-only';
import { after } from 'next/server';
import { CLASS_WINDOW } from '@/lib/classLink';
import { emailKey, linkFromClassroom } from '@/lib/classSchedule';
import { participantSessions } from '@/lib/google/meet';
import {
  buildLive, classTimes, familyAccounts, isFinal, meetFindings, teacherStretches, type CallLink, type Expected, type GoogleLink,
} from '@/lib/liveClass';
import { classCallPeople } from '@/lib/meetCalls';
import { createAdminClient } from '@/lib/supabase/admin';
import { backoffMs } from '@/lib/withinTime';

// Checked in from Google Meet (guide 21, section 15; database: 20261119000002_meet_check_in.sql).
// The server asks Meet who was in a class's calls and saves it with save_meet_check(), which decides the marks:
// a student's first join makes them Present or Late, a Join class press counts only when Meet can't see the class,
// and a mark saved by staff or the teacher is never changed. The teacher's first join, minutes and drop-outs are
// saved too. Nothing runs on a timer. A class is checked:
//   - when someone looks at it: the batch page's attendance, the extra class page, the Class Schedule (live);
//   - on the student login, for the student's own classes today whose check-in has opened;
//   - by the catch-up (catchUpMeetChecks): dashboards, the Attendance page and the student login each check up to
//     3 finished classes from the last 7 days that aren't final yet, after the page has been sent;
//   - every night by Vercel Cron (nightlyMeetChecks, /api/cron/meet-check): every unfinished class of the last 7 days;
//   - by Refresh from Meet, and after "This is…" or "Not them?" on the Class Schedule (force: Google is asked afresh).
// Once a class has ended and been checked ("final"), Google isn't asked about it again (except Refresh from Meet).
// Everything here uses the server's key, so callers must check first that the viewer may see the class.

export type ClassRef = { kind: 'batch'; batchId: string; date: string } | { kind: 'extra'; id: string };
export type CheckResult = {
  state: 'seen' | 'no_call' | 'error'; final: boolean; problem: string | null; checkedIn: number; takenBack: number;
};

const AGAIN_MS = 2 * 60_000; // a class is saved at most every 2 minutes (unless forced)
const KEPT_DAYS = 30;         // Google keeps a call's details for about 30 days, so older classes aren't asked about
const recent = new Map<string, number>();
const finals = new Set<string>(); // classes this server copy knows are final: not looked up again
const running = new Map<string, Promise<CheckResult | null>>();
const keyOf = (ref: ClassRef) => (ref.kind === 'batch' ? `b|${ref.batchId}|${ref.date}` : `x|${ref.id}`);

// Checks one class with Meet and saves what it saw. null: nothing to check (no Meet room made by the app, the
// check-in hasn't opened yet, already final, checked in the last 2 minutes) or it couldn't be saved (logged).
// Two requests for the same class at once share one check.
export function syncClass(ref: ClassRef, { force = false } = {}): Promise<CheckResult | null> {
  const key = keyOf(ref);
  const busy = running.get(key);
  if (busy) return force ? busy.then(() => syncClass(ref, { force })) : busy;
  if (!force && (finals.has(key) || Date.now() - (recent.get(key) ?? 0) < AGAIN_MS)) return Promise.resolve(null);
  const job = check(ref, force)
    .then((r) => {
      if (r === FINAL || r?.final) {
        if (finals.size > 2000) finals.clear();
        finals.add(key);
      }
      return r === FINAL ? null : r;
    })
    .catch((e) => { console.error('Check-in from Meet:', e); return null; })
    .finally(() => {
      running.delete(key);
      if (recent.size > 500) recent.clear();
      recent.set(key, Date.now());
    });
  running.set(key, job);
  return job;
}

type Student = { id: string; familyId: string | null };
type Lookup = {
  space: string | null; opens: Date; closes: Date; teacherId: string | null; students: Student[];
  courseId: string | null; batchId: string | null; date: string | null; final: boolean; checkedAt: string | null;
};

// The class as the database has it (null: no such class, cancelled, or no class that day).
async function lookUp(ref: ClassRef): Promise<Lookup | null> {
  const db = createAdminClient();
  if (ref.kind === 'extra') {
    const [{ data: c }, { data: list }, { data: check, error: checkError }] = await Promise.all([
      db.from('extra_classes').select('id, teacher_id, starts_at, ends_at, meet_space_name, cancelled_at').eq('id', ref.id).maybeSingle(),
      db.from('extra_class_students').select('student_id, students(family_id)').eq('extra_class_id', ref.id),
      db.from('meet_checks').select('final, checked_at').eq('extra_class_id', ref.id).maybeSingle(),
    ]);
    // checkError: the check-in script (20261119000002_meet_check_in.sql) hasn't run here yet, so Google isn't asked.
    if (!c || c.cancelled_at || checkError) return null;
    return {
      space: c.meet_space_name as string | null, teacherId: c.teacher_id as string | null,
      opens: new Date(Date.parse(c.starts_at as string) - CLASS_WINDOW.before_minutes * 60_000), closes: new Date(c.ends_at as string),
      students: ((list ?? []) as unknown as { student_id: string; students: { family_id: string | null } | null }[])
        .map((s) => ({ id: s.student_id, familyId: s.students?.family_id ?? null })),
      courseId: null, batchId: null, date: null, final: Boolean(check?.final), checkedAt: (check?.checked_at as string | undefined) ?? null,
    };
  }
  const { batchId, date } = ref;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  const [{ data: batch }, { data: room }, { data: session }, { data: slots }, { data: check, error: checkError }, { data: enrols }, { data: classroom }] = await Promise.all([
    db.from('batches').select('id, teacher_id').eq('id', batchId).maybeSingle(),
    db.from('batch_meet_rooms').select('space_name').eq('batch_id', batchId).maybeSingle(),
    db.from('class_sessions').select('start_time').eq('batch_id', batchId).eq('class_date', date).maybeSingle(),
    db.from('batch_slots').select('start_time').eq('batch_id', batchId).eq('weekday', weekday).order('start_time').limit(1),
    db.from('meet_checks').select('final, checked_at').eq('batch_id', batchId).eq('class_date', date).maybeSingle(),
    db.from('enrolments').select('student_id, students(family_id)').eq('batch_id', batchId).lte('started_on', date)
      .or(`ended_on.is.null,ended_on.gte.${date}`),
    db.from('batch_classrooms').select('course_id').eq('batch_id', batchId).maybeSingle(),
  ]);
  const time = ((session?.start_time as string | undefined) ?? (slots?.[0]?.start_time as string | undefined))?.slice(0, 5);
  if (!batch || !time || checkError) return null;
  const { opens, closes } = classTimes(date, time, CLASS_WINDOW);
  const students = new Map(((enrols ?? []) as unknown as { student_id: string; students: { family_id: string | null } | null }[])
    .map((e) => [e.student_id, { id: e.student_id, familyId: e.students?.family_id ?? null }]));
  return {
    space: (room?.space_name as string | undefined) ?? null, teacherId: batch.teacher_id as string | null, opens, closes,
    students: [...students.values()], courseId: (classroom?.course_id as string | undefined) ?? null, batchId, date,
    final: Boolean(check?.final), checkedAt: (check?.checked_at as string | undefined) ?? null,
  };
}

const FINAL = Symbol('final'); // check(): the class is already final, so it needn't be looked up again

async function check(ref: ClassRef, force: boolean): Promise<CheckResult | null | typeof FINAL> {
  const db = createAdminClient();
  const now = new Date();
  const cls = await lookUp(ref);
  // No Meet room made by the app: Meet can't see the class, so the Join class press counts (nothing to save).
  if (!cls || !cls.space || now < cls.opens) return null;
  if (now.getTime() - cls.closes.getTime() > KEPT_DAYS * 86_400_000) return FINAL;
  if (!force && cls.final) return FINAL;
  if (!force && cls.checkedAt && now.getTime() - Date.parse(cls.checkedAt) < AGAIN_MS) return null;

  const base = ref.kind === 'batch' ? { kind: 'batch', batch_id: ref.batchId, class_date: ref.date } : { kind: 'extra', extra_class_id: ref.id };
  const save = async (p: Record<string, unknown>): Promise<CheckResult | null> => {
    const { data, error } = await db.rpc('save_meet_check', { p: { ...base, ...p } });
    if (error) {
      // Not run yet on this database (20261119000002_meet_check_in.sql): nothing to save to.
      if (error.code !== 'PGRST202') console.error('Saving the check-in from Meet:', error.message);
      return null;
    }
    const r = (data ?? {}) as { checked_in?: number; taken_back?: number };
    return {
      state: p.state as CheckResult['state'], final: Boolean(p.final), problem: (p.problem as string | undefined) ?? null,
      checkedIn: r.checked_in ?? 0, takenBack: r.taken_back ?? 0,
    };
  };

  const found = await classCallPeople(cls.space, cls.opens, cls.closes, force);
  // Google couldn't be asked: the press counts for now, and the class is asked again later (never final).
  if (!found.ok) return save({ state: 'error', problem: found.problem, final: false, students: [], teacher: null });
  const final = isFinal(found.calls, cls.closes, now);
  if (found.calls.length === 0) return save({ state: 'no_call', final, calls: 0, unknown: 0, students: [], teacher: null });

  // Who is who: saved Google account links, the Classroom class list for accounts not linked yet (weekly classes),
  // and phone or signed-out callers linked for one call with "This is…".
  const ids = cls.students.map((s) => s.id);
  const anyCaller = found.people.some((p) => !p.googleId);
  const [{ data: saved }, { data: callLinks }] = await Promise.all([
    ids.length || cls.teacherId
      ? db.from('google_people').select('google_user_id, student_id, teacher_id')
        .or([ids.length ? `student_id.in.(${ids.join(',')})` : '', cls.teacherId ? `teacher_id.eq.${cls.teacherId}` : ''].filter(Boolean).join(','))
      : Promise.resolve({ data: [] }),
    cls.batchId && anyCaller
      ? db.from('meet_call_guests').select('participant_name, kind, display_name, student_id, teacher_id')
        .eq('batch_id', cls.batchId).in('conference_name', found.calls.map((c) => c.name))
      : Promise.resolve({ data: [] }),
  ]);
  let links = (saved ?? []) as GoogleLink[];
  const linked = new Set(links.map((l) => l.google_user_id));
  let notLinked = [...new Set(found.people.map((p) => p.googleId).filter((id): id is string => Boolean(id) && !linked.has(id!)))];
  if (notLinked.length && cls.courseId) {
    const familyIds = [...new Set(cls.students.map((s) => s.familyId).filter(Boolean))] as string[];
    const [{ data: teacher }, { data: guardians }] = await Promise.all([
      cls.teacherId ? db.from('teachers').select('id, personal_email').eq('id', cls.teacherId).maybeSingle() : Promise.resolve({ data: null }),
      familyIds.length ? db.from('guardians').select('family_id, email').in('family_id', familyIds) : Promise.resolve({ data: [] }),
    ]);
    const emails = (familyId: string | null) => ((guardians ?? []) as { family_id: string; email: string | null }[])
      .filter((g) => g.family_id === familyId).map((g) => emailKey(g.email)).filter(Boolean) as string[];
    const { links: more } = await linkFromClassroom(cls.courseId, notLinked,
      teacher ? { id: teacher.id as string, email: emailKey(teacher.personal_email as string | null) } : null,
      cls.students.map((s) => ({ id: s.id, emails: emails(s.familyId) })), null, false);
    links = [...links, ...more];
    const now2 = new Set(more.map((l) => l.google_user_id));
    notLinked = notLinked.filter((id) => !now2.has(id));
  }
  // Accounts linked to someone outside the class can't be one of its students, so they aren't "unidentified",
  // except one linked to a brother or sister of a student in this class: a parent's account the children may share.
  const { data: elsewhereRows } = notLinked.length
    ? await db.from('google_people').select('google_user_id, students(family_id)').in('google_user_id', notLinked)
    : { data: [] };

  const expected: Expected[] = [
    ...(cls.teacherId ? [{ id: cls.teacherId, kind: 'teacher' as const, name: '' }] : []),
    ...cls.students.map((s) => ({ id: s.id, kind: 'student' as const, name: '' })),
  ];
  const live = buildLive(expected, found.people, links, new Map(), (callLinks ?? []) as CallLink[]);
  const family = familyAccounts(cls.students, found.people, links,
    (elsewhereRows ?? []) as unknown as { google_user_id: string; students: { family_id: string | null } | null }[]);
  const seen = meetFindings(live, family.knownElsewhere);
  const shared = family.shared;

  // The teacher's minutes and drop-outs, once the class is over (each stretch in the call is one more Google call).
  let teacher: Record<string, unknown> | null = null;
  if (seen.teacher) {
    let minutes: number | null = null;
    let drops: number | null = null;
    if (final) {
      try {
        const stretches = (await Promise.all(seen.teacher.participantIds.map((id) => participantSessions(id)))).flat();
        ({ minutes, drops } = teacherStretches(stretches, now));
      } catch (e) {
        console.error('Teacher\'s time in the Meet call:', e);
      }
    }
    teacher = { id: seen.teacher.id, first_join: seen.teacher.first_join, last_leave: seen.teacher.last_leave, minutes, drops };
  }
  // force: Google was asked afresh, so the list is the whole truth (a join saved before for someone no longer
  // matched, after "Not them?", is forgotten).
  return save({ state: 'seen', final, calls: found.calls.length, unknown: seen.unknown + shared, students: seen.students, teacher, replace: force });
}

// ---------- The catch-up: finished classes nobody looked at ----------
// Up to 3 finished classes from the last 7 days that aren't final yet, oldest first, one after the other (so Google
// is never asked many things at once). At most once a minute per server copy. Call it with after() from next/server
// so the page is sent first.
let lastCatchUp = 0;
export async function catchUpMeetChecks() {
  if (Date.now() - lastCatchUp < 60_000) return;
  lastCatchUp = Date.now();
  const { data, error } = await createAdminClient().rpc('meet_checks_due', { p_days: 7, p_limit: 3 });
  if (error) {
    if (error.code !== 'PGRST202') console.error('Check-in from Meet catch-up:', error.message);
    return;
  }
  for (const r of (data ?? []) as { kind: string; batch_id: string | null; class_date: string | null; extra_class_id: string | null }[]) {
    if (r.kind === 'batch' && r.batch_id && r.class_date) await syncClass({ kind: 'batch', batchId: r.batch_id, date: r.class_date });
    else if (r.kind === 'extra' && r.extra_class_id) await syncClass({ kind: 'extra', id: r.extra_class_id });
  }
}

// For pages: once the page has been sent, check these classes (the Class Schedule's classes on now) and then run the
// catch-up, so nobody waits for Google. Uses the server's key only (no cookies after the page is sent).
export function checkAfterPage(refs: ClassRef[] = []) {
  after(async () => {
    for (const ref of refs) await syncClass(ref);
    await catchUpMeetChecks();
  });
}

// ---------- The nightly check (Vercel Cron, web/vercel.json; guide 21, section 15) ----------
// Every finished class of the last 7 days that isn't final yet, so no class depends on someone opening a page.
// One class at a time. When Google couldn't be asked, it waits (truncated exponential backoff, as Google
// recommends) and asks again, up to 3 more times; a class still failing is asked again the next night (and stays in
// Needs attention). Stops before `deadline` (ms since 1970) so the run ends inside Vercel's time limit.
export async function nightlyMeetChecks(deadline: number) {
  const tally = { checked: 0, final: 0, failed: 0, left: 0 };
  const done = new Set<string>();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (;;) {
    const { data, error } = await createAdminClient().rpc('meet_checks_due', { p_days: 7, p_limit: 20 });
    if (error) throw new Error(`meet_checks_due: ${error.message}`);
    const due = ((data ?? []) as { kind: string; batch_id: string | null; class_date: string | null; extra_class_id: string | null }[])
      .map((r): ClassRef | null => (r.kind === 'batch' && r.batch_id && r.class_date ? { kind: 'batch', batchId: r.batch_id, date: r.class_date }
        : r.kind === 'extra' && r.extra_class_id ? { kind: 'extra', id: r.extra_class_id } : null))
      .filter((r): r is ClassRef => r !== null && !done.has(keyOf(r)));
    if (due.length === 0) return tally;
    for (const [i, ref] of due.entries()) {
      if (Date.now() > deadline) return { ...tally, left: due.length - i };
      done.add(keyOf(ref));
      let r = await syncClass(ref);
      for (let attempt = 0; r?.state === 'error' && attempt < 3 && Date.now() + backoffMs(attempt) < deadline; attempt++) {
        await sleep(backoffMs(attempt));
        r = await syncClass(ref, { force: true });
      }
      tally.checked++;
      if (r?.final) tally.final++;
      if (r?.state === 'error') tally.failed++;
    }
  }
}
