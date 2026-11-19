import Link from 'next/link';
import { Section } from '@/components/Section';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { formatDate } from '@/lib/format';
import { formatTrackerDate, standingLabel, standingTone, summaryLine, trackLessons } from '@/lib/lessons/tracker';
import { loadLessons, loadProgress, loadTracker, LESSON_STATUS, viewLessons, type PlanLessonRow } from '@/lib/lessons/trackerData';
import { createClient } from '@/lib/supabase/server';
import { setLessonStatus } from './actions';
import { CompleteLesson } from './CompleteLesson';
import { PlannerPicker } from './PlannerPicker';


type Lesson = PlanLessonRow & { lesson_homework: { id: string; slot: number; code: string; url: string | null }[] };

// The class's lesson plan from the Lesson library: Term and Module dropdowns, then that module's lessons
// with Start, Mark completed (sends Hw-1/2/3) and Undo. Opens on the module the class is on. With a Lesson Tracker,
// each lesson also shows its Class No., planned date and how it stands; the whole plan with dates is a page of its own.
export async function LessonPlanner({ batch, students, today, term: askedTerm, moduleName: askedModule }: {
  batch: { id: string; subject_id: string; year_group: number }; students: number; today: string;
  term?: string; moduleName?: string;
}) {
  const supabase = await createClient();
  const [{ lessons: all }, progress, { tracker, saved }, { data: sentRows }] = await Promise.all([
    loadLessons<Lesson>(supabase, batch, 'lesson_homework(id, slot, code, url)'),
    loadProgress(supabase, batch.id),
    loadTracker(supabase, batch.id),
    supabase.from('homework_sheets').select('lesson_homework_id').eq('batch_id', batch.id).not('lesson_homework_id', 'is', null),
  ]);
  // A lesson taken out of the spreadsheet stays only if the class already worked on it.
  const kept = all.filter((l) => l.active || progress.has(l.id));
  const lessons = kept.length ? kept : all;
  const sent = new Set((sentRows ?? []).map((s) => s.lesson_homework_id as string));
  const { byLesson, summary } = trackLessons(viewLessons(all, progress), saved, today);
  const statusOf = (id: string) => (progress.get(id)?.status as string) ?? 'not_started';

  // Modules per term, in the order they first appear.
  const modules: Record<number, string[]> = {};
  for (const l of lessons) {
    modules[l.term] ??= [];
    if (!modules[l.term].includes(l.module)) modules[l.term].push(l.module);
  }
  // Where the class is: the first lesson in progress, otherwise the first not completed.
  const current = lessons.find((l) => statusOf(l.id) === 'in_progress') ?? lessons.find((l) => statusOf(l.id) !== 'complete') ?? lessons[0];
  let term = Number(askedTerm);
  let moduleName = askedModule ?? '';
  if (!modules[term]?.includes(moduleName)) {
    term = modules[term] ? term : current.term;
    moduleName = modules[term].includes(current.module) && term === current.term ? current.module : modules[term][0];
  }
  const shown = lessons.filter((l) => l.term === term && l.module === moduleName);
  const doneInTerm = lessons.filter((l) => l.term === term && statusOf(l.id) === 'complete').length;
  const inTerm = lessons.filter((l) => l.term === term).length;

  return (
    // Open by itself after choosing a term or module, or after Start / Undo (those send the term and module back).
    <Section id="lesson-plan" title="Lesson plan" forceOpen={Boolean(askedTerm || askedModule)}
      summary={`Term ${term}: ${doneInTerm} of ${inTerm} lessons completed · now on ${current.code} ${current.name}${tracker && summary.overdue ? ` · ${summary.overdue} class${summary.overdue === 1 ? '' : 'es'} overdue` : ''}`}>
      <p className={ui.muted} style={{ margin: '0 0 10px', fontSize: 13 }}>
        {tracker ? `${summaryLine(summary, tracker)}. ` : ''}
        <Link href={`/batches/${batch.id}/lesson-tracker`} className={ui.link}>Lesson plan with dates</Link>
      </p>
      <PlannerPicker modules={modules} term={term} moduleName={moduleName} />

      <ol className={ui.list}>
        {shown.map((l) => {
          const status = statusOf(l.id);
          const p = progress.get(l.id);
          const hw = [...l.lesson_homework].sort((a, b) => a.slot - b.slot);
          const sentHw = hw.filter((h) => sent.has(h.id));
          const track = byLesson.get(l.id);
          const trackLabel = track ? standingLabel(track.standing) : null;
          const hidden = (
            <>
              <input type="hidden" name="batch_id" value={batch.id} />
              <input type="hidden" name="lesson_id" value={l.id} />
              <input type="hidden" name="term" value={term} />
              <input type="hidden" name="module" value={moduleName} />
            </>
          );
          return (
            <li key={l.id} style={{ flexWrap: 'wrap' }} className={status === 'in_progress' ? ui.rowLive : undefined}>
              <span>
                <strong>{l.code}</strong> {l.name}
                {!l.active && <> <em className={ui.muted}>(removed from the plan)</em></>}
                <span className={ui.muted}>
                  {l.class_no != null && <> · Class {l.class_no}{track?.plannedOn ? `, ${formatTrackerDate(track.plannedOn)}` : ''}</>}
                  {' '}· {hw.map((h) => `Hw-${h.slot} ${h.code}${h.url ? '' : ' ⚠️'}`).join(' · ')}
                  {sentHw.length > 0 && ` · sent: ${sentHw.map((h) => `Hw-${h.slot}`).join(', ')}`}
                </span>
              </span>
              <span className={ui.formActions}>
                {track && trackLabel && <StatusBadge status={track.standing.kind} label={trackLabel} />}
                <StatusBadge
                  status={status === 'complete' ? (track && standingTone(track.standing) === 'bad' ? 'late' : 'active') : status === 'in_progress' ? 'in_progress' : 'closed'}
                  label={status === 'complete' && p?.completed_on ? `Completed ${formatDate(p.completed_on as string)}` : LESSON_STATUS[status]}
                />
                {status === 'not_started' && (
                  <form action={setLessonStatus}>{hidden}<button name="status" value="in_progress" className={ui.button}>Start</button></form>
                )}
                {status === 'in_progress' && (
                  <CompleteLesson batchId={batch.id} lesson={l} students={students} today={today} term={term} moduleName={moduleName}
                    sheets={hw.map((h) => ({ id: h.id, slot: h.slot, code: h.code, url: h.url, sent: sent.has(h.id) }))} />
                )}
                {status !== 'not_started' && (
                  <form action={setLessonStatus}>
                    {hidden}
                    <button name="status" value={status === 'complete' ? 'in_progress' : 'not_started'} className={ui.button}
                      title={status === 'complete' ? 'Back to In progress. Homework already sent stays.' : 'Back to Not started'}>
                      Undo
                    </button>
                  </form>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={ui.muted}>Lessons and worksheets come from the <Link href="/lesson-library" className={ui.link}>Lesson library</Link>.</p>
    </Section>
  );
}
