// The Dashboard's working out (guide 28), kept apart from the database so it can be tested on its own
// (model.test.ts, npm test): where each class is today, what Live now shows, Next up, the timeline, and the
// Needs you ranking with its links. The numbers themselves come ready-made from dashboard_today() and
// dashboard_summary() (supabase/migrations/20261121000001_dashboard_summary.sql). All times are UK times.

import { clock12 } from '../../../lib/format.ts';

// ---------- What the database sends ----------
export type MeetCheck = { state: 'seen' | 'no_call' | 'no_room' | 'error'; checked_at: string; final: boolean; unknown_guests: number };
export type TeacherMeet = { first_join: string | null; last_leave: string | null; status: string };
export type TodayClass = {
  kind: 'batch' | 'extra'; id: string; code: string; name: string | null; subject: string | null; teacher: string | null;
  start: string; end: string | null; // "16:00"; end only for extra classes (weekly classes last the check-in time)
  has_room: boolean; expected: number; checked_in: number; taken: boolean;
  meet: MeetCheck | null; teacher_meet: TeacherMeet | null;
};
export type TodayData = {
  role: 'staff' | 'teacher'; date: string; classes: TodayClass[];
  missing: { batch_id: string; code: string; start: string }[];
};

type Trend = (number | null)[];
export type SummaryData = {
  role: 'staff' | 'teacher'; date: string; week_start: string; school_year: number;
  tiles: {
    students: { current: number; active: number; trial: number; new_28: number; left_28: number; trend: Trend };
    attendance: { marks: number; here: number; late: number; expected: number; recorded: number; trend: Trend };
    homework: { due: number; on_time: number; to_mark: number; overdue: number; trend: Trend };
    enquiries: {
      open: number; new_week: number; enrolled: number; decided: number; trend: Trend;
      stages: Record<string, number>;
    } | null;
  };
  needs: Partial<Record<NeedKey, NeedGroup>>;
  glance: {
    classes_held: number; submitted: number; corrected: number;
    places: { used: number; seats: number; batches: number; nearly_full: { batch_id: string; code: string; members: number; capacity: number }[] } | null;
  };
};
// One Needs you group as the database sends it: how many, the oldest date (for the order) and the first 3.
// Items are kept loose (each kind has its own fields); itemText and itemHref below read them.
export type NeedItem = Record<string, string | number | string[] | null>;
export type NeedGroup = { total: number; oldest?: string | null; items: NeedItem[] };

// ---------- The clock ----------
export const CLASS_MINUTES = 60;     // a weekly class's check-in time after its start (class_window().after_minutes)
export const SOON_MINUTES = 15;      // check-in opens this long before (class_window().before_minutes)
export const TEACHER_LATE = 5;       // the teacher is late after this (teacher_late_minutes())
export const LOW_CHECK_IN_AFTER = 10; // "low check-in" only once the class has run this long

export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Where a class is now: later, soon (check-in open), live or done. minutesIn: since its start (negative before).
export function classState(c: Pick<TodayClass, 'start' | 'end'>, nowMinute: number) {
  const start = minutesOf(c.start);
  const end = c.end ? Math.max(minutesOf(c.end), start) : start + CLASS_MINUTES;
  const minutesIn = nowMinute - start;
  const state = minutesIn < -SOON_MINUTES ? 'later' : minutesIn < 0 ? 'soon' : nowMinute <= end ? 'live' : 'done';
  return { state: state as 'later' | 'soon' | 'live' | 'done', minutesIn, endMinute: end };
}

// ---------- Live now ----------
// What the saved Meet records say about a class on now. Never "late" from a missing record: a class nobody has
// checked yet says so, and "Not seen" always gives the time of the last check (the outside review, guide 28).
export type LiveStatus = {
  kind: 'in_call' | 'left' | 'not_seen' | 'not_checked' | 'error' | 'no_room';
  text: string; problem: boolean; lowCheckIn: boolean;
};

