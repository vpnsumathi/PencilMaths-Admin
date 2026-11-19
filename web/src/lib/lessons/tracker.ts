// Lesson Tracker: works out a planned date for every class of a batch's lesson plan (guide 14, section 12).
//
// Pure functions with no imports, so the same code runs on the server (Set Lesson Tracker), in the browser
// (the preview in the pop-up) and in the unit tests (tracker.test.ts). It runs once, when an admin presses
// Set Lesson Tracker; pages only read the saved dates. The database checks the result again
// (set_lesson_tracker in 20261119000001_lesson_tracker.sql), so the two must follow the same rules:
//
//   1. Classes are identified by term + Class No. Lessons with the same term and Class No. share one date.
//      Lessons without a Class No. get no date and use up no teaching day.
//   2. Classes are planned Term 1 first, then Term 2, then Term 3, and by Class No. inside each term.
//   3. The first class gets the first selected weekday on or after the start date; each next class gets the
//      next selected weekday, skipping holidays: 21 Dec–1 Jan, Maundy Thursday–Easter Sunday, and every day
//      on or after 21 July (the first 21 July after the start date).
//
// Dates are plain "YYYY-MM-DD" strings, counted as whole days in UTC, so clock changes can never move a date.

export type Scope = 'whole_year' | 'remaining';
export type ClassState = 'planned' | 'unplaced' | 'done_before';
export type TrackerLesson = { term: number; classNo: number | null; done?: boolean };
export type PlannedClass = { term: number; classNo: number; state: ClassState; plannedOn: string | null };
export type Plan = {
  classes: PlannedClass[];
  cutoff: string;          // the first day with no classes (21 July)
  noClassNo: number;       // lessons without a Class No. (they get no date)
  teachingDays: number;    // teaching days available from the start date to the cut-off
  holidays: Holiday[];     // holidays between the start date and the cut-off, for the preview
};
export type Holiday = { name: 'Christmas' | 'Easter'; from: string; to: string };

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// "2026-11-16" → whole days since 1970-01-01, and back.
export function dayNumber(date: string): number {
  if (!ISO_DATE.test(date)) throw new Error(`Not a date: ${date}`);
  const [y, m, d] = date.split('-').map(Number);
  const n = Date.UTC(y, m - 1, d);
  const back = new Date(n);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) throw new Error(`Not a date: ${date}`);
  return n / DAY;
}
export function dateOf(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}
export function addDays(date: string, days: number): string {
  return dateOf(dayNumber(date) + days);
}
// 1 = Monday … 7 = Sunday (as in batch_slots and the database's isodow).
export function weekdayOf(date: string): number {
  const d = new Date(dayNumber(date) * DAY).getUTCDay();
  return d === 0 ? 7 : d;
}

// Easter Sunday of a year, Gregorian calendar ("Anonymous" / Meeus algorithm).
const easterCache = new Map<number, string>();
export function easterSunday(year: number): string {
  const cached = easterCache.get(year);
  if (cached) return cached;
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  easterCache.set(year, result);
  return result;
}

// Christmas: 21 December to 1 January inclusive, by month and day only, so it works across the year boundary.
export function isChristmas(date: string): boolean {
  const m = Number(date.slice(5, 7)), d = Number(date.slice(8, 10));
  return (m === 12 && d >= 21) || (m === 1 && d === 1);
}
// Easter break: Maundy Thursday (Easter Sunday - 3) to Easter Sunday inclusive, for that date's own year.
export function isEaster(date: string): boolean {
  const n = dayNumber(date), e = dayNumber(easterSunday(Number(date.slice(0, 4))));
  return n >= e - 3 && n <= e;
}
export function holidayOf(date: string): Holiday['name'] | null {
  return isChristmas(date) ? 'Christmas' : isEaster(date) ? 'Easter' : null;
}

// No classes on or after 21 July: the first 21 July after the start date.
export function cutoffFor(start: string): string {
  const year = Number(start.slice(0, 4));
  return start < `${year}-07-21` ? `${year}-07-21` : `${year + 1}-07-21`;
}

// Every teaching day from the start date up to (not including) the cut-off.
export function teachingDays(start: string, weekdays: number[]): string[] {
  const days: string[] = [];
  const wanted = new Set(weekdays);
  const end = dayNumber(cutoffFor(start));
  for (let n = dayNumber(start); n < end; n++) {
    const date = dateOf(n);
    if (wanted.has(weekdayOf(date)) && !holidayOf(date)) days.push(date);
  }
  return days;
}

