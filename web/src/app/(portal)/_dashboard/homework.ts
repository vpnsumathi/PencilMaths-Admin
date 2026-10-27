import { todayInUk } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import type { ChartBar } from './data';

// The dashboard's Homework section: headline numbers, the marking queue, students falling behind
// and each batch's on-time hand-in rate. Not tied to the range filter: "this week" starts on Monday,
// the rate covers the last 4 weeks, and overdue looks back 90 days (the hand-in link's window).

const DAY_MS = 86_400_000;
const BEHIND_AT = 2; // overdue homeworks that put a student on the "falling behind" list

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// UK mobile "07700 900123" → "447700900123", the form wa.me links need. null if it doesn't look like a number.
function whatsappNumber(phone: string | null) {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1) || null;
  if (digits.startsWith('00')) return digits.slice(2) || null;
  if (digits.startsWith('0')) return `44${digits.slice(1)}`;
  return digits.length >= 10 ? digits : null;
}

type Sheet = { id: string; title: string; due_on: string | null; set_on: string; batch_id: string; batches: { code: string; closed_on: string | null } };
type Student = { first_name: string; last_name: string; status: string; family_id: string | null };
type Row = {
  sheet_id: string; student_id: string; status: string; received_on: string | null; marked_on: string | null;
  homework_sheets: Sheet; students: Student;
};

export type ToMark = {
  key: string; student: string; batch: string; homework: string; waiting: number; href: string;
};
export type Behind = {
  studentId: string; name: string; firstName: string; batches: string; overdue: number; titles: string[];
  oldestDue: string; phone: string | null; group: string | null; parent: string | null;
};

