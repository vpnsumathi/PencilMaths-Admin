import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { trackLessons, type ClassState, type LessonTrack, type SavedClass, type TrackSummary, type ViewLesson } from './tracker';

// Loading a batch's lesson plan and its Lesson Tracker for the batch page, the "Lesson plan with dates" page and
// the Excel export. Three small queries by batch, run side by side. Nothing is worked out in the database.
//
// Until 20261119000001_lesson_tracker.sql has run, `ready` is false: the lessons load without Class No.
// and the tracker parts of the pages stay hidden.

export type Tracker = { startOn: string; weekdays: number[]; scope: 'whole_year' | 'remaining'; setAt: string; setBy: string | null };
export type PlanLessonRow = {
  id: string; term: number; module: string; code: string; name: string; position: number;
  class_no: number | null; active: boolean;
};

const LESSON_COLUMNS = 'id, term, module, code, name, position';

// The batch's lessons, in plan order. `extra` adds columns, e.g. the homework sheets for the batch page.
export async function loadLessons<T = PlanLessonRow>(
  supabase: SupabaseClient, batch: { subject_id: string; year_group: number }, extra = '',
): Promise<{ lessons: T[]; ready: boolean }> {
  const query = (columns: string) => supabase.from('lessons').select(columns)
    .eq('subject_id', batch.subject_id).eq('year_group', batch.year_group)
    .order('term').order('position');
  const withTracker = await query(`${LESSON_COLUMNS}, class_no, active${extra ? `, ${extra}` : ''}`);
  if (!withTracker.error) return { lessons: (withTracker.data ?? []) as T[], ready: true };
  // Before the database script: the same lessons, every one active and without a Class No.
  const plain = await query(`${LESSON_COLUMNS}${extra ? `, ${extra}` : ''}`);
  const rows = ((plain.data ?? []) as unknown as Record<string, unknown>[]).map((l) => ({ ...l, class_no: null, active: true }));
  return { lessons: rows as T[], ready: false };
}

export async function loadTracker(supabase: SupabaseClient, batchId: string): Promise<{ tracker: Tracker | null; saved: SavedClass[] }> {
  const [{ data: t, error }, { data: rows }] = await Promise.all([
    supabase.from('batch_trackers').select('start_on, weekdays, scope, set_at, staff(full_name)').eq('batch_id', batchId).maybeSingle(),
    supabase.from('batch_class_dates').select('term, class_no, state, planned_on, lesson_ids').eq('batch_id', batchId),
  ]);
  if (error || !t) return { tracker: null, saved: [] };
  return {
    tracker: {
      startOn: t.start_on as string, weekdays: (t.weekdays as number[]) ?? [], scope: t.scope as Tracker['scope'],
      setAt: t.set_at as string, setBy: (t.staff as unknown as { full_name: string } | null)?.full_name ?? null,
    },
    saved: (rows ?? []).map((r) => ({
      term: r.term as number, classNo: r.class_no as number, state: r.state as ClassState,
      plannedOn: (r.planned_on as string | null) ?? null, lessonIds: (r.lesson_ids as string[]) ?? [],
    })),
  };
}

// The class's progress: when each lesson was completed (only completed lessons have a date that counts).
export async function loadProgress(supabase: SupabaseClient, batchId: string) {
  const { data } = await supabase.from('batch_lessons').select('lesson_id, status, started_on, completed_on').eq('batch_id', batchId);
  return new Map((data ?? []).map((p) => [p.lesson_id as string, p as { lesson_id: string; status: string; started_on: string | null; completed_on: string | null }]));
}

export const viewLessons = (lessons: PlanLessonRow[], progress: Awaited<ReturnType<typeof loadProgress>>): ViewLesson[] =>
  lessons.map((l) => {
    const p = progress.get(l.id);
    return { id: l.id, term: l.term, classNo: l.class_no, active: l.active, completedOn: p?.status === 'complete' ? p.completed_on : null };
  });

export const LESSON_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', complete: 'Completed' };
type DatedFields = { status: string; completedOn: string | null; track: LessonTrack };
export type DatedLesson = PlanLessonRow & DatedFields;

// Everything the "Lesson plan with dates" page and the Excel export show: every lesson of the plan in order
// (a lesson removed from the spreadsheet only if the class already worked on it), with its planned date,
// its progress and how it stands. Three queries by batch, side by side. `extra` adds lesson columns (the Excel
// export adds the homework codes).
export async function loadPlanWithDates<T extends PlanLessonRow = PlanLessonRow>(
  supabase: SupabaseClient, batch: { id: string; subject_id: string; year_group: number }, today: string, extra = '',
): Promise<{ ready: boolean; tracker: Tracker | null; saved: SavedClass[]; lessons: (T & DatedFields)[]; summary: TrackSummary }> {
  const [{ lessons, ready }, progress, { tracker, saved }] = await Promise.all([
    loadLessons<T>(supabase, batch, extra), loadProgress(supabase, batch.id), loadTracker(supabase, batch.id),
  ]);
  const { byLesson, summary } = trackLessons(viewLessons(lessons, progress), saved, today);
  const shown = lessons.filter((l) => l.active || progress.has(l.id)).map((l) => {
    const p = progress.get(l.id);
    return {
      ...l, status: p?.status ?? 'not_started', completedOn: p?.status === 'complete' ? p.completed_on : null,
      track: byLesson.get(l.id) as LessonTrack,
    };
  });
  return { ready, tracker, saved, lessons: shown, summary };
}