// The holidays that fall between the start date and the cut-off, e.g. for "Skips Christmas (21 Dec–1 Jan)".
export function holidaysBetween(start: string, cutoff: string): Holiday[] {
  const list: Holiday[] = [];
  for (let n = dayNumber(start), end = dayNumber(cutoff); n < end; n++) {
    const date = dateOf(n);
    const name = holidayOf(date);
    if (!name) continue;
    const last = list[list.length - 1];
    if (last && last.name === name && dayNumber(last.to) === n - 1) last.to = date;
    else list.push({ name, from: date, to: date });
  }
  return list;
}

export const classKey = (term: number, classNo: number) => `${term}:${classNo}`;

// The classes of a plan: unique term + Class No., Term 1 first, then by Class No. A class is "done" when every
// lesson in it is completed.
export function classesOf(lessons: TrackerLesson[]): { term: number; classNo: number; done: boolean }[] {
  const byKey = new Map<string, { term: number; classNo: number; done: boolean }>();
  for (const l of lessons) {
    if (l.classNo == null) continue;
    const key = classKey(l.term, l.classNo);
    const c = byKey.get(key);
    if (c) c.done = c.done && Boolean(l.done);
    else byKey.set(key, { term: l.term, classNo: l.classNo, done: Boolean(l.done) });
  }
  return [...byKey.values()].sort((a, b) => a.term - b.term || a.classNo - b.classNo);
}

// The plan. "remaining" leaves out classes that are already done ("done before the tracker").
export function planClasses(lessons: TrackerLesson[], start: string, weekdays: number[], scope: Scope = 'whole_year'): Plan {
  dayNumber(start); // throws on a bad date
  const days = teachingDays(start, weekdays);
  const cutoff = cutoffFor(start);
  let next = 0;
  const classes = classesOf(lessons).map(({ term, classNo, done }): PlannedClass => {
    if (scope === 'remaining' && done) return { term, classNo, state: 'done_before', plannedOn: null };
    const plannedOn = days[next++] ?? null;
    return { term, classNo, state: plannedOn ? 'planned' : 'unplaced', plannedOn };
  });
  return {
    classes, cutoff, teachingDays: days.length, holidays: holidaysBetween(start, cutoff),
    noClassNo: lessons.filter((l) => l.classNo == null).length,
  };
}

// Rule 10: checks a finished plan. Returns what is wrong, or nothing. The server runs it before saving.
export function checkPlan(lessons: TrackerLesson[], dates: Map<string, string | null>, start: string, weekdays: number[]): string[] {
  const problems: string[] = [];
  const cutoff = cutoffFor(start);
  const wanted = new Set(weekdays);
  for (const [key, date] of dates) {
    if (!date) continue;
    if (!wanted.has(weekdayOf(date))) problems.push(`Class ${key} is on ${formatTrackerDate(date)}, not a selected teaching day.`);
    if (holidayOf(date)) problems.push(`Class ${key} is on ${formatTrackerDate(date)}, in the ${holidayOf(date)} holiday.`);
    if (date >= cutoff) problems.push(`Class ${key} is on ${formatTrackerDate(date)}, on or after 21 July.`);
    if (date < start) problems.push(`Class ${key} is on ${formatTrackerDate(date)}, before the start date.`);
  }
  // Repeated Class No. rows share one date (they read it from one key); a lesson without one has none.
  for (const l of lessons) {
    if (l.classNo == null) continue;
    if (!dates.has(classKey(l.term, l.classNo))) problems.push(`Class ${classKey(l.term, l.classNo)} is missing from the plan.`);
  }
  const used = new Set([...dates.values()].filter(Boolean));
  if (used.size !== [...dates.values()].filter(Boolean).length) problems.push('Two classes have the same date.');
  return problems;
}

// The date shown for a lesson: "16-Nov-2026 Monday".
export function formatTrackerDate(date: string): string {
  const n = dayNumber(date);
  return `${date.slice(8, 10)}-${MONTHS[Number(date.slice(5, 7)) - 1]}-${date.slice(0, 4)} ${DAY_NAMES[weekdayOf(dateOf(n)) - 1]}`;
}
// "Mon, Thu"
export const weekdayList = (weekdays: number[]) => [...weekdays].sort((a, b) => a - b).map((w) => WEEKDAY_SHORT[w - 1]).join(', ');

// How a lesson stands against its planned date.
export type Standing =
  | { kind: 'early' | 'late'; days: number }
  | { kind: 'on_time' | 'overdue' | 'due_today' | 'upcoming' | 'none' };
