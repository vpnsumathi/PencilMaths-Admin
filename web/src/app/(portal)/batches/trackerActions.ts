'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { redirectWith, text } from '@/lib/form';
import { checkPlan, classKey, formatTrackerDate, ISO_DATE, planClasses, type Scope } from '@/lib/lessons/tracker';
import { loadLessons, loadProgress, viewLessons } from '@/lib/lessons/trackerData';
import { UUID } from '@/lib/options';

// The message for a refusal from the database. P0001 = raised on purpose (safe to show);
// PGRST202 = the function doesn't exist yet (the database script hasn't been run).
function dbProblem(error: { code?: string; message: string }, fallback: string) {
  if (error.code === 'P0001') return error.message;
  if (error.code === 'PGRST202') return 'The database is not ready for the Lesson Tracker yet: run 20261119000001_lesson_tracker.sql in Supabase first.';
  return fallback;
}

// Set Lesson Tracker (admin): works out the date of every class once, from the batch's lesson plan, the start date,
// the teaching days and the scope, and saves it. The database checks every rule again before it saves.
export async function setLessonTracker(form: FormData) {
  const batchId = text(form, 'batch_id');
  if (!UUID.test(batchId)) redirectWith('/batches', 'error', 'Batch not found.');
  const page = `/batches/${batchId}/lesson-tracker`;
  const start = text(form, 'start_on');
  const weekdays = [...new Set(form.getAll('weekday').map(Number).filter((w) => Number.isInteger(w) && w >= 1 && w <= 7))].sort((a, b) => a - b);
  const scope: Scope = text(form, 'scope') === 'remaining' ? 'remaining' : 'whole_year';
  if (!ISO_DATE.test(start)) redirectWith(page, 'error', 'Choose a start date.');
  if (weekdays.length === 0) redirectWith(page, 'error', 'Tick at least one teaching day.');

  const { supabase } = await requireAdmin(page);
  const { data: batch } = await supabase.from('batches').select('id, subject_id, year_group, closed_on').eq('id', batchId).maybeSingle();
  if (!batch) redirectWith('/batches', 'error', 'Batch not found.');
  if (batch.closed_on) redirectWith(page, 'error', 'This batch is closed, so its Lesson Tracker can\'t be changed.');

  const [{ lessons, ready }, progress, { data: slots }] = await Promise.all([
    loadLessons(supabase, batch), loadProgress(supabase, batchId),
    supabase.from('batch_slots').select('weekday').eq('batch_id', batchId),
  ]);
  const classDays = new Set((slots ?? []).map((s) => s.weekday as number));
  if (classDays.size === 0) redirectWith(page, 'error', 'Add the batch\'s weekly class times first (Batch settings): the Lesson Tracker plans the classes on those days.');
  if (weekdays.some((w) => !classDays.has(w))) redirectWith(page, 'error', 'Teaching days must be days the batch has a weekly class time.');
  if (!ready) redirectWith(page, 'error', 'The database is not ready for the Lesson Tracker yet: run 20261119000001_lesson_tracker.sql in Supabase first.');
  const active = viewLessons(lessons, progress).filter((l) => l.active)
    .map((l) => ({ term: l.term, classNo: l.classNo, done: Boolean(l.completedOn) }));

  let plan: ReturnType<typeof planClasses>;
  try {
    plan = planClasses(active, start, weekdays, scope);
  } catch {
    redirectWith(page, 'error', 'Choose a start date.');
  }
  if (plan.classes.length === 0) redirectWith(page, 'error', 'No lesson in this plan has a Class No. Import a lesson plan with a Class No. column first.');
  const unplaced = plan.classes.filter((c) => c.state === 'unplaced').length;
  if (unplaced > 0 && text(form, 'save_anyway') !== 'yes') {
    redirectWith(page, 'error', `${unplaced} class${unplaced === 1 ? '' : 'es'} don't fit before 21 July. Add a teaching day or start earlier, or tick "Save anyway".`);
  }
  const problems = checkPlan(active, new Map(plan.classes.map((c) => [classKey(c.term, c.classNo), c.plannedOn])), start, weekdays);
  if (problems.length) {
    console.error('setLessonTracker: plan failed its own check:', problems);
    redirectWith(page, 'error', `Could not plan the classes: ${problems[0]}`);
  }

  const { data, error } = await supabase.rpc('set_lesson_tracker', {
    p_batch: batchId, p_start: start, p_weekdays: weekdays, p_scope: scope,
    p_classes: plan.classes.map((c) => ({ term: c.term, class_no: c.classNo, state: c.state, planned_on: c.plannedOn })),
  });
  if (error) {
    console.error('setLessonTracker failed:', error.message);
    redirectWith(page, 'error', dbProblem(error, 'Could not set the Lesson Tracker.'));
  }
  const r = data as { planned: number; unplaced: number; done_before: number; first: string | null; last: string | null };
  revalidatePath(`/batches/${batchId}`);
  revalidatePath(page);
  redirectWith(page, 'ok', [
    `Lesson Tracker set: ${r.planned} class${r.planned === 1 ? '' : 'es'}`,
    r.first && r.last ? ` from ${formatTrackerDate(r.first)} to ${formatTrackerDate(r.last)}.` : '.',
    r.done_before ? ` ${r.done_before} already done were left out.` : '',
    r.unplaced ? ` ${r.unplaced} don't fit before 21 July.` : '',
  ].join(''));
}

// Remove tracker (admin): deletes the planned dates. The class's progress is not touched.
export async function clearLessonTracker(form: FormData) {
  const batchId = text(form, 'batch_id');
  if (!UUID.test(batchId)) redirectWith('/batches', 'error', 'Batch not found.');
  const page = `/batches/${batchId}/lesson-tracker`;
  const { supabase } = await requireAdmin(page);
  const { error } = await supabase.rpc('clear_lesson_tracker', { p_batch: batchId });
  if (error) {
    console.error('clearLessonTracker failed:', error.message);
    redirectWith(page, 'error', dbProblem(error, 'Could not remove the Lesson Tracker.'));
  }
  revalidatePath(`/batches/${batchId}`);
  revalidatePath(page);
  redirectWith(page, 'ok', 'Lesson Tracker removed. The lessons and what the class has completed are as they were.');
}
