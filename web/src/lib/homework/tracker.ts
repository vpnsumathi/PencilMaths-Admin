// Homework Tracker (guide 26): the shapes the database functions return (homework_tracker_student,
// homework_tracker_batch, homework_tracker_upcoming in 20261120000001_homework_tracker.sql), the words and colours
// for each status, and the small sums the page shows. The rules themselves (what is Overdue, what counts as on time)
// live in the database, so every number on the page comes from one place.
//
// Pure functions with no Next.js or Supabase imports, so the unit tests (tracker.test.ts) can run them.
import { dayNumber, weekdayOf, WEEKDAY_SHORT } from '../lessons/tracker.ts';

export type HwState = 'assigned' | 'overdue' | 'submitted' | 'corrected' | 'excused' | 'not_given';

export const STATE_LABEL: Record<HwState, string> = {
  assigned: 'Assigned',
  overdue: 'Overdue',
  submitted: 'Submitted',
  corrected: 'Corrected',
  excused: 'Excused',
  not_given: 'Not given',
};

// One letter per status for the batch grid, so the grid reads without colour too.
export const STATE_LETTER: Record<HwState, string> = {
  assigned: 'A', overdue: 'O', submitted: 'S', corrected: 'C', excused: 'E', not_given: '!',
};

export type Totals = {
  assigned: number; overdue: number; submitted: number; corrected: number; excused: number; not_given: number;
  due: number; done: number; timed: number; on_time: number; mark_pct: number | null; correction_days?: number | null;
};

export type FileRef = { id: string; label: string | null };

export type StudentRow = {
  sheet_id: string; batch_id: string; title: string; set_on: string; due_on: string | null; max_mark: number | null;
  state: HwState; mark: number | null; received_on: string | null; marked_on: string | null; in_on: string | null;
  lesson_code: string | null; term: number | null; slot: number | null; hw_code: string | null; draft: boolean;
  sheets: FileRef[]; handed: FileRef[]; corrected: FileRef[];
};

export type StudentClass = {
  batch_id: string; code: string; name: string | null; subject: string; year_group: number; teacher: string | null;
  closed_on: string | null; from_on: string | null; to_on: string | null; current: boolean;
};

export type Upcoming = {
  lesson_homework_id: string; code: string; slot: number; lesson_code: string; lesson: string; module: string;
  term: number; class_no: number | null; planned_on: string | null; kind: 'upcoming' | 'not_sent';
  completed_on: string | null; behind: boolean; no_worksheet: boolean;
};

// The school years a student or batch has homework in (newest first). action: Overdue, Submitted or Not given.
export type SchoolYearCount = { year: number; homework?: number; sheets?: number; action?: number };

export type StudentData = {
  today: string; year: number; years: SchoolYearCount[];
  classes: StudentClass[]; rows: StudentRow[]; before_joining: number; totals: Totals;
  upcoming: Record<string, Upcoming[]>;
};

export type BatchStudent = {
  id: string; code: string; first_name: string; last_name: string; from_on: string | null; to_on: string | null;
  current: boolean; totals: Totals;
};
export type BatchSheet = {
  id: string; title: string; set_on: string; due_on: string | null; max_mark: number | null;
  lesson_code: string | null; slot: number | null; hw_code: string | null;
};
// [sheet index, student index, state, mark, in on, corrected on, marked sheet waiting to be sent]
export type Cell = [number, number, HwState, number | null, string | null, string | null, boolean];

export type BatchData = {
  today: string;
  year: number;
  years: SchoolYearCount[];
  batch: { id: string; code: string; name: string | null; subject: string; year_group: number; teacher: string | null; closed_on: string | null; tracker: boolean } | null;
  term: number | null;
  terms: { term: number; sheets: number }[];
  students: BatchStudent[];
  sheets: BatchSheet[];
  cells: Cell[];
  tiles: { assigned: number; overdue: number; submitted: number; corrected: number; not_given: number; oldest_submitted: string | null };
  upcoming: Upcoming[];
};