export function standing(plannedOn: string | null, completedOn: string | null, today: string): Standing {
  if (!plannedOn) return { kind: 'none' };
  if (completedOn) {
    const diff = dayNumber(completedOn) - dayNumber(plannedOn);
    return diff < 0 ? { kind: 'early', days: -diff } : diff > 0 ? { kind: 'late', days: diff } : { kind: 'on_time' };
  }
  return plannedOn < today ? { kind: 'overdue' } : plannedOn === today ? { kind: 'due_today' } : { kind: 'upcoming' };
}
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export function standingLabel(s: Standing): string {
  switch (s.kind) {
    case 'early': return `Early by ${plural(s.days, 'day')}`;
    case 'late': return `Late by ${plural(s.days, 'day')}`;
    case 'on_time': return 'On time';
    case 'overdue': return 'Overdue';
    case 'due_today': return 'Due today';
    default: return '';
  }
}

// Colour of a lesson's standing: green when completed early or on its date, red when completed late or overdue.
export function standingTone(s: Standing): 'good' | 'bad' | null {
  if (s.kind === 'early' || s.kind === 'on_time') return 'good';
  if (s.kind === 'late' || s.kind === 'overdue') return 'bad';
  return null;
}

// ---------- Reading a saved tracker (batch page, full plan page, Excel export) ----------
// Everything below works on rows the page has already loaded: no extra database work.

export type ViewLesson = { id: string; term: number; classNo: number | null; active: boolean; completedOn: string | null };
export type SavedClass = { term: number; classNo: number; state: ClassState; plannedOn: string | null; lessonIds: string[] };
// Why a lesson has no date, or that the plan changed after the tracker was set.
export type TrackNote = 'no_class' | 'unplaced' | 'done_before' | 'added' | 'removed' | null;
export type LessonTrack = { plannedOn: string | null; note: TrackNote; standing: Standing; changed: boolean };
export type TrackSummary = {
  classes: number; planned: number; unplaced: number; doneBefore: number; noClassNo: number;
  due: number; doneOfDue: number; early: number; onTime: number; late: number; overdue: number; dueToday: number;
  changed: number; first: string | null; last: string | null;
};

export const NOTE_LABEL: Record<Exclude<TrackNote, null>, string> = {
  no_class: 'No class date',
  unplaced: "Doesn't fit before 21 Jul",
  done_before: 'Done before the tracker',
  added: 'Added after the tracker was set',
  removed: 'Removed from the plan',
};

export function trackLessons(lessons: ViewLesson[], saved: SavedClass[], today: string): { byLesson: Map<string, LessonTrack>; summary: TrackSummary } {
  const savedByKey = new Map(saved.map((c) => [classKey(c.term, c.classNo), c]));
  const savedLesson = new Set(saved.flatMap((c) => c.lessonIds));
  const byLesson = new Map<string, LessonTrack>();
  for (const l of lessons) {
    const none: Standing = { kind: 'none' };
    if (!l.active) {
      byLesson.set(l.id, { plannedOn: null, note: 'removed', standing: none, changed: savedLesson.has(l.id) });
    } else if (l.classNo == null) {
      byLesson.set(l.id, { plannedOn: null, note: 'no_class', standing: none, changed: savedLesson.has(l.id) });
    } else {
      const c = savedByKey.get(classKey(l.term, l.classNo));
      if (!c) {
        byLesson.set(l.id, { plannedOn: null, note: 'added', standing: none, changed: true });
      } else {
        const note: TrackNote = c.state === 'unplaced' ? 'unplaced' : c.state === 'done_before' ? 'done_before' : null;
        byLesson.set(l.id, {
          plannedOn: c.plannedOn, note, standing: standing(c.plannedOn, l.completedOn, today), changed: !c.lessonIds.includes(l.id),
        });
      }
    }
  }

  // Per class: done when every active lesson in it is completed, on the day the last one was.
  const summary: TrackSummary = {
    classes: saved.length, planned: 0, unplaced: 0, doneBefore: 0, noClassNo: lessons.filter((l) => l.active && l.classNo == null).length,
    due: 0, doneOfDue: 0, early: 0, onTime: 0, late: 0, overdue: 0, dueToday: 0,
    changed: [...byLesson.values()].filter((t) => t.changed).length, first: null, last: null,
  };
  for (const c of saved) {
    if (c.state === 'unplaced') { summary.unplaced++; continue; }
    if (c.state === 'done_before') { summary.doneBefore++; continue; }
    summary.planned++;
    const date = c.plannedOn as string;
    if (!summary.first || date < summary.first) summary.first = date;
    if (!summary.last || date > summary.last) summary.last = date;
    const inClass = lessons.filter((l) => l.active && l.classNo === c.classNo && l.term === c.term);
    const done = inClass.length > 0 && inClass.every((l) => l.completedOn);
    const doneOn = done ? inClass.map((l) => l.completedOn as string).sort().at(-1)! : null;
    const s = standing(date, doneOn, today);
    if (date <= today) { summary.due++; if (done) summary.doneOfDue++; }
    if (s.kind === 'early') summary.early++;
    else if (s.kind === 'on_time') summary.onTime++;
    else if (s.kind === 'late') summary.late++;
    else if (s.kind === 'overdue') summary.overdue++;
    else if (s.kind === 'due_today') summary.dueToday++;
  }
  return { byLesson, summary };
}