export function liveStatus(c: TodayClass, minutesIn: number, startedAt: Date, ukClock: (iso: string) => string): LiveStatus {
  const lowCheckIn = minutesIn >= LOW_CHECK_IN_AFTER && c.expected > 0 && c.checked_in * 2 < c.expected;
  const base = { lowCheckIn };
  if (!c.has_room) return { ...base, kind: 'no_room', text: 'No Meet room: Meet can’t see this class', problem: lowCheckIn };
  const checked = c.meet && Date.parse(c.meet.checked_at) >= startedAt.getTime() - SOON_MINUTES * 60_000 ? c.meet : null;
  const t = c.teacher_meet;
  if (t?.first_join && checked) {
    if (t.last_leave && Date.parse(t.last_leave) > Date.parse(t.first_join)) {
      return { ...base, kind: 'left', text: `Teacher left at ${ukClock(t.last_leave)}`, problem: true };
    }
    return { ...base, kind: 'in_call', text: t.status === 'late' ? 'Teacher in call · joined late' : 'Teacher in call', problem: lowCheckIn };
  }
  if (!checked) return { ...base, kind: 'not_checked', text: 'Not checked yet', problem: lowCheckIn };
  if (checked.state === 'error') return { ...base, kind: 'error', text: 'Meet check failed', problem: true };
  return {
    ...base, kind: 'not_seen', text: `Teacher not seen at ${ukClock(checked.checked_at)}`,
    problem: minutesIn >= TEACHER_LATE || lowCheckIn,
  };
}

export type LiveClass = TodayClass & { minutesIn: number; status: LiveStatus };

// Always 3 cards: classes with a problem first (then by start time), or the first 3 live classes by start time
// when nothing is wrong; then one row of up to 6 small tiles; "See all" covers the rest.
export function pickLive(live: LiveClass[]) {
  const byStart = (a: LiveClass, b: LiveClass) => a.start.localeCompare(b.start) || a.code.localeCompare(b.code);
  const problems = live.filter((c) => c.status.problem).sort(byStart);
  const fine = live.filter((c) => !c.status.problem).sort(byStart);
  const ordered = [...problems, ...fine];
  return {
    cards: ordered.slice(0, 3),
    tiles: ordered.slice(3, 9),
    more: Math.max(ordered.length - 9, 0),
    counts: {
      total: live.length,
      fine: fine.length,
      notSeen: live.filter((c) => c.status.kind === 'not_seen' && c.status.problem).length,
      left: live.filter((c) => c.status.kind === 'left').length,
      failed: live.filter((c) => c.status.kind === 'error').length,
      low: live.filter((c) => c.status.lowCheckIn).length,
    },
  };
}

// The count line over the cards: "17 running normally · 2 teachers not seen in the call · 1 low check-in".
export function liveSummary(c: ReturnType<typeof pickLive>['counts']) {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts: string[] = [];
  if (c.fine) parts.push(c.fine === c.total ? `All ${c.total} running normally` : `${c.fine} running normally`);
  if (c.notSeen) parts.push(plural(c.notSeen, 'teacher not seen in the call', 'teachers not seen in the call'));
  if (c.left) parts.push(plural(c.left, 'teacher left the call', 'teachers left the call'));
  if (c.failed) parts.push(plural(c.failed, 'Meet check failed', 'Meet checks failed'));
  if (c.low) parts.push(plural(c.low, 'low check-in', 'low check-ins'));
  return parts;
}

// ---------- Next up ----------
// Only the next start time with its classes, then how many more are later today and when the next two start.
export function nextUp(upcoming: TodayClass[]) {
  const sorted = [...upcoming].sort((a, b) => a.start.localeCompare(b.start) || a.code.localeCompare(b.code));
  if (sorted.length === 0) return null;
  const first = sorted[0].start;
  const now = sorted.filter((c) => c.start === first);
  const later = sorted.filter((c) => c.start !== first);
  return { start: first, classes: now, laterCount: later.length, laterTimes: [...new Set(later.map((c) => c.start))].slice(0, 2) };
}

// ---------- Timeline ----------
// Today's classes per half hour, from the first start to the last end, with where "now" falls.
export function timeline(classes: TodayClass[], nowMinute: number) {
  if (classes.length === 0) return null;
  const starts = classes.map((c) => minutesOf(c.start));
  const ends = classes.map((c) => classState(c, nowMinute).endMinute);
  const from = Math.floor(Math.min(...starts) / 30) * 30;
  const to = Math.max(Math.ceil(Math.max(...ends) / 30) * 30, from + 30);
  const slots: { at: string; count: number; when: 'past' | 'now' | 'future' }[] = [];
  for (let m = from; m < to; m += 30) {
    slots.push({
      at: hhmm(m),
      count: starts.filter((s) => s >= m && s < m + 30).length,
      when: nowMinute >= m + 30 ? 'past' : nowMinute >= m ? 'now' : 'future',
    });
  }
  const nowAt = nowMinute < from ? 0 : nowMinute >= to ? 100 : (100 * (nowMinute - from)) / (to - from);
  return { slots, from: hhmm(from), to: hhmm(to), nowAt, max: Math.max(...slots.map((s) => s.count), 1) };
}

