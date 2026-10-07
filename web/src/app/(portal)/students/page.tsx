import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { formatPercent } from '@/lib/format';
import { STUDENT_STATUSES } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Students' };

type Props = { searchParams: Promise<{ ok?: string; error?: string; q?: string; status?: string }> };

export default async function StudentsPage({ searchParams }: Props) {
  const { ok, error: problem, q = '', status = '' } = await searchParams;
  const supabase = await createClient();

  // student_list is a database view: each student with subjects, teachers, batches and their 28-day stats.
  let query = supabase
    .from('student_list')
    .select('id, code, first_name, last_name, year_group, status, subjects, teachers, batches, missing_teacher, missing_batch, attendance_pct, homework_pct')
    .order('last_name')
    .order('first_name');
  // Default view hides students who have left.
  query = status in STUDENT_STATUSES ? query.eq('status', status) : query.neq('status', 'left');
  // Keep only letters, numbers, spaces, hyphens and apostrophes, so the search can't break the filter.
  const search = q.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
  if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,code.ilike.%${search}%`);

  const { data: students, error } = await query;
  if (error) throw error;

  return (
    <>
      <div className={ui.header}>
        <h1 className={ui.title}>Students</h1>
        <Link href="/students/new" className={ui.primaryButton}>Add student</Link>
      </div>
      <Alerts ok={ok} problem={problem} />

      {/* A GET form: submitting it puts ?q=…&status=… in the address, which this page reads. */}
      <form className={ui.filters}>
        <input name="q" defaultValue={q} placeholder="Search name or code" className={ui.input} aria-label="Search" />
        <select name="status" defaultValue={status} className={ui.select} aria-label="Status">
          <option value="">All current</option>
          {Object.entries(STUDENT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className={ui.button}>Filter</button>
      </form>

      {students.length === 0 ? <p className={ui.empty}>No students found.</p> : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Code</th><th>Name</th><th>Year</th><th>Subjects</th><th>Teachers</th><th>Batches</th>
                <th>Attendance</th><th>Homework</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td className={ui.muted}>{s.code}</td>
                  <td><Link href={`/students/${s.id}`} className={ui.link}>{s.first_name} {s.last_name}</Link></td>
                  <td>{s.year_group}</td>
                  <td>{s.subjects || '—'}</td>
                  <td>{s.teachers || '—'}</td>
                  <td>{s.batches || '—'}</td>
                  <td>{formatPercent(s.attendance_pct)}</td>
                  <td>{formatPercent(s.homework_pct)}</td>
                  <td><StatusBadge status={s.status} label={STUDENT_STATUSES[s.status] ?? s.status} /></td>
                  <td>
                    {s.missing_batch && <StatusBadge status="left" label="Needs batch" />}{' '}
                    {s.missing_teacher && <StatusBadge status="left" label="Needs teacher" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