// "Tracker (Mon, Thu from 16-Nov-2026): 9 of 11 classes due so far done (3 early, 4 on time, 2 late) · 2 overdue"
export function summaryLine(s: TrackSummary, tracker: { startOn: string; weekdays: number[] }): string {
  const parts = [`${s.doneOfDue} of ${s.due} class${s.due === 1 ? '' : 'es'} due so far done`];
  const how = [s.early && `${s.early} early`, s.onTime && `${s.onTime} on time`, s.late && `${s.late} late`].filter(Boolean);
  if (how.length) parts[0] += ` (${how.join(', ')})`;
  if (s.overdue) parts.push(`${s.overdue} overdue`);
  if (s.dueToday) parts.push(`${s.dueToday} due today`);
  if (s.unplaced) parts.push(`${s.unplaced} don't fit before 21 Jul`);
  return `Tracker (${weekdayList(tracker.weekdays)} from ${formatTrackerDate(tracker.startOn)}): ${parts.join(' · ')}`;
}

// ---------- The student's Lesson Plan tab (/me/lesson-plan) ----------
// What my_lesson_plan() returns for one class, turned into one row per lesson in plan order. A lesson removed from
// the spreadsheet stays only if the class worked on it. Planned dates appear only once an admin has set the tracker.
export type StudentPlanClass = {
  lessons: { id: string; term: number; module: string; code: string; name: string; class_no: number | null; active: boolean }[];
  progress: { lesson_id: string; status: string; completed_on: string | null }[];
  classes: { term: number; class_no: number; state: ClassState; planned_on: string | null; lesson_ids: string[] }[];
};
export type StudentPlanRow = {
  id: string; term: number; module: string; code: string; name: string;
  active: boolean;                // false: removed from the plan (shown because the class worked on it)
  plannedOn: string | null;
  status: 'not_started' | 'in_progress' | 'complete';
  completedOn: string | null;
  tone: 'good' | 'bad' | null;   // completed lessons only: green on or before the date, red after it
};

export function studentPlanRows(plan: StudentPlanClass, today: string): StudentPlanRow[] {
  const progress = new Map(plan.progress.map((p) => [p.lesson_id, p]));
  const kept = plan.lessons.filter((l) => l.active || progress.has(l.id));
  const completedOn = (id: string) => {
    const p = progress.get(id);
    return p?.status === 'complete' ? p.completed_on : null;
  };
  const { byLesson } = trackLessons(
    kept.map((l) => ({ id: l.id, term: l.term, classNo: l.class_no, active: l.active, completedOn: completedOn(l.id) })),
    plan.classes.map((c) => ({ term: c.term, classNo: c.class_no, state: c.state, plannedOn: c.planned_on, lessonIds: c.lesson_ids })),
    today,
  );
  return kept.map((l) => {
    const p = progress.get(l.id);
    const status = p?.status === 'complete' || p?.status === 'in_progress' ? p.status : 'not_started';
    const track = byLesson.get(l.id)!;
    return {
      id: l.id, term: l.term, module: l.module, code: l.code, name: l.name, active: l.active,
      plannedOn: l.active ? track.plannedOn : null,
      status, completedOn: completedOn(l.id),
      tone: status === 'complete' ? standingTone(track.standing) : null,
    };
  });
}

// ---------- Term tabs (Lesson plan with dates, student Lesson Plan) ----------
// Each term with how many of its lessons are completed, and the term to open: the one asked for (?term=2), else
// the term of the class's next lesson to do, else the last term (everything done), else the first.
export function termTabs(lessons: { term: number; active: boolean; done: boolean }[], asked?: string) {
  const terms = [...new Set(lessons.map((l) => l.term))].sort((a, b) => a - b).map((term) => {
    const inTerm = lessons.filter((l) => l.term === term);
    return { term, done: inTerm.filter((l) => l.done).length, total: inTerm.length };
  });
  const wanted = Number(asked);
  const next = lessons.find((l) => l.active && !l.done)?.term;
  const current = terms.some((t) => t.term === wanted) ? wanted : next ?? terms.at(-1)?.term ?? 1;
  return { terms, current };
}
