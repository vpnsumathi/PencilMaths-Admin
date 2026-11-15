import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import {
  ASKED_BY, byText, csvCell, EVENT_LABEL, eventText, historyArgs, KIND_LABEL, listArgs, readFilters, resultText, STATUS_LABEL,
  ukClock, ukDate, type HistoryResult, type ListResult,
} from '@/lib/extraClasses';
import { createClient } from '@/lib/supabase/server';

const MAX_ROWS = 50000; // the most extra_class_list and extra_class_history return in one go

// The Extra classes page's "Export CSV": every class (List tab) or every change (History tab) that matches the
// page's filters, all pages. Opens in Excel or Google Sheets. The database decides what a teacher may see.
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse('Please sign in as staff or a teacher.', { status: 403 });
  const staff = viewer.kind === 'staff';
  const f = readFilters(Object.fromEntries(new URL(request.url).searchParams));
  const supabase = await createClient();
  const history = f.tab === 'history';

  const [{ data, error }, { data: subjects }] = await Promise.all([
    history
      ? supabase.rpc('extra_class_history', { p: historyArgs(f, 1, MAX_ROWS) })
      : supabase.rpc('extra_class_list', { p: listArgs(f, 1, MAX_ROWS) }),
    supabase.from('subjects').select('id, name'),
  ]);
  if (error) {
    console.error('Extra classes export:', error.message);
    const notReady = error.code === 'PGRST202';
    return new NextResponse(notReady ? 'The database is not ready for this yet.' : `Could not export: ${error.message}`, { status: notReady ? 503 : 400 });
  }
  const names = Object.fromEntries(((subjects ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  let head: string[];
  let lines: string[][];
  if (history) {
    head = ['Changed on', 'Changed at', 'Class', 'Class date', 'Class time', 'Teacher', 'What', 'Details', 'Student', 'Reason', 'By'];
    lines = (data as HistoryResult).rows.map((e) => [
      ukDate(e.at), ukClock(e.at), e.code ?? '', e.starts_at ? ukDate(e.starts_at) : '', e.starts_at ? ukClock(e.starts_at) : '',
      e.teacher ?? '', EVENT_LABEL[e.event] ?? e.event, eventText(e, names), e.student ?? e.students ?? '', e.reason ?? '', byText(e.by),
    ]);
  } else {
    head = ['Class', 'Date', 'Start', 'End', 'Minutes', 'Status', 'Subject', 'Teacher', 'Type', 'Students', 'Results', 'Makes up for',
      'Created by', 'Created on', 'Recorded after', 'Cancelled: asked by', 'Cancel reason', ...(staff ? ['Note'] : [])];
    lines = (data as ListResult).rows.map((r) => [
      r.code, ukDate(r.starts_at), ukClock(r.starts_at), ukClock(r.ends_at), String(r.length_minutes), STATUS_LABEL[r.status],
      r.subject, r.teacher, KIND_LABEL[r.kind],
      r.students.map((s) => s.name).join('; '),
      r.students.map((s) => `${s.name}: ${resultText(s.mark, s.mark_source, r.status === 'cancelled')}`).join('; '),
      r.students.filter((s) => s.missed_date).map((s) => `${s.name}: ${s.missed_date}`).join('; '),
      r.booked_by ?? '', ukDate(r.created_at), r.recorded_after ? 'Yes' : '',
      r.cancel_asked_by ? ASKED_BY[r.cancel_asked_by] : '', r.cancel_reason ?? '', ...(staff ? [r.note ?? ''] : []),
    ]);
  }

  // The BOM (﻿) makes Excel read names with accents correctly.
  const csv = `﻿${[head.map(csvCell).join(','), ...lines.map((l) => l.map(csvCell).join(','))].join('\r\n')}\r\n`;
  const span = f.from || f.to ? `${f.from ?? 'start'}-to-${f.to ?? 'now'}` : 'all';
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="extra-classes-${history ? 'history-' : ''}${span}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
