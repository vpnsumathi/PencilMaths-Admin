import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { formatDate } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { setLessonStatus } from './actions';
import { CompleteLesson } from './CompleteLesson';
import { PlannerPicker } from './PlannerPicker';

const STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', complete: 'Completed' };

type Lesson = {
  id: string; term: number; module: string; code: string; name: string; position: number;
  lesson_homework: { id: string; slot: number; code: string; url: string | null }[];
};

// The class's lesson plan from the Lesson library: Term and Module dropdowns, then that module's lessons
// with Start, Mark completed (sends Hw-1/2/3) and Undo. Opens on the module the class is on.
export async function LessonPlanner({ batch, students, today, term: askedTerm, moduleName: askedModule }: {
  batch: { id: string; subject_id: string; year_group: number }; students: number; today: string;
  term?: string; moduleName?: string;
}) {
  const supabase = await createClient();
  const [{ data: lessonRows }, { data: progressRows }, { data: sentRows }] = await Promise.all([
    supabase.from('lessons').select('id, term, module, code, name, position, lesson_homework(id, slot, code, url)')
      .eq('subject_id', batch.subject_id).eq('year_group', batch.year_group)
      .order('term').order('position'),
    supabase.from('batch_lessons').select('lesson_id, status, started_on, completed_on').eq('batch_id', batch.id),
    supabase.from('homework_sheets').select('lesson_homework_id').eq('batch_id', batch.id).not('lesson_homework_id', 'is', null),
  ]);
  const lessons = (lessonRows ?? []) as Lesson[];
  const progress = new Map((progressRows ?? []).map((p) => [p.lesson_id as string, p]));
  const sent = new Set((sentRows ?? []).map((s) => s.lesson_homework_id as string));
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
    <section className={ui.card} style={{ marginTop: 16 }}>
      <h2>Lesson plan</h2>
      <p className={ui.muted} style={{ marginTop: 0 }}>
        Term {term}: {doneInTerm} of {inTerm} lessons completed. Now on {current.code} {current.name}.
      </p>
      <PlannerPicker modules={modules} term={term} moduleName={moduleName} />

      <ol className={ui.list}>
        {shown.map((l) => {
          const status = statusOf(l.id);
          const p = progress.get(l.id);
          const hw = [...l.lesson_homework].sort((a, b) => a.slot - b.slot);
          const sentHw = hw.filter((h) => sent.has(h.id));
          const hidden = (
            <>
              <input type="hidden" name="batch_id" value={batch.id} />
              <input type="hidden" name="lesson_id" value={l.id} />
              <input type="hidden" name="term" value={term} />
              <input type="hidden" name="module" value={moduleName} />
            </>
          );
          return (
            <li key={l.id} style={{ flexWrap: 'wrap' }}>
              <span>
                <strong>{l.code}</strong> {l.name}
                <span className={ui.muted}>
                  {' '}· {hw.map((h) => `Hw-${h.slot} ${h.code}${h.url ? '' : ' ⚠️'}`).join(' · ')}
                  {sentHw.length > 0 && ` · sent: ${sentHw.map((h) => `Hw-${h.slot}`).join(', ')}`}
                </span>
              </span>
              <span className={ui.formActions}>
                <StatusBadge
                  status={status === 'complete' ? 'active' : status === 'in_progress' ? 'trial' : 'closed'}
                  label={status === 'complete' && p?.completed_on ? `Completed ${formatDate(p.completed_on as string)}` : STATUS[status]}
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
    </section>
  );
}