// ---------- Needs you ----------
export type NeedKey =
  | 'attendance_missing' | 'meet_review' | 'teacher_late' | 'to_mark' | 'not_sent' | 'falling_behind'
  | 'absence_streak' | 'lesson_behind' | 'extra_classes' | 'student_setup' | 'enquiry_waiting' | 'batch_full';
export type Tone = 'red' | 'amber' | 'blue';
export type Area = 'classes' | 'homework' | 'students';

type NeedInfo = { title: string; tone: Tone; area: Area; unit: [string, string]; all: string; allLabel: string };
export const NEEDS: Record<NeedKey, NeedInfo> = {
  attendance_missing: { title: 'Attendance not taken', tone: 'red', area: 'classes', unit: ['class', 'classes'], all: '/attendance?tab=attention', allLabel: 'Attendance' },
  falling_behind: { title: 'Falling behind on homework', tone: 'red', area: 'homework', unit: ['student', 'students'], all: '/homework-tracker', allLabel: 'Homework Tracker' },
  absence_streak: { title: 'Absent 3 classes in a row', tone: 'red', area: 'students', unit: ['student', 'students'], all: '/attendance?tab=attention', allLabel: 'Attendance' },
  meet_review: { title: 'Meet check to review', tone: 'amber', area: 'classes', unit: ['class', 'classes'], all: '/attendance?tab=attention', allLabel: 'Attendance' },
  teacher_late: { title: 'Teacher late or not in the call', tone: 'amber', area: 'classes', unit: ['teacher', 'teachers'], all: '/attendance?tab=teachers&range=week', allLabel: 'Teachers' },
  to_mark: { title: 'To mark', tone: 'amber', area: 'homework', unit: ['homework', 'homework'], all: '/homework-tracker', allLabel: 'Homework Tracker' },
  lesson_behind: { title: 'Lesson Tracker behind', tone: 'amber', area: 'classes', unit: ['batch', 'batches'], all: '/batches', allLabel: 'Batches' },
  extra_classes: { title: 'Extra classes', tone: 'amber', area: 'classes', unit: ['class', 'classes'], all: '/extra-classes', allLabel: 'Extra classes' },
  student_setup: { title: 'Student setup', tone: 'amber', area: 'students', unit: ['student', 'students'], all: '/students', allLabel: 'Students' },
  not_sent: { title: 'Corrected, not sent', tone: 'blue', area: 'homework', unit: ['homework', 'homework'], all: '/homework-tracker', allLabel: 'Homework Tracker' },
  enquiry_waiting: { title: 'Enquiry waiting', tone: 'blue', area: 'students', unit: ['enquiry', 'enquiries'], all: '/enquiries', allLabel: 'Enquiries' },
  batch_full: { title: 'Batch full', tone: 'blue', area: 'students', unit: ['batch', 'batches'], all: '/batches', allLabel: 'Batches' },
};
const TONE_ORDER: Record<Tone, number> = { red: 0, amber: 1, blue: 2 };
export const TOP_GROUPS = 5;

// The filter chips (?show=…). No chip: the 5 most urgent groups. "all": every group.
export const SHOW_CHIPS = { all: 'All', classes: 'Classes', homework: 'Homework', students: 'Students' } as const;
export type Show = keyof typeof SHOW_CHIPS | null;
export const readShow = (v: string | string[] | undefined): Show => {
  const s = Array.isArray(v) ? v[0] : v;
  return s && Object.hasOwn(SHOW_CHIPS, s) ? (s as Show) : null;
};

export type RankedNeed = NeedInfo & NeedGroup & { key: NeedKey };

// Every group with something in it, most urgent first: red, amber, blue; then the oldest; then by name (so the
// order never jumps between visits). Totals are kept on every group, shown or not.
export function rankNeeds(needs: SummaryData['needs'], show: Show = null) {
  const all: RankedNeed[] = (Object.keys(NEEDS) as NeedKey[])
    .filter((k) => (needs[k]?.total ?? 0) > 0)
    .map((k) => ({ key: k, ...NEEDS[k], ...needs[k]! }))
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]
      || (a.oldest ?? '9999').localeCompare(b.oldest ?? '9999')
      || a.title.localeCompare(b.title));
  const inArea = show && show !== 'all' ? all.filter((g) => g.area === show) : all;
  const shown = show ? inArea : inArea.slice(0, TOP_GROUPS);
  const hidden = inArea.slice(shown.length);
  const areaTotals = Object.fromEntries((Object.keys(SHOW_CHIPS) as (keyof typeof SHOW_CHIPS)[])
    .map((a) => [a, all.filter((g) => a === 'all' || g.area === a).length])) as Record<keyof typeof SHOW_CHIPS, number>;
  return { shown, hidden, total: all.length, areaTotals };
}

