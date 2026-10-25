import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alerts } from '@/components/Alerts';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { formatDate } from '@/lib/format';
import { STUDENT_STATUSES, todayInUk, UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { setBatchClosed, setTopicStatus } from '../actions';
import { CompleteTopic } from '../CompleteTopic';
import { BatchForm } from '../BatchForm';
import { HomeworkSection } from '../HomeworkSection';
import { LessonPlanner } from '../LessonPlanner';

export const metadata = { title: 'Batch' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; term?: string; module?: string }>;
};

const TOPIC_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', complete: 'Completed' };

export default async function BatchPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { ok, error: problem, term, module: moduleName } = await searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: batch }, { data: slots }, { data: members }, { data: topics }, { data: subjects }, { data: teachers }] =
    await Promise.all([
      supabase
        .from('batches')
        .select('id, code, subject_id, year_group, teacher_id, capacity, started_on, closed_on, subjects(name)')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('batch_slots').select('weekday, start_time').eq('batch_id', id).order('weekday').order('start_time'),
      // Current students: open enrolments in this batch, with the student's details joined in.
      supabase
        .from('enrolments')
        .select('id, students(id, code, first_name, last_name, year_group, status)')
        .eq('batch_id', id)
        .is('ended_on', null),
      supabase.from('batch_topics').select('id, position, name, status, completed_on').eq('batch_id', id).order('position'),
      supabase.from('subjects').select('id, name').order('sort'),
      supabase.from('teachers').select('id, first_name, last_name, subject_id').neq('status', 'left').order('first_name'),
    ]);
  if (!batch) notFound();
  // Classes whose subject and year are in the Lesson library use the term and module lesson planner.
  const { count: libraryLessons } = await supabase
    .from('lessons').select('id', { count: 'exact', head: true })
    .eq('subject_id', batch.subject_id).eq('year_group', batch.year_group);
  const usesLibrary = (libraryLessons ?? 0) > 0;
  // Homework already sent by completing a topic, by topic.
  const { data: topicHomework } = await supabase
    .from('homework_sheets').select('topic_id, title').eq('batch_id', id).not('topic_id', 'is', null);
  const sentFor = new Map((topicHomework ?? []).map((h) => [h.topic_id as string, h.title as string]));
  const today = todayInUk();

  const subjectName = (batch.subjects as unknown as { name: string } | null)?.name ?? batch.subject_id;
  const students = (members ?? [])
    .map((m) => m.students as unknown as { id: string; code: string; first_name: string; last_name: string; year_group: number; status: string })
    .sort((a, b) => a.first_name.localeCompare(b.first_name));

  return (
    <>
      <Link href="/batches" className={ui.back}>← All batches</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>{batch.code} · {subjectName} · Year {batch.year_group}</h1>
          <p className={ui.subtitle}>
            {students.length} of {batch.capacity} places used{batch.closed_on ? ` · closed ${formatDate(batch.closed_on)}` : ''}
          </p>
        </div>
        <form action={setBatchClosed}>
          <input type="hidden" name="id" value={batch.id} />
          <input type="hidden" name="close" value={String(!batch.closed_on)} />
          <button className={batch.closed_on ? ui.button : ui.dangerButton}>{batch.closed_on ? 'Reopen batch' : 'Close batch'}</button>
        </form>
      </div>
      <Alerts ok={ok} problem={problem} />

      <BatchForm
        batch={{ ...batch, slots: slots ?? [] }}
        subjects={subjects ?? []}
        teachers={teachers ?? []}
      />

      <div className={usesLibrary ? undefined : ui.columns}>
        <section className={ui.card}>
          <h2>Students</h2>
          {students.length === 0 ? (
            <p className={ui.empty}>No students yet. Add them from a student&apos;s page.</p>
          ) : (
            <ul className={ui.list}>
              {students.map((s) => (
                <li key={s.id}>
                  <Link href={`/students/${s.id}`} className={ui.link}>{s.first_name} {s.last_name}</Link>
                  <span className={ui.muted}>Year {s.year_group} · <StatusBadge status={s.status} label={STUDENT_STATUSES[s.status] ?? s.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!usesLibrary && <section className={ui.card}>
          <h2>Lesson plan</h2>
          {(topics ?? []).length === 0 ? (
            <p className={ui.empty}>No topics. Add some to the subject&apos;s curriculum first.</p>
          ) : (
            <ol className={ui.list}>
              {(topics ?? []).map((t) => (
                <li key={t.id} style={{ flexWrap: 'wrap' }}>
                  <span>
                    {t.position}. {t.name}
                    {sentFor.has(t.id) && <span className={ui.muted}> · homework sent: {sentFor.get(t.id)}</span>}
                  </span>
                  <span className={ui.formActions}>
                    <StatusBadge
                      status={t.status === 'complete' ? 'active' : t.status === 'in_progress' ? 'trial' : 'closed'}
                      label={t.status === 'complete' && t.completed_on
                        ? `Completed ${formatDate(t.completed_on)}`
                        : TOPIC_STATUS[t.status] ?? t.status}
                    />
                    {t.status === 'not_started' && (
                      <form action={setTopicStatus}>
                        <input type="hidden" name="batch_id" value={batch.id} />
                        <input type="hidden" name="topic_id" value={t.id} />
                        <button name="status" value="in_progress" className={ui.button}>Start</button>
                      </form>
                    )}
                    {t.status === 'in_progress' && (
                      <CompleteTopic batchId={batch.id} topicId={t.id} topicName={t.name} students={students.length}
                        today={today} alreadySent={sentFor.get(t.id) ?? null} />
                    )}
                    {t.status !== 'not_started' && (
                      <form action={setTopicStatus}>
                        <input type="hidden" name="batch_id" value={batch.id} />
                        <input type="hidden" name="topic_id" value={t.id} />
                        <button name="status" value={t.status === 'complete' ? 'in_progress' : 'not_started'} className={ui.button}
                          title={t.status === 'complete' ? 'Back to In progress. Homework already sent stays.' : 'Back to Not started'}>
                          Undo
                        </button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>}
      </div>

      {usesLibrary && (
        <LessonPlanner batch={batch} students={students.length} today={today} term={term} moduleName={moduleName} />
      )}

      <HomeworkSection batchId={batch.id} members={students} />
    </>
  );
}
