import { todayInUk, yearLabel, yearShort } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Loads everything the dashboard shows, then turns the raw rows into numbers and chart bars.
// Only quick queries: no attendance, and no per-student statistics (those made the dashboard slow).
// The Homework section loads separately (homework.ts) and fills in when ready.
// Folders starting with _ are not web pages.

// "+N new" on the students tile counts students who started in this many days.
export const NEW_DAYS = 28;

export const PIPELINE = [
  { stage: 'new', label: 'New' },
  { stage: 'assessment_sent', label: 'Assessment sent' },
  { stage: 'assessment_returned', label: 'Assessment returned' },
  { stage: 'results_shared', label: 'Results shared' },
  { stage: 'confirmed', label: 'Confirmed' },
];

export type ChartBar = {
  key: string;
  label: string;
  value: number | null; // null = no data for this bar (drawn as a gap)
  display: string; // the value as text, e.g. "92%"
  detail?: string; // extra line in the tooltip
  href?: string;
  max?: number; // draws a track behind the bar (e.g. batch capacity)
  tone?: number; // ordinal colour step 1–5
};

export type AttentionItem = { tone: 'danger' | 'warn' | 'info'; kind: string; title: string; detail: string; href: string };

const DAY_MS = 86_400_000;

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

const pct = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : null);

export async function loadDashboard() {
  const supabase = await createClient();
  const today = todayInUk();
  const newFrom = addDays(today, -(NEW_DAYS - 1));

  const [subjects, students, batches, enquiries] = await Promise.all([
    supabase.from('subjects').select('id, name').order('sort'),
    // Current students with their current subjects, teacher and batch. Read from the tables, not from the
    // student_list view, which also works out each student's attendance and homework figures.
    supabase
      .from('students')
      .select('id, first_name, last_name, year_group, status, start_date, enrolments(subject_id, teacher_id, batch_id)')
      .neq('status', 'left')
      .is('enrolments.ended_on', null),
    supabase
      .from('batch_list')
      .select('id, code, subject, year_group, teacher, member_count, capacity, to_mark')
      .is('closed_on', null)
      .order('code'),
    supabase.from('enquiries').select('id, child_first_name, child_last_name, stage, stage_changed_at'),
  ]);
  for (const r of [subjects, students, batches, enquiries]) {
    if (r.error) throw r.error;
  }

  /* ---------- Students ---------- */
  type Enrolment = { subject_id: string; teacher_id: string | null; batch_id: string | null };
  const current = (students.data ?? []).map((s) => {
    const enrolments = (s.enrolments ?? []) as Enrolment[];
    return {
      ...s,
      subject_ids: enrolments.map((e) => e.subject_id),
      missing_teacher: enrolments.some((e) => !e.teacher_id),
      missing_batch: enrolments.some((e) => !e.batch_id),
    };
  });
  const studentCounts = {
    current: current.length,
    active: current.filter((s) => s.status === 'active').length,
    trial: current.filter((s) => s.status === 'trial').length,
    newInRange: current.filter((s) => s.start_date >= newFrom).length,
  };

  const bySubject: ChartBar[] = (subjects.data ?? []).map((sub) => {
    const n = current.filter((s) => s.subject_ids.includes(sub.id)).length;
    return { key: sub.id, label: sub.name, value: n, display: String(n), detail: `${n} current student${n === 1 ? '' : 's'}` };
  });

  const years = current.map((s) => s.year_group as number);
  const byYear: ChartBar[] = [];
  if (years.length) {
    for (let y = Math.min(...years); y <= Math.max(...years); y++) {
      const n = years.filter((v) => v === y).length;
      byYear.push({ key: `y${y}`, label: yearShort(y), value: n, display: String(n), detail: yearLabel(y) });
    }
  }

  const openBatches = batches.data ?? [];

  /* ---------- Batches: places used ---------- */
  const places: ChartBar[] = openBatches.map((b) => ({
    key: b.id,
    label: b.code,
    value: b.member_count,
    max: b.capacity,
    display: `${b.member_count}/${b.capacity}`,
    detail: `${b.subject} · ${yearLabel(b.year_group)} · ${b.teacher}`,
    href: `/batches/${b.id}`,
  }));
  const seats = openBatches.reduce((s, b) => s + b.capacity, 0);
  const filled = openBatches.reduce((s, b) => s + b.member_count, 0);

  /* ---------- Enquiries ---------- */
  const allEnquiries = enquiries.data ?? [];
  const openEnquiries = allEnquiries.filter((e) => e.stage !== 'enrolled' && e.stage !== 'not_proceeding');
  const enrolled = allEnquiries.filter((e) => e.stage === 'enrolled').length;
  const lost = allEnquiries.filter((e) => e.stage === 'not_proceeding').length;
  const pipeline: ChartBar[] = PIPELINE.map((p, i) => {
    const n = allEnquiries.filter((e) => e.stage === p.stage).length;
    return { key: p.stage, label: p.label, value: n, display: String(n), detail: `${n} enquir${n === 1 ? 'y' : 'ies'} at this stage`, tone: i + 1 };
  });

  /* ---------- Needs attention ---------- */
  const attention: AttentionItem[] = [];
  for (const s of current.filter((s) => s.missing_batch || s.missing_teacher)) {
    attention.push({
      tone: 'warn', kind: 'student',
      title: `${s.first_name} ${s.last_name} needs a ${s.missing_batch ? 'batch' : 'teacher'}`,
      detail: yearLabel(s.year_group),
      href: `/students/${s.id}`,
    });
  }
  for (const b of openBatches.filter((b) => b.to_mark > 0)) {
    attention.push({
      tone: 'warn', kind: 'homework',
      title: `${b.code}: ${b.to_mark} homework to mark`,
      detail: `${b.subject} ${yearShort(b.year_group)} · ${b.teacher ?? 'you'}`, // empty in a teacher's own view
      href: `/batches/${b.id}`,
    });
  }
  for (const e of openEnquiries) {
    const waiting = daysBetween(e.stage_changed_at.slice(0, 10), today);
    if (waiting < 7) continue;
    attention.push({
      tone: 'info', kind: 'enquiry',
      title: `${e.child_first_name} ${e.child_last_name}: waiting ${waiting} days`,
      detail: PIPELINE.find((p) => p.stage === e.stage)?.label ?? e.stage,
      href: `/enquiries/${e.id}`,
    });
  }
  const order = { danger: 0, warn: 1, info: 2 };
  attention.sort((a, b) => order[a.tone] - order[b.tone]);

  return {
    today,
    studentCounts,
    bySubject, byYear,
    places, placesSummary: { seats, filled, rate: pct(filled, seats), batches: openBatches.length },
    pipeline, enquirySummary: { open: openEnquiries.length, enrolled, lost, conversion: pct(enrolled, enrolled + lost) },
    attention,
  };
}