// ---------- Dates ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-11-16" → "16-Nov-2026 Mon" (the Lesson Tracker's style, with a short day name to fit a table).
export function hwDate(date: string | null | undefined): string {
  if (!date) return '—';
  return `${date.slice(8, 10)}-${MONTHS[Number(date.slice(5, 7)) - 1]}-${date.slice(0, 4)} ${WEEKDAY_SHORT[weekdayOf(date) - 1]}`;
}

// "2026-11-16" → "16 Nov", for narrow grid headings.
export function shortDate(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

// ---------- School years ----------
// A school year runs from 1 September to 31 August (the database's homework_school_year()). 2026 = 2026-27.
// Each view shows one school year, so the page stays the same size however many years there are (guide 27).
export function schoolYearOf(date: string): number {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 9 ? y : y - 1;
}

// 2026 → "2026-27".
export const schoolYearLabel = (year: number) => `${year}-${String((year + 1) % 100).padStart(2, '0')}`;

// The school years to offer, newest first: the ones with homework, plus the one shown (it may have none yet).
export function schoolYearChoices(years: SchoolYearCount[], shown: number): SchoolYearCount[] {
  const list = years.some((y) => y.year === shown) ? years : [...years, { year: shown }];
  return [...list].sort((a, b) => b.year - a.year);
}

// Whole days from a to b (b later = positive).
export const daysBetween = (a: string, b: string) => dayNumber(b) - dayNumber(a);

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

// When the work came in, compared with the due date: "On time", "Late by 2 days", or null (not in, or no due date).
export function timing(inOn: string | null, dueOn: string | null): { label: string; late: boolean } | null {
  if (!inOn || !dueOn) return null;
  const late = daysBetween(dueOn, inOn);
  return late > 0 ? { label: `Late by ${days(late)}`, late: true } : { label: 'On time', late: false };
}

// How long an Overdue homework has been overdue, or how long a Submitted one has waited for correction.
export function waiting(row: Pick<StudentRow, 'state' | 'due_on' | 'received_on'>, today: string): string | null {
  if (row.state === 'overdue' && row.due_on) return `${days(daysBetween(row.due_on, today))} overdue`;
  if (row.state === 'submitted' && row.received_on) {
    const n = daysBetween(row.received_on, today);
    return n === 0 ? 'waiting since today' : `waiting ${days(n)}`;
  }
  return null;
}

// "after 3 days" between Submitted and Corrected.
export function correctedAfter(receivedOn: string | null, markedOn: string | null): string | null {
  if (!receivedOn || !markedOn) return null;
  const n = daysBetween(receivedOn, markedOn);
  return n <= 0 ? 'same day' : `after ${days(n)}`;
}

// "16 / 20 (80%)", "16" with no maximum, or "—".
export function markText(mark: number | null, max: number | null): string {
  if (mark == null) return '—';
  const m = Number(mark);
  if (max == null) return `${m}`;
  return `${m} / ${Number(max)} (${Math.round((100 * m) / Number(max))}%)`;
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : null);

// The three rates under the tiles.
export function rates(t: Totals) {
  return { completed: pct(t.done, t.due), onTime: pct(t.on_time, t.timed), mark: t.mark_pct };
}

// A rate's colour: 80% or more good, under 60% low.
export function rateTone(value: number | null): 'good' | 'low' | null {
  if (value == null) return null;
  return value >= 80 ? 'good' : value < 60 ? 'low' : null;
}

// ---------- Student view filters ----------
export const SHOW = {
  action: 'Needs action',
  all: 'All',
  assigned: 'Assigned',
  submitted: 'Submitted',
  corrected: 'Corrected',
  excused: 'Excused',
  not_given: 'Not given',
  upcoming: 'Upcoming',
} as const;
export type Show = keyof typeof SHOW;

// Needs action: Overdue, Submitted waiting for correction, Not given, and a marked sheet not sent yet.
export const needsAction = (r: Pick<StudentRow, 'state' | 'draft'>) =>
  r.state === 'overdue' || r.state === 'submitted' || r.state === 'not_given' || (r.state === 'corrected' && r.draft);

export function filterRows(rows: StudentRow[], show: Show): StudentRow[] {
  switch (show) {
    case 'all': return rows;
    case 'upcoming': return [];
    case 'action': return rows.filter(needsAction);
    case 'assigned': return rows.filter((r) => r.state === 'assigned' || r.state === 'overdue');
    default: return rows.filter((r) => r.state === show);
  }
}

// The chip shown when none is chosen: Needs action if anything needs it, else All.
export function defaultShow(rows: StudentRow[]): Show {
  return rows.some(needsAction) ? 'action' : 'all';
}

// "November 2026" headings between months in the student table.
export function monthOf(date: string): string {
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

// ---------- Upcoming ----------
// Upcoming split for the page: homework never sent for a completed lesson; homework due by `until` (or with no date
// yet, when the batch has no tracker); and the rest of the year.
export function splitUpcoming(items: Upcoming[], today: string, horizonDays = 14) {
  const until = dayNumber(today) + horizonDays;
  const notSent = items.filter((u) => u.kind === 'not_sent');
  const coming = items.filter((u) => u.kind === 'upcoming');
  const dated = coming.some((u) => u.planned_on);
  const soon = coming.filter((u) => (u.planned_on ? dayNumber(u.planned_on) <= until : !dated));
  const later = coming.filter((u) => !soon.includes(u));
  return { notSent, soon, later, dated };
}

// The label for one upcoming homework.
export function upcomingLabel(u: Upcoming, today: string): string {
  if (u.kind === 'not_sent') return u.completed_on ? `Not sent: lesson completed ${hwDate(u.completed_on)}` : 'Not sent: lesson completed';
  if (!u.planned_on) return 'No date yet';
  if (u.behind) return `Lesson behind plan: planned ${hwDate(u.planned_on)}`;
  const n = daysBetween(today, u.planned_on);
  return n === 0 ? 'Expected today' : `Expected ${hwDate(u.planned_on)}`;
}

// ---------- Batch view ----------
// The term tabs: Term 1, 2, 3 for Lesson library homework, then "Other homework" (term 0).
export const termName = (term: number) => (term === 0 ? 'Other homework' : `Term ${term}`);

// The grid as rows: for each student, one cell (or null: set before they joined, or after they left) per sheet.
export function gridRows(data: Pick<BatchData, 'students' | 'sheets' | 'cells'>) {
  const grid = data.students.map(() => new Array<Cell | null>(data.sheets.length).fill(null));
  for (const c of data.cells) {
    if (grid[c[1]] && c[0] < data.sheets.length) grid[c[1]][c[0]] = c;
  }
  return data.students.map((student, i) => ({ student, cells: grid[i] }));
}

// Pointing at a cell: "Corrected 8 / 10 (80%) · in 12-Nov-2026 Thu · on time".
export function cellTitle(cell: Cell, sheet: BatchSheet): string {
  const [, , state, mark, inOn, markedOn, draft] = cell;
  const parts: string[] = [STATE_LABEL[state]];
  if (state === 'corrected' && mark != null) parts[0] += ` ${markText(mark, sheet.max_mark)}`;
  if (inOn) {
    const t = timing(inOn, sheet.due_on);
    parts.push(`in ${hwDate(inOn)}${t ? ` (${t.label.toLowerCase()})` : ''}`);
  }
  if (markedOn && state === 'corrected') parts.push(`corrected ${hwDate(markedOn)}`);
  if (draft) parts.push('marked sheet not sent yet');
  if (state === 'not_given') parts.push('set while they were in the batch, but never given to them');
  return `${sheet.title} · ${parts.join(' · ')}`;
}
