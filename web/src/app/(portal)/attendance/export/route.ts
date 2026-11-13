import { NextResponse } from 'next/server';
import { readFilters, reportArgs, setByText, type ListRow } from '@/lib/attendanceReport';
import { getViewer } from '@/lib/auth';
import { ATTENDANCE_LABEL, markLabel } from '@/lib/classLink';
import { formatClock, formatDay } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

const CHUNK = 5000; // the most attendance_list returns in one go
const MAX_ROWS = 50000;

// One spreadsheet cell. Quoted when needed; text that a spreadsheet would run as a formula (=, +, -, @) gets a ' first.
const cell = (v: string | null | undefined) => {
  let s = v ?? '';
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// The Attendance page's "Export CSV": every mark that matches the page's filters, newest first,
// one row per student per class. Opens in Excel or Google Sheets. The database decides what a teacher may see.
export async function GET(request: Request) {
  if (!(await getViewer())) return new NextResponse('Please sign in as staff or a teacher.', { status: 403 });
  const f = readFilters(Object.fromEntries(new URL(request.url).searchParams));
  const supabase = await createClient();

  const rows: ListRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += CHUNK) {
    const { data, error } = await supabase.rpc('attendance_list', {
      ...reportArgs(f), p_show: f.show, p_limit: CHUNK, p_offset: offset,
    });
    if (error) {
      console.error('Attendance export:', error.message);
      const notReady = error.code === 'PGRST202';
      return new NextResponse(notReady ? 'The database is not ready for this yet.' : `Could not export: ${error.message}`, { status: notReady ? 503 : 400 });
    }
    const page = data as { total: number; rows: ListRow[] };
    rows.push(...page.rows);
    if (rows.length >= page.total || page.rows.length < CHUNK) break;
  }

  const head = ['Date', 'Class time', 'Batch', 'Subject', 'Student code', 'First name', 'Last name',
    'Attendance', 'Set by', 'Portal check-in', 'Last change', 'Reason', 'Changed by', 'Changed on'];
  const lines = rows.map((r) => [
    r.class_date,
    r.start_time ? r.start_time.slice(0, 5) : '',
    r.batch_code, r.subject, r.student_code, r.first_name, r.last_name,
    markLabel(r.status, r.source),
    setByText(r.source, r.set_by),
    r.joined_at ? formatClock(r.joined_at) : '',
    r.last_change ? `${markLabel(r.last_change.from, r.last_change.from_source)} to ${ATTENDANCE_LABEL[r.last_change.to]}` : '',
    r.last_change?.reason ?? '',
    r.last_change?.by ?? '',
    r.last_change ? `${formatDay(r.last_change.at)} ${formatClock(r.last_change.at)}` : '',
  ].map(cell).join(','));

  // The BOM (﻿) makes Excel read names with accents correctly.
  const csv = `﻿${[head.join(','), ...lines].join('\r\n')}\r\n`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="attendance-${f.from}-to-${f.to}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
