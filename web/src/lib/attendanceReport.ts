// The Attendance page (/attendance) and its CSV export: reading the filters from the address, the date ranges,
// and the shapes the database report functions return (supabase/migrations/20261113000001_attendance_report.sql).
import { todayInUk, UUID } from './options';

export const RANGES = {
  week: 'This week',
  '4w': 'Last 4 weeks',
  '12w': 'Last 12 weeks',
  term: 'This term',
  all: 'All',
  custom: 'Custom…',
} as const;
export type Range = keyof typeof RANGES;

export const TABS = {
  list: 'Attendance List',
  all: 'All Attendance',
  corrections: 'Corrections',
  attention: 'Needs attention',
} as const;
export type Tab = keyof typeof TABS;

export const SHOW = {
  all: 'Everything',
  absent: 'Absent only',
  late: 'Late only',
  checked_in: 'Checked in, not confirmed',
  not_checked_in: 'Has not checked in',
  corrected: 'Corrected marks',
} as const;
export type Show = keyof typeof SHOW;

// UK school terms, roughly: autumn from 1 September, spring from 1 January, summer from 15 April.
// Change these if your terms start on other days. [month (1-12), day]
const TERM_STARTS: [number, number][] = [[9, 1], [4, 15], [1, 1]];

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// The first day of the term that `date` ("2026-11-13") is in.
export function termStart(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  for (const [tm, td] of TERM_STARTS) {
    if (m > tm || (m === tm && d >= td)) return `${y}-${String(tm).padStart(2, '0')}-${String(td).padStart(2, '0')}`;
  }
  return `${y - 1}-09-01`;
}

// A preset or custom range as two dates (UK days). Presets end today.
export function rangeDates(range: Range, from?: string, to?: string) {
  const today = todayInUk();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  switch (range) {
    case 'week': {
      const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
      return { from: addDays(today, -weekday), to: today };
    }
    case '12w': return { from: addDays(today, -83), to: today };
    case 'term': return { from: termStart(today), to: today };
    case 'all': return { from: '2000-01-01', to: today };
    case 'custom': {
      const f = from && iso.test(from) ? from : addDays(today, -27);
      const t = to && iso.test(to) ? to : today;
      return f <= t ? { from: f, to: t } : { from: t, to: f };
    }
    default: return { from: addDays(today, -27), to: today };
  }
}

export type Filters = {
  tab: Tab; range: Range; from: string; to: string;
  batch: string | null; student: string | null; teacher: string | null; show: Show; page: number;
};

// The filters from the address (?tab=…&range=…&batch=…). Anything unknown falls back to the default.
export function readFilters(q: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (typeof q[k] === 'string' ? (q[k] as string) : undefined);
  const id = (k: string) => (UUID.test(one(k) ?? '') ? one(k)! : null);
  // One of a list's own keys (never "constructor" and the like), or the default.
  const pick = <T extends string>(list: Record<T, string>, k: string, fallback: T): T => {
    const v = one(k);
    return v !== undefined && Object.hasOwn(list, v) ? (v as T) : fallback;
  };
  const range = pick<Range>(RANGES, 'range', '4w');
  const { from, to } = rangeDates(range, one('from'), one('to'));
  return {
    tab: pick<Tab>(TABS, 'tab', 'list'),
    range, from, to,
    batch: id('batch'), student: id('student'), teacher: id('teacher'),
    show: pick<Show>(SHOW, 'show', 'all'),
    page: Math.max(1, Math.min(1000, Number(one('page')) || 1)),
  };
}

// An address for the Attendance page with some filters changed. Defaults are left out, so links stay short.
export function attendanceHref(f: Filters, change: Partial<Filters> = {}, path = '/attendance') {
  const n = { ...f, ...change };
  const p = new URLSearchParams();
  if (n.tab !== 'list') p.set('tab', n.tab);
  if (n.range !== '4w') p.set('range', n.range);
  if (n.range === 'custom') { p.set('from', n.from); p.set('to', n.to); }
  if (n.batch) p.set('batch', n.batch);
  if (n.student) p.set('student', n.student);
  if (n.teacher) p.set('teacher', n.teacher);
  if (n.show !== 'all') p.set('show', n.show);
  if (n.page > 1) p.set('page', String(n.page));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

// The arguments every report function takes.
export const reportArgs = (f: Filters) => ({
  p_from: f.from, p_to: f.to, p_batch: f.batch, p_student: f.student, p_teacher: f.teacher,
});

type Status = 'present' | 'late' | 'absent';
type Source = 'auto' | 'link' | 'staff';
type Change = { from: Status; from_source: Source | null; to: Status; reason: string | null; by: string | null; at: string };

export type Summary = {
  classes_held: number; marks: number; present: number; late: number; absent: number;
  checked_in: number; not_checked_in: number; corrections: number; missing_registers: number;
};
export type GridMark = { status: Status; source: Source; joined_at: string | null; by: string | null; corrected: boolean; reason: string | null };
export type Grid = {
  dates: { class_date: string; start_time: string | null; session_id: string | null; missing: boolean; attended: number; total: number }[];
  students: {
    id: string; code: string; first_name: string; last_name: string; in_batch: boolean;
    started_on: string | null; ended_on: string | null; marks: Record<string, GridMark>;
  }[];
};
export type ListRow = {
  class_date: string; start_time: string | null; batch_id: string; batch_code: string; subject: string;
  student_id: string; student_code: string; first_name: string; last_name: string;
  status: Status; source: Source; joined_at: string | null; set_by: string | null; last_change: Change | null;
};
export type CorrectionRow = {
  changed_at: string; class_date: string; batch_id: string; batch_code: string; student_id: string;
  first_name: string; last_name: string; from: Status; from_source: Source | null; to: Status; reason: string | null; by: string | null;
};
export type Attention = {
  unconfirmed: { batch_id: string; batch_code: string; class_date: string; checked_in: number; not_checked_in: number }[];
  missing: { batch_id: string; batch_code: string; class_date: string; start_time: string }[];
  streaks: { batch_id: string; batch_code: string; student_id: string; first_name: string; last_name: string; absences: number; dates: string[] }[];
};

// The student page card (student_attendance).
export type StudentAttendance = {
  total: number; present: number; late: number; absent: number; checked_in: number;
  last: { class_date: string; batch_code: string; subject: string; status: Status; source: Source; joined_at: string | null } | null;
  classes: {
    batch_id: string; batch_code: string; subject: string; teacher: string | null; times: string | null; in_batch: boolean;
    attended: number; total: number; earlier: number;
    marks: (GridMark & { class_date: string })[];
  }[];
  streaks: { batch_code: string; subject: string; dates: string[] }[];
};

// One letter for a mark in the grid and on the student card: P, L, A, or C for a portal check-in not confirmed yet.
export const markLetter = (m: { status: Status; source: Source }) => (m.source === 'link' ? 'C' : m.status[0].toUpperCase());

// Who set a mark, in words.
export function setByText(source: Source, by: string | null) {
  if (source === 'link') return 'Portal check-in, not confirmed';
  if (source === 'auto') return 'Has not checked in, not confirmed';
  return by ?? 'Staff';
}
