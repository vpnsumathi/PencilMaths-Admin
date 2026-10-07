import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { yearRange } from '@/lib/format';
import { TEACHER_STATUSES } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Teachers' };

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

export default async function TeachersPage({ searchParams }: Props) {
  const { ok, error: problem } = await searchParams;
  const supabase = await createClient();

  // teacher_list is a database view: each teacher plus their open batch and student counts.
  const { data: teachers, error } = await supabase
    .from('teacher_list')
    .select('id, code, first_name, last_name, subject, year_min, year_max, status, phone, batch_count, student_count')
    .order('last_name')
    .order('first_name');
  if (error) throw error;

  return (
    <>
      <div className={ui.header}>
        <h1 className={ui.title}>Teachers</h1>
        <Link href="/teachers/new" className={ui.primaryButton}>Add teacher</Link>
      </div>
      <Alerts ok={ok} problem={problem} />

      {teachers.length === 0 ? <p className={ui.empty}>No teachers yet.</p> : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr><th>Code</th><th>Name</th><th>Subject</th><th>Years</th><th>Status</th><th>Batches</th><th>Students</th><th>Phone</th></tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td className={ui.muted}>{t.code}</td>
                  <td><Link href={`/teachers/${t.id}`} className={ui.link}>{t.first_name} {t.last_name}</Link></td>
                  <td>{t.subject ?? '—'}</td>
                  <td>{yearRange(t.year_min, t.year_max)}</td>
                  <td><StatusBadge status={t.status} label={TEACHER_STATUSES[t.status] ?? t.status} /></td>
                  <td>{t.batch_count}</td>
                  <td>{t.student_count}</td>
                  <td>{t.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
