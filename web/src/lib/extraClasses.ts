// Extra classes (guide 24): one-off classes on a set date for one or more students, such as a catch-up.
// Labels, the Extra classes page's filters (kept in the address, like the Attendance page), and the shapes the
// database functions return (supabase/migrations/20261115000001_extra_classes.sql).
import { termStart } from './attendanceReport';
import { ATTENDANCE_LABEL, markLabel } from './classLink';
import { todayInUk, UUID } from './options';
import { clock12 } from './format';

export type ExtraStatus = 'upcoming' | 'live' | 'to_mark' | 'done' | 'no_show' | 'cancelled';
export type ExtraKind = 'catch_up' | 'extra_practice' | 'exam_prep' | 'other';
export type AskedBy = 'family' | 'teacher' | 'office';
type Mark = 'present' | 'late' | 'absent';
type Source = 'auto' | 'link' | 'staff';

export const KIND_LABEL: Record<ExtraKind, string> = {
  catch_up: 'Catch-up', extra_practice: 'Extra practice', exam_prep: 'Exam prep', other: 'Other',
};
export const STATUS_LABEL: Record<ExtraStatus, string> = {
  upcoming: 'Upcoming', live: 'Live now', to_mark: 'To mark', done: 'Done', no_show: 'No-show', cancelled: 'Cancelled',
};
export const ASKED_BY: Record<AskedBy, string> = { family: 'Family', teacher: 'Teacher', office: 'Office' };
// How long a class can be on the form (the database allows 15 to 180 minutes, in steps of 5).
export const LENGTHS = [30, 45, 60, 90, 120];