// The words for a group's count: "3 classes", "1 student".
export const countText = (g: Pick<RankedNeed, 'total' | 'unit'>) => `${g.total} ${g.total === 1 ? g.unit[0] : g.unit[1]}`;

const str = (v: unknown) => (v == null ? '' : String(v));
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// "2026-11-16" → "Mon 16 Nov".
export function shortDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
}
const daysSince = (date: string, today: string) => Math.max(Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000), 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// One item's words, for the row under its group.
export function itemText(key: NeedKey, i: NeedItem, today: string): { main: string; sub: string } {
  switch (key) {
    case 'attendance_missing': return { main: str(i.code), sub: `${shortDay(str(i.class_date))}, ${clock12(str(i.start))}` };
    case 'meet_review': return {
      main: str(i.code),
      sub: `${shortDay(str(i.class_date))} · ${i.why === 'error' ? 'the check failed' : plural(Number(i.unknown_guests) || 1, 'unknown guest')}`,
    };
    case 'teacher_late': return { main: str(i.name), sub: `${plural(Number(i.n), 'class', 'classes')} this week` };
    case 'to_mark': return { main: str(i.name), sub: `${str(i.code)} · ${str(i.title)} · waiting ${plural(daysSince(str(i.since), today), 'day')}` };
    case 'not_sent': return { main: str(i.name), sub: `${str(i.code)} · ${str(i.title)}` };
    case 'falling_behind': return { main: str(i.name), sub: `${str(i.batches)} · ${i.overdue} overdue` };
    case 'absence_streak': return { main: str(i.name), sub: `${str(i.batch_code)} · ${i.absences} in a row since ${shortDay(str(i.since))}` };
    case 'lesson_behind': return { main: str(i.code), sub: `${plural(Number(i.classes), 'class', 'classes')} behind, since ${shortDay(str(i.oldest))}` };
    case 'extra_classes': return {
      main: str(i.code),
      sub: i.what === 'no_show' ? 'Nobody came: create a catch-up?' : 'Attendance to take',
    };
    case 'student_setup': return {
      main: str(i.name),
      sub: i.what === 'no_class' ? 'No class yet' : i.what === 'no_batch' ? 'Needs a batch' : 'Needs a teacher',
    };
    case 'enquiry_waiting': return { main: str(i.name), sub: `No stage change for ${plural(Number(i.days), 'day')}` };
    case 'batch_full': return { main: str(i.code), sub: `${i.members} of ${i.capacity} places` };
  }
}

// Where an item opens: the page that sorts it out.
export function itemHref(key: NeedKey, i: NeedItem): string {
  const q = encodeURIComponent;
  switch (key) {
    case 'attendance_missing': return `/batches/${str(i.batch_id)}?class_date=${q(str(i.class_date))}#attendance`;
    case 'meet_review': return i.kind === 'extra'
      ? `/extra-classes/${str(i.extra_class_id)}`
      : `/batches/${str(i.batch_id)}?class_date=${q(str(i.class_date))}#attendance`;
    case 'teacher_late': return `/attendance?tab=teachers&range=week&teacher=${str(i.teacher_id)}`;
    case 'to_mark':
    case 'not_sent': return `/batches/${str(i.batch_id)}/mark?sheet=${str(i.sheet_id)}&student=${str(i.student_id)}`;
    case 'falling_behind': return `/homework-tracker?student=${str(i.student_id)}&scope=all`;
    case 'absence_streak': return `/students/${str(i.student_id)}`;
    case 'lesson_behind': return `/batches/${str(i.batch_id)}/lesson-tracker`;
    case 'extra_classes': return `/extra-classes/${str(i.id)}`;
    case 'student_setup': return `/students/${str(i.id)}`;
    case 'enquiry_waiting': return `/enquiries/${str(i.id)}`;
    case 'batch_full': return `/batches/${str(i.batch_id)}`;
  }
}

// ---------- Tiles ----------
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : null);

// The change against the last complete week, for the small red or green note. null: nothing to compare
// (also when there is no trend at all, e.g. an empty database or a teacher with no students yet).
export function change(now: number | null, trend: Trend | null | undefined) {
  const last = trend?.at(-1);
  if (now == null || last == null) return null;
  return Math.round(now - last);
}