export async function loadHomework() {
  const supabase = await createClient();
  const today = todayInUk();
  // Monday of this week (getUTCDay: 0 = Sunday).
  const weekStart = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const rateFrom = addDays(today, -28);
  const lookBack = addDays(today, -90);

  const select = 'sheet_id, student_id, status, received_on, marked_on, homework_sheets!inner(id, title, due_on, set_on, batch_id, batches(code, closed_on)), students!inner(first_name, last_name, status, family_id)';

  const [received, pending, handedThisWeek, markedThisWeek, recent, drafts, enrolments, batches] = await Promise.all([
    // Handed in but not marked, however old.
    supabase.from('homework_results').select(select).eq('status', 'received').neq('students.status', 'left'),
    // Not handed in, for homework set in the last 90 days.
    supabase.from('homework_results').select(select).eq('status', 'pending')
      .gte('homework_sheets.set_on', lookBack).neq('students.status', 'left'),
    supabase.from('homework_results').select('sheet_id', { count: 'exact', head: true }).gte('received_on', weekStart),
    supabase.from('homework_results').select('sheet_id', { count: 'exact', head: true })
      .eq('status', 'marked').gte('marked_on', weekStart),
    // Homework due in the last 4 weeks (and already past its due date), for the on-time rate.
    supabase.from('homework_results').select(select)
      .gte('homework_sheets.due_on', rateFrom).lt('homework_sheets.due_on', today)
      .neq('status', 'excused')
      .neq('students.status', 'left'),
    // Marked with Save & close: the marked sheet is saved but not sent to the student yet.
    supabase.from('homework_markups').select('sheet_id, student_id').not('draft_file_id', 'is', null),
    supabase.from('enrolments').select('student_id, batch_id').is('ended_on', null),
    supabase.from('batch_list').select('id, code, subject, year_group').is('closed_on', null).order('code'),
  ]);
  for (const r of [received, pending, handedThisWeek, markedThisWeek, recent, drafts, enrolments, batches]) {
    if (r.error) throw r.error;
  }

  const receivedRows = (received.data ?? []) as unknown as Row[];
  const pendingRows = (pending.data ?? []) as unknown as Row[];
  const draftKeys = new Set((drafts.data ?? []).map((d) => `${d.sheet_id}:${d.student_id}`));
  // Only homework for a batch the student is still in counts as overdue.
  const current = new Set((enrolments.data ?? []).map((e) => `${e.student_id}:${e.batch_id}`));

  /* ---------- Needs marking: oldest hand-in first; saved-but-not-sent ones are counted separately ---------- */
  const toMark: ToMark[] = receivedRows
    .filter((r) => !draftKeys.has(`${r.sheet_id}:${r.student_id}`))
    .map((r) => ({ r, since: r.received_on ?? r.homework_sheets.set_on }))
    .sort((a, b) => a.since.localeCompare(b.since))
    .map(({ r, since }) => ({
      key: `${r.sheet_id}:${r.student_id}`,
      student: `${r.students.first_name} ${r.students.last_name}`,
      batch: r.homework_sheets.batches.code,
      homework: r.homework_sheets.title,
      waiting: Math.max(daysBetween(since, today), 0),
      href: `/batches/${r.homework_sheets.batch_id}/mark?sheet=${r.sheet_id}&student=${r.student_id}`,
    }));

  /* ---------- Overdue: not handed in after the due date ---------- */
  const overdue = pendingRows.filter((r) =>
    r.homework_sheets.due_on !== null && r.homework_sheets.due_on < today
    && !r.homework_sheets.batches.closed_on && current.has(`${r.student_id}:${r.homework_sheets.batch_id}`));

  /* ---------- Falling behind: BEHIND_AT or more overdue ---------- */
  const byStudent = new Map<string, Row[]>();
  for (const r of overdue) byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r]);
  const behindRows = [...byStudent.entries()].filter(([, rows]) => rows.length >= BEHIND_AT);

  // Parent contact for the WhatsApp nudge: the family's main guardian, and the family's group name.
  const familyIds = [...new Set(behindRows.map(([, rows]) => rows[0].students.family_id).filter((f): f is string => !!f))];
  const [families, guardians] = familyIds.length
    ? await Promise.all([
        supabase.from('families').select('id, whatsapp_group_name').in('id', familyIds),
        supabase.from('guardians').select('family_id, full_name, phone, is_primary').in('family_id', familyIds),
      ])
    : [{ data: [] }, { data: [] }];

  const behind: Behind[] = behindRows
    .map(([studentId, rows]) => {
      const s = rows[0].students;
      const family = (families.data ?? []).find((f) => f.id === s.family_id);
      const guardian = (guardians.data ?? [])
        .filter((g) => g.family_id === s.family_id && g.phone)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
      const sorted = [...rows].sort((a, b) => a.homework_sheets.due_on!.localeCompare(b.homework_sheets.due_on!));
      return {
        studentId,
        name: `${s.first_name} ${s.last_name}`,
        firstName: s.first_name,
        batches: [...new Set(rows.map((r) => r.homework_sheets.batches.code))].join(', '),
        overdue: rows.length,
        titles: sorted.map((r) => r.homework_sheets.title),
        oldestDue: sorted[0].homework_sheets.due_on!,
        phone: whatsappNumber(guardian?.phone ?? null),
        group: family?.whatsapp_group_name ?? null,
        parent: guardian?.full_name?.split(' ')[0] ?? null,
      };
    })
    .sort((a, b) => b.overdue - a.overdue || a.oldestDue.localeCompare(b.oldestDue));

  /* ---------- Hand-in rate by batch: handed in on or before the due date, last 4 weeks ---------- */
  const recentRows = (recent.data ?? []) as unknown as Row[];
  const rate: ChartBar[] = (batches.data ?? []).map((b) => {
    const rows = recentRows.filter((r) => r.homework_sheets.batch_id === b.id);
    // Paper homework marked without a hand-in has no received date, so the marking date stands in for it.
    const onTime = rows.filter((r) => {
      const handed = r.received_on ?? r.marked_on;
      return handed !== null && handed <= r.homework_sheets.due_on!;
    }).length;
    const value = rows.length ? Math.round((100 * onTime) / rows.length) : null;
    return {
      key: b.id,
      label: b.code,
      value,
      display: value === null ? 'No homework due' : `${value}%`,
      detail: `${b.subject} · Year ${b.year_group} · ${onTime} of ${rows.length} on time`,
      href: `/batches/${b.id}#homework`,
    };
  });

  return {
    summary: {
      toMark: toMark.length,
      overdue: overdue.length,
      handedThisWeek: handedThisWeek.count ?? 0,
      markedThisWeek: markedThisWeek.count ?? 0,
      notSent: draftKeys.size,
    },
    weekStart, toMark, behind, rate,
  };
}
