import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { LESSON_STATUS, loadPlanWithDates, type PlanLessonRow } from '@/lib/lessons/trackerData';
import { trackerWorkbook } from '@/lib/lessons/trackerExcel';
import { todayInUk, UUID, yearLabel } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

type Row = PlanLessonRow & { lesson_homework: { slot: number; code: string }[] | null };

// "Download Excel" on the "Lesson plan with dates" page (admins only): the batch's lesson plan with every planned date.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (viewer?.kind !== 'staff' || viewer.role !== 'admin') return new NextResponse('Only admins can download the Lesson Tracker.', { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse('Batch not found.', { status: 404 });

  const supabase = await createClient();
  const { data: batch } = await supabase.from('batches').select('id, code, subject_id, year_group, subjects(name)').eq('id', id).maybeSingle();
  if (!batch) return new NextResponse('Batch not found.', { status: 404 });
  const today = todayInUk();
  const { tracker, lessons, summary } = await loadPlanWithDates<Row>(supabase, batch, today, 'lesson_homework(slot, code)');
  if (!tracker) return new NextResponse('This batch has no Lesson Tracker yet.', { status: 404 });

  const subject = (batch.subjects as unknown as { name: string } | null)?.name ?? batch.subject_id;
  const file = await trackerWorkbook({
    heading: `${batch.code} · ${subject} · ${yearLabel(batch.year_group)}`,
    tracker, summary, today,
    lessons: lessons.map((l) => ({
      term: l.term, module: l.module, code: l.code, name: l.name, class_no: l.class_no, active: l.active,
      homework: [1, 2, 3].map((slot) => l.lesson_homework?.find((h) => h.slot === slot)?.code ?? ''),
      status: LESSON_STATUS[l.status] ?? l.status, completedOn: l.completedOn, track: l.track,
    })),
  });

  const name = `${batch.code} Lesson Tracker ${today}.xlsx`.replace(/[^\w .-]/g, '_');
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
