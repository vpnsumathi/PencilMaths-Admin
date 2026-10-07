import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alerts } from '@/components/Alerts';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { formatDate } from '@/lib/format';
import { STUDENT_STATUSES, UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { setBatchClosed } from '../actions';
import { BatchForm } from '../BatchForm';

export const metadata = { title: 'Batch' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

const TOPIC_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', complete: 'Done' };

export default async function BatchPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { ok, error: problem } = await searchParams;
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
      supabase.from('batch_topics').select('id, position, name, status').eq('batch_id', id).order('position'),
      supabase.from('subjects').select('id, name').order('sort'),
      supabase.from('teachers').select('id, first_name, last_name, subject_id').neq('status', 'left').order('first_name'),
    ]);
  if (!batch) notFound();

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

      <div className={ui.columns}>
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

        <section className={ui.card}>
          <h2>Lesson plan</h2>
          {(topics ?? []).length === 0 ? (
            <p className={ui.empty}>No topics. Add some to the subject&apos;s curriculum first.</p>
          ) : (
            <ol className={ui.list}>
              {(topics ?? []).map((t) => (
                <li key={t.id}>
                  <span>{t.position}. {t.name}</span>
                  <StatusBadge
                    status={t.status === 'complete' ? 'active' : t.status === 'in_progress' ? 'trial' : 'closed'}
                    label={TOPIC_STATUS[t.status] ?? t.status}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