// ---------- Times (always UK time) ----------
const UK = 'Europe/London';
const part = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('en-GB', { timeZone: UK, ...o });
// "4:30 PM", for showing (12-hour clock, see lib/format.ts). ukClock24 ("16:30") is for sorting and comparing.
export const ukClock24 = (iso: string) => part(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const ukClock = (iso: string | null | undefined) => (iso ? clock12(ukClock24(iso)) : '');
// "Mon 17 Nov 2026"
export const ukDay = (iso: string) => part(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
// "Mon 17 Nov 2026, 4:30 PM–5:15 PM"
export const whenText = (starts: string, ends: string) => `${ukDay(starts)}, ${ukClock(starts)}–${ukClock(ends)}`;
// "Mon 17 Nov, 4:30 PM" (no year), for short lines.
export const shortWhen = (iso: string) => `${part(iso, { weekday: 'short', day: 'numeric', month: 'short' })}, ${ukClock(iso)}`;
// A UK date ("2026-11-17") from a moment.
export const ukDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: UK });

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// "Today, 5:00 PM", "Tomorrow, 5:00 PM" or "Monday 17 Nov, 5:00 PM" (UK time), like the weekly classes' next-class label.
export function dayLabel(iso: string) {
  const today = todayInUk();
  const date = ukDate(iso);
  const day = date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow'
    : new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day}, ${ukClock(iso)}`;
}

// ---------- Shapes from the database ----------
export type ListStudent = { id: string; name: string; mark: Mark | null; mark_source: Source | null; missed_date: string | null };
export type ListRow = {
  id: string; code: string; status: ExtraStatus; version: number; starts_at: string; ends_at: string; length_minutes: number;
  subject: string; subject_id: string; teacher_id: string; teacher: string; kind: ExtraKind; batch_code: string | null;
  has_meet_room: boolean; booked_by: string | null; created_at: string; recorded_after: boolean;
  cancel_asked_by: AskedBy | null; cancel_reason: string | null; note: string | null;
  students: ListStudent[];
  last_change: { event: string; at: string; by: string | null } | null;
};
export type Summary = Record<ExtraStatus, number> & { minutes_taught: number };
export type ListResult = { total: number; page: number; page_size: number; summary: Summary; rows: ListRow[] };

export type HistoryEntry = {
  id: number; at: string; event: string; detail: Record<string, unknown>; reason: string | null; by: string | null;
  student: string | null;
  // On the History tab only:
  extra_class_id?: string; code?: string; starts_at?: string; ends_at?: string; teacher?: string; students?: string | null;
};
export type HistoryResult = { total: number; page: number; page_size: number; rows: HistoryEntry[] };

export type DetailStudent = {
  id: string; first_name: string; last_name: string; student_status: string;
  mark: Mark | null; mark_source: Source | null; joined_at: string | null; marked_by: string | null; marked_at: string | null;
  missed_session_id: string | null; missed_date: string | null; missed_batch: string | null;
  parent_phone: string | null; parent_name: string | null;
};
export type Detail = {
  id: string; code: string; version: number; status: ExtraStatus;
  subject_id: string; subject: string; teacher_id: string; teacher: string; teacher_status: string;
  starts_at: string; ends_at: string; length_minutes: number; class_date: string; start_time: string;
  kind: ExtraKind; note: string | null; note_for_family: boolean; batch_id: string | null; batch_code: string | null;
  recorded_after: boolean; has_meet_room: boolean;
  cancelled_at: string | null; cancelled_by: string | null; cancel_asked_by: AskedBy | null; cancel_reason: string | null;
  created_at: string; created_by: string | null; opens_at: string; late_after: string;
  students: DetailStudent[]; history: HistoryEntry[];
};

type AttentionItem = { id: string; code: string; starts_at: string; ends_at: string; teacher?: string; students?: string | null };
export type Attention = {
  to_mark: AttentionItem[];
  needs_teacher: (AttentionItem & { teacher_status: string })[];
  no_meet_room: AttentionItem[];
  inactive_students: (AttentionItem & { student: string; student_status: string })[];
  no_shows: (AttentionItem & { subject_id: string })[];
};
export const attentionCount = (a: Attention | null) =>
  a ? a.to_mark.length + a.needs_teacher.length + a.no_meet_room.length + a.inactive_students.length + a.no_shows.length : 0;

// my_extra_classes(): the student or family login.
export type MyExtra = {
  id: string; starts_at: string; ends_at: string; length_minutes: number; subject: string; teacher: string;
  kind: ExtraKind; note: string | null; cancelled: boolean; moved_from: string | null; opens_at: string; in_window: boolean;
  mark: Mark | null; mark_source: Source | null;
};
export type MyExtras = {
  upcoming: MyExtra[]; taken: MyExtra[]; attended: number; total: number;
  window: { before_minutes: number; after_minutes: number; late_minutes: number };
};

// teacher_extra_changes(): what the office changed in the last 48 hours.
export type TeacherChange = {
  at: string; event: string; detail: Record<string, unknown>; extra_class_id: string; code: string;
  starts_at: string; ends_at: string; still_mine: boolean; reason: string | null; students: string | null;
};

// ---------- Words for marks and results ----------
// One student's result on a class, in words: "Present", "Checked in", "Not marked" …
export function resultText(mark: Mark | null, source: Source | null, cancelled = false) {
  if (cancelled) return 'Cancelled';
  if (!mark) return 'Not marked';
  return markLabel(mark, source);
}
// Colour key for a result (see the .r* classes in extra.module.css).
export function resultTone(mark: Mark | null, source: Source | null, cancelled = false) {
  if (cancelled) return 'Muted';
  if (!mark) return 'Muted';
  if (source === 'link') return 'Checked';
  return mark === 'present' ? 'Ok' : mark === 'late' ? 'Late' : 'Bad';
}

// ---------- The history in words ----------
export const EVENT_LABEL: Record<string, string> = {
  booked: 'Created', recorded: 'Recorded afterwards', rescheduled: 'Moved', teacher_changed: 'Teacher changed',
  details_changed: 'Details changed', student_added: 'Student added', student_removed: 'Student taken off',
  cancelled: 'Cancelled', restored: 'Restored', clash_overridden: 'Clash warning overridden', meet_room: 'Meet room',
  check_in: 'Portal check-in', mark: 'Attendance',
};

type Obj = Record<string, unknown>;
const o = (v: unknown) => (v && typeof v === 'object' ? (v as Obj) : {});
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const slot = (v: unknown) => {
  const x = o(v);
  const start = s(x.starts_at);
  if (!start) return '';
  const end = new Date(new Date(start).getTime() + Number(x.length_minutes ?? 0) * 60_000).toISOString();
  return whenText(start, end);
};

// One history entry's details in words. subjects: subject id → name, for "subject changed".
export function eventText(e: Pick<HistoryEntry, 'event' | 'detail' | 'student'>, subjects: Record<string, string> = {}) {
  const d = o(e.detail);
  switch (e.event) {
    case 'booked':
    case 'recorded':
      return [slot(d), s(o(d.teacher).name), KIND_LABEL[s(d.kind) as ExtraKind]].filter(Boolean).join(' · ');
    case 'rescheduled':
      return `From ${slot(d.from)} to ${slot(d.to)}`;
    case 'teacher_changed':
      return `From ${s(o(d.from).name) || 'no teacher'} to ${s(o(d.to).name) || 'no teacher'}`;
    case 'details_changed': {
      const from = o(d.from);
      const to = o(d.to);
      const bits: string[] = [];
      if ('kind' in to) bits.push(`Type: ${KIND_LABEL[s(from.kind) as ExtraKind] ?? '—'} → ${KIND_LABEL[s(to.kind) as ExtraKind] ?? '—'}`);
      if ('subject_id' in to) bits.push(`Subject: ${subjects[s(from.subject_id)] ?? s(from.subject_id)} → ${subjects[s(to.subject_id)] ?? s(to.subject_id)}`);
      if ('note' in to) bits.push(s(to.note) ? `Note: “${s(to.note)}”` : 'Note removed');
      if ('note_for_family' in to) bits.push(to.note_for_family ? 'Note shown to the family' : 'Note hidden from the family');
      if ('batch_id' in to) bits.push(to.batch_id ? 'Batch changed' : 'Batch removed');
      if ('missed_session_id' in to) bits.push(`${e.student ?? 'Student'}: ${to.missed_session_id ? 'missed class chosen' : 'missed class removed'}`);
      return bits.join(' · ') || 'Details changed';
    }
    case 'student_added':
      return e.student ?? s(d.name);
    case 'student_removed':
      return `${e.student ?? s(d.name)}${d.mark ? ` (had ${ATTENDANCE_LABEL[s(d.mark)] ?? s(d.mark)})` : ''}`;
    case 'cancelled':
      return `Asked by ${ASKED_BY[s(d.asked_by) as AskedBy] ?? 'the office'}`;
    case 'restored':
      return 'The cancellation was undone';
    case 'clash_overridden':
      return Array.isArray(d.warnings) ? (d.warnings as unknown[]).map(s).join(' ') : '';
    case 'meet_room':
      return d.made ? (d.replaced ? 'A new Meet room was made' : 'Meet room made') : 'Meet room removed';
    case 'check_in':
      return `${e.student ?? 'Student'} pressed Join class at ${ukClock(s(d.at))} (${markLabel(s(d.mark), 'link')})`;
    case 'mark': {
      const was = d.from ? `${markLabel(s(d.from), s(d.from_source) || null)} → ` : '';
      return `${e.student ?? 'Student'}: ${was}${ATTENDANCE_LABEL[s(d.to)] ?? s(d.to)}`;
    }
    default:
      return '';
  }
}
// Who made a change. Nobody (null) means the app itself, a script, or a database rule (such as a student leaving).
export const byText = (by: string | null) => by ?? 'The app';

// ---------- WhatsApp a parent ----------
export function whatsappText(c: { status: ExtraStatus; starts_at: string; ends_at: string; subject: string; teacher: string },
  firstName: string) {
  const when = whenText(c.starts_at, c.ends_at);
  if (c.status === 'cancelled') {
    return `Hi, this is Pencil Maths. ${firstName}'s extra ${c.subject} class on ${when} has been cancelled. We'll be in touch about another time. Thank you!`;
  }
  if (c.status === 'live') {
    return `Hi, this is Pencil Maths. ${firstName}'s extra ${c.subject} class with ${c.teacher} has started (${when}). We haven't seen them join yet: please open "I'm here, open class" in the Pencil Maths login. Thank you!`;
  }
  return `Hi, this is Pencil Maths. ${firstName} has an extra ${c.subject} class with ${c.teacher} on ${when}. They can join from the Pencil Maths login (My classes) from 15 minutes before the start. Thank you!`;
}

// ---------- The Extra classes page's filters ----------
export const RANGES = {
  recent: 'Last 4 weeks and upcoming',
  week: 'This week',
  next7: 'Next 7 days',
  '4w': 'Last 4 weeks',
  term: 'This term',
  all: 'All',
  custom: 'Custom…',
} as const;
export type Range = keyof typeof RANGES;

export const TABS = { list: 'List', attention: 'Needs attention', history: 'History' } as const;
export type Tab = keyof typeof TABS;

// A preset or custom range as UK dates. null: no limit on that side.
export function rangeDates(range: Range, from?: string, to?: string): { from: string | null; to: string | null } {
  const today = todayInUk();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  switch (range) {
    case 'week': {
      const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
      return { from: monday, to: addDays(monday, 6) };
    }
    case 'next7': return { from: today, to: addDays(today, 6) };
    case '4w': return { from: addDays(today, -27), to: today };
    case 'term': return { from: termStart(today), to: null };
    case 'all': return { from: null, to: null };
    case 'custom': {
      const f = from && iso.test(from) ? from : addDays(today, -27);
      const t = to && iso.test(to) ? to : today;
      return f <= t ? { from: f, to: t } : { from: t, to: f };
    }
    default: return { from: addDays(today, -27), to: null };
  }
}

export type Filters = {
  tab: Tab; range: Range; from: string | null; to: string | null;
  status: ExtraStatus | null; student: string | null; teacher: string | null; subject: string | null;
  kind: ExtraKind | null; booked_by: string | null; cancelled_by: AskedBy | null; catch_up: boolean; code: string | null;
  event: string | null; page: number;
};

// The filters from the address. Anything unknown falls back to the default.
export function readFilters(q: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (typeof q[k] === 'string' ? (q[k] as string) : undefined);
  const id = (k: string) => (UUID.test(one(k) ?? '') ? one(k)! : null);
  const pick = <T extends string>(list: Record<T, string>, k: string): T | null => {
    const v = one(k);
    return v !== undefined && Object.hasOwn(list, v) ? (v as T) : null;
  };
  const range = pick<Range>(RANGES, 'range') ?? 'recent';
  const { from, to } = rangeDates(range, one('from'), one('to'));
  const code = (one('code') ?? '').trim().slice(0, 20);
  const subject = (one('subject') ?? '').trim();
  return {
    tab: pick<Tab>(TABS, 'tab') ?? 'list',
    range, from, to,
    status: pick<ExtraStatus>(STATUS_LABEL, 'status'),
    student: id('student'), teacher: id('teacher'), booked_by: id('booked_by'),
    subject: /^[A-Za-z0-9_-]{1,40}$/.test(subject) ? subject : null,
    kind: pick<ExtraKind>(KIND_LABEL, 'kind'),
    cancelled_by: pick<AskedBy>(ASKED_BY, 'cancelled_by'),
    catch_up: one('catch_up') === '1',
    code: code && /^[A-Za-z0-9-]+$/.test(code) ? code : null,
    event: pick<string>(EVENT_LABEL, 'event'),
    page: Math.max(1, Math.min(1000, Number(one('page')) || 1)),
  };
}

// An address for the Extra classes page with some filters changed. Defaults are left out, so links stay short.
export function extraHref(f: Filters, change: Partial<Filters> = {}, path = '/extra-classes') {
  const n = { ...f, ...change };
  const p = new URLSearchParams();
  if (n.tab !== 'list') p.set('tab', n.tab);
  if (n.range !== 'recent') p.set('range', n.range);
  if (n.range === 'custom' && n.from && n.to) { p.set('from', n.from); p.set('to', n.to); }
  for (const k of ['status', 'student', 'teacher', 'subject', 'kind', 'booked_by', 'cancelled_by', 'code', 'event'] as const) {
    if (n[k]) p.set(k, n[k] as string);
  }
  if (n.catch_up) p.set('catch_up', '1');
  if (n.page > 1) p.set('page', String(n.page));
  const q = p.toString();
  return q ? `${path}?${q}` : path;
}

// What extra_class_list() takes for these filters.
export const listArgs = (f: Filters, page = f.page, pageSize = 50) => ({
  from: f.from, to: f.to, status: f.status, student: f.student, teacher: f.teacher, subject: f.subject, kind: f.kind,
  booked_by: f.booked_by, cancelled_by: f.cancelled_by, catch_up: f.catch_up || null, code: f.code, page, page_size: pageSize,
});
// What extra_class_history() takes for these filters (dates are when the change was made).
export const historyArgs = (f: Filters, page = f.page, pageSize = 50) => ({
  from: f.from, to: f.to, event: f.event, done_by: f.booked_by, student: f.student, teacher: f.teacher, code: f.code,
  page, page_size: pageSize,
});

// One spreadsheet cell for the CSV exports. Quoted when needed; text a spreadsheet would run as a formula gets a '.
export const csvCell = (v: string | number | null | undefined) => {
  let t = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export const NOT_READY = 'The database is not ready for extra classes yet: run 20261115000001_extra_classes.sql in Supabase first.';
