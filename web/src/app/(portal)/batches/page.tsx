import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import { CreatedModified } from '@/components/CreatedModified';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { isTeacher } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { yearShort } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Batches' };

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

export default async function BatchesPage({ searchParams }: Props) {
  const { ok, error: problem } = await searchParams;
  const supabase = await createClient();
  // Teachers only get their own open batches back (database rules), and can't add batches.
  // batch_list is a database view: each batch with its teacher, members, schedule and progress.
  // Who is looking is worked out at the same time as the list loads, not before it.
  const [teacher, { data: batches, error }] = await Promise.all([
    isTeacher(),
    supabase
      .from('batch_list')
      .select('id, code, name, subject, year_group, teacher, capacity, member_count, schedule, topics_done, topics_total, last_class_on, closed_on, created_at, updated_at')
      .order('closed_on', { ascending: false, nullsFirst: true })
      .order('code'),
  ]);
  if (error) throw error;

  return (
    <>
      <div className={ui.header}>
        <h1 className={ui.title}>{teacher ? 'My batches' : 'Batches'}</h1>
        {!teacher && <Link href="/batches/new" className={ui.primaryButton}>New batch</Link>}
      </div>
      <Alerts ok={ok} problem={problem} />

      {batches.length === 0 ? <p className={ui.empty}>{teacher ? 'No batches are assigned to you yet.' : 'No batches yet.'}</p> : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr><th>Batch</th><th>Subject</th><th>Year</th>{!teacher && <th>Teacher</th>}<th>Times</th><th>Places</th><th>Lesson plan</th><th>Last class</th><th>Status</th><th>Created / modified</th></tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td><Link href={`/batches/${b.id}`} className={ui.link}>{b.code}</Link>{b.name && <span className={ui.muted}> · {b.name}</span>}</td>
                  <td>{b.subject}</td>
                  <td>{yearShort(b.year_group)}</td>
                  {!teacher && <td>{b.teacher}</td>}
                  <td>{b.schedule ?? '—'}</td>
                  <td>{b.member_count} / {b.capacity}</td>
                  <td>{b.topics_done} of {b.topics_total} done</td>
                  <td>{formatDate(b.last_class_on)}</td>
                  <td>{b.closed_on ? <StatusBadge status="closed" label="Closed" /> : <StatusBadge status="open" label="Open" />}</td>
                  <td><CreatedModified created={b.created_at} updated={b.updated_at} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
