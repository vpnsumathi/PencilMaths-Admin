import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { formatDate } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Batches' };

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

export default async function BatchesPage({ searchParams }: Props) {
  const { ok, error: problem } = await searchParams;
  const supabase = await createClient();

  // batch_list is a database view: each batch with its teacher, members, schedule and progress.
  const { data: batches, error } = await supabase
    .from('batch_list')
    .select('id, code, subject, year_group, teacher, capacity, member_count, schedule, topics_done, topics_total, last_class_on, closed_on')
    .order('closed_on', { ascending: false, nullsFirst: true })
    .order('code');
  if (error) throw error;

  return (
    <>
      <div className={ui.header}>
        <h1 className={ui.title}>Batches</h1>
        <Link href="/batches/new" className={ui.primaryButton}>New batch</Link>
      </div>
      <Alerts ok={ok} problem={problem} />

      {batches.length === 0 ? <p className={ui.empty}>No batches yet.</p> : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr><th>Batch</th><th>Subject</th><th>Year</th><th>Teacher</th><th>Times</th><th>Places</th><th>Lesson plan</th><th>Last class</th><th>Status</th></tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td><Link href={`/batches/${b.id}`} className={ui.link}>{b.code}</Link></td>
                  <td>{b.subject}</td>
                  <td>{b.year_group}</td>
                  <td>{b.teacher}</td>
                  <td>{b.schedule ?? '—'}</td>
                  <td>{b.member_count} / {b.capacity}</td>
                  <td>{b.topics_done} of {b.topics_total} done</td>
                  <td>{formatDate(b.last_class_on)}</td>
                  <td>{b.closed_on ? <StatusBadge status="closed" label="Closed" /> : <StatusBadge status="open" label="Open" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
