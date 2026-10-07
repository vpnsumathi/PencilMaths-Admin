import { todayInUk } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Loads everything the dashboard shows for the chosen range (last N days, ending today),
// then turns the raw rows into numbers and chart bars. Folders starting with _ are not web pages.

export const RANGES = [
  { days: 7, label: '7 days' },
  { days: 28, label: '4 weeks' },
  { days: 90, label: '90 days' },
];

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

function shortDate(date: string, weekday = false) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', ...(weekday ? { weekday: 'short' } : {}),
  });
}

const pct = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : null);

export async function loadDashboard(days: number) {
  const supabase = await createClient();
  const today = todayInUk();
  const from = addDays(today, -(days - 1));
  const yesterday = addDays(today, -1);

  const [subjects, students, teachers, batches, attendance, homework, expected, enquiries] = await Promise.all([
    supabase.from('subjects').select('id, name').order('sort'),
    supabase
      .from('student_list')
      .select('id, first_name, last_name, year_group, status, start_date, subject_ids, missing_teacher, missing_batch'),
    supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase
      .from('batch_list')
      .select('id, code, subject, year_group, teacher, member_count, capacity, to_mark')
      .is('closed_on', null)
      .order('code'),
    // !inner joins the class and keeps only rows whose class is inside the range.
    supabase
      .from('attendance')
      .select('status, class_sessions!inner(class_date)')
      .gte('class_sessions.class_date', from)
      .lte('class_sessions.class_date', today),
    supabase
      .from('homework_results')
      .select('status, homework_sheets!inner(set_on, due_on)')
      .gte('homework_sheets.set_on', from),
    // Every class that should have happened (from batch timetables), with its log if there is one.
    supabase.rpc('expected_classes', { p_from: from, p_to: yesterday }),
    supabase.from('enquiries').select('id, child_first_name, child_last_name, stage, stage_changed_at'),
  ]);
  for (const r of [subjects, students, teachers, batches, attendance, homework, expected, enquiries]) {
    if (r.error) throw r.error;
  }

  /* ---------- Students ---------- */
  const current = (students.data ?? []).filter((s) => s.status !== 'left');
  const studentCounts = {
    current: current.length,
    active: current.filter((s) => s.status === 'active').length,
    trial: current.filter((s) => s.status === 'trial').length,
    newInRange: current.filter((s) => s.start_date >= from).length,
  };

  const bySubject: ChartBar[] = (subjects.data ?? []).map((sub) => {
    const n = current.filter((s) => (s.subject_ids as string[]).includes(sub.id)).length;
    return { key: sub.id, label: sub.name, value: n, display: String(n), detail: `${n} current student${n === 1 ? '' : 's'}` };
  });

  const years = current.map((s) => s.year_group as number);
  const byYear: ChartBar[] = [];
  if (years.length) {
    for (let y = Math.min(...years); y <= Math.max(...years); y++) {
      const n = years.filter((v) => v === y).length;
      byYear.push({ key: `y${y}`, label: `Y${y}`, value: n, display: String(n), detail: `Year ${y}` });
    }
  }

  /* ---------- Attendance: overall and per day/week ---------- */
  const rows = (attendance.data ?? []).map((a) => ({
    status: a.status as string,
    date: (a.class_sessions as unknown as { class_date: string }).class_date,
  }));
  const attended = rows.filter((r) => r.status !== 'absent').length;
  const attendanceSummary = {
    rate: pct(attended, rows.length),
    present: rows.filter((r) => r.status === 'present').length,
    late: rows.filter((r) => r.status === 'late').length,
    absent: rows.filter((r) => r.status === 'absent').length,
  };

  // 7 days → one bar per day; longer ranges → one bar per week. Oldest first.
  const size = days === 7 ? 1 : 7;
  const attendanceTrend: ChartBar[] = [];
  for (let end = today; daysBetween(from, end) >= 0; end = addDays(end, -size)) {
    const start = addDays(end, -(size - 1)) < from ? from : addDays(end, -(size - 1));
    const inBucket = rows.filter((r) => r.date >= start && r.date <= end);
    const rate = pct(inBucket.filter((r) => r.status !== 'absent').length, inBucket.length);
    attendanceTrend.unshift({
      key: start,
      label: size === 1 ? shortDate(start, true) : shortDate(start),
      value: rate,
      display: rate === null ? 'No classes' : `${rate}%`,
      detail: size === 1 ? shortDate(start, true) : `Week of ${shortDate(start)} · ${inBucket.length} attendance marks`,
    });
  }

  /* ---------- Homework (sheets already due) ---------- */
  const due = (homework.data ?? [])
    .map((h) => ({ status: h.status as string, sheet: h.homework_sheets as unknown as { set_on: string; due_on: string | null } }))
    .filter((h) => (h.sheet.due_on ?? h.sheet.set_on) < today && h.status !== 'excused');
  const openBatches = batches.data ?? [];
  const homeworkSummary = {
    rate: pct(due.filter((h) => h.status === 'received' || h.status === 'marked').length, due.length),
    toMark: openBatches.reduce((sum, b) => sum + (b.to_mark ?? 0), 0),
  };

  /* ---------- Classes logged vs expected ---------- */
  const expectedRows = (expected.data ?? []) as { batch_id: string; class_date: string; session_id: string | null }[];
  const missing = expectedRows.filter((c) => !c.session_id);
  const classSummary = { expected: expectedRows.length, logged: expectedRows.length - missing.length, missing: missing.length };

  /* ---------- Batches: places used ---------- */
  const places: ChartBar[] = openBatches.map((b) => ({
    key: b.id,
    label: b.code,
    value: b.member_count,
    max: b.capacity,
    display: `${b.member_count}/${b.capacity}`,
    detail: `${b.subject} · Year ${b.year_group} · ${b.teacher}`,
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
  const batchById = new Map(openBatches.map((b) => [b.id, b]));
  const missingByBatch = new Map<string, string[]>();
  for (const c of missing) missingByBatch.set(c.batch_id, [...(missingByBatch.get(c.batch_id) ?? []), c.class_date]);
  for (const [batchId, dates] of missingByBatch) {
    const b = batchById.get(batchId);
    if (!b) continue;
    const latest = dates.sort().at(-1)!;
    attention.push({
      tone: 'danger', kind: 'class',
      title: `${b.code}: ${dates.length} class${dates.length === 1 ? '' : 'es'} not logged`,
      detail: `${b.subject} Y${b.year_group} · latest ${shortDate(latest, true)}`,
      href: `/batches/${batchId}`,
    });
  }
  for (const s of current.filter((s) => s.missing_batch || s.missing_teacher)) {
    attention.push({
      tone: 'warn', kind: 'student',
      title: `${s.first_name} ${s.last_name} needs a ${s.missing_batch ? 'batch' : 'teacher'}`,
      detail: `Year ${s.year_group}`,
      href: `/students/${s.id}`,
    });
  }
  for (const b of openBatches.filter((b) => b.to_mark > 0)) {
    attention.push({
      tone: 'warn', kind: 'homework',
      title: `${b.code}: ${b.to_mark} homework to mark`,
      detail: `${b.subject} Y${b.year_group} · ${b.teacher}`,
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
      href: '/', // Enquiries screen is not built yet
    });
  }
  for (const b of openBatches.filter((b) => b.member_count >= b.capacity)) {
    attention.push({ tone: 'info', kind: 'full', title: `${b.code} is full`, detail: `${b.member_count}/${b.capacity} places`, href: `/batches/${b.id}` });
  }
  const order = { danger: 0, warn: 1, info: 2 };
  attention.sort((a, b) => order[a.tone] - order[b.tone]);

  return {
    today, from,
    studentCounts,
    activeTeachers: teachers.count ?? 0,
    attendanceSummary, attendanceTrend,
    homeworkSummary, classSummary,
    bySubject, byYear,
    places, placesSummary: { seats, filled, rate: pct(filled, seats), batches: openBatches.length },
    pipeline, enquirySummary: { open: openEnquiries.length, enrolled, lost, conversion: pct(enrolled, enrolled + lost) },
    attention,
  };
}
