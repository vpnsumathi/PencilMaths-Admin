import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import { CreatedModified } from '@/components/CreatedModified';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { isTeacher } from '@/lib/auth';
import { formatPercent } from '@/lib/format';
import { STUDENT_STATUSES, yearShort } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { MissingFolders } from './MissingFolders';

export const metadata = { title: 'Students' };

type Props = { searchParams: Promise<{ ok?: string; error?: string; q?: string; status?: string }> };

export default async function StudentsPage({ searchParams }: Props) {
  const { ok, error: problem, q = '', status = '' } = await searchParams;
  const supabase = await createClient();
  // student_list is a database view: each student with subjects, teachers, batches and their 28-day stats.
  let query = supabase
    .from('student_list')
    .select('id, code, first_name, last_name, year_group, status, subjects, teachers, batches, missing_teacher, missing_batch, attendance_pct, homework_pct, created_at, updated_at')
    .order('last_name')
    .order('first_name');
  // Default view hides students who have left.
  query = status in STUDENT_STATUSES ? query.eq('status', status) : query.neq('status', 'left');
  // Keep only letters, numbers, spaces, hyphens and apostrophes, so the search can't break the filter.
  const search = q.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
  if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,code.ilike.%${search}%`);

  // Teachers only get the students in their own batches back (database rules), and can't add students.
  // Who is looking is worked out at the same time as the list loads, not before it.
  // Current students with no Google Drive folder (they can't hand in homework): students with no matching
  // file_links row. Teachers can't read student folders, so this is only used for staff.
  const missingQuery = supabase
    .from('students')
    .select('id, first_name, last_name, file_links!left(id)')
    .neq('status', 'left')
    .eq('file_links.owner_type', 'student_folder')
    .eq('file_links.provider', 'google_drive')
    .is('file_links', null)
    .order('last_name')
    .order('first_name');
  const [teacher, { data: students, error }, { data: missingRows, error: missingError }] = await Promise.all([isTeacher(), query, missingQuery]);
  if (error) throw error;
  if (missingError) console.error('Students without a Drive folder could not be listed:', missingError.message);
  const missing = teacher ? [] : (missingRows ?? []).map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name ?? ''}`.trim() }));
  const noFolder = new Set(missing.map((s) => s.id));

  return (
    <>
      <div className={ui.header}>
        <h1 className={ui.title}>{teacher ? 'My students' : 'Students'}</h1>
        {!teacher && <Link href="/students/new" className={ui.primaryButton}>Add student</Link>}
      </div>
      <Alerts ok={ok} problem={problem} />
      {missing.length > 0 && <MissingFolders students={missing} />}

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
                <th>Code</th><th>Name</th><th>Year</th><th>Subjects</th>{!teacher && <th>Teachers</th>}<th>Batches</th>
                <th>Attendance</th><th>Homework</th><th>Status</th><th></th><th>Created / modified</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td className={ui.muted}>{s.code}</td>
                  <td><Link href={`/students/${s.id}`} className={ui.link}>{s.first_name} {s.last_name}</Link></td>
                  <td>{yearShort(s.year_group)}</td>
                  <td>{s.subjects || '—'}</td>
                  {!teacher && <td>{s.teachers || '—'}</td>}
                  <td>{s.batches || '—'}</td>
                  <td>{formatPercent(s.attendance_pct)}</td>
                  <td>{formatPercent(s.homework_pct)}</td>
                  <td><StatusBadge status={s.status} label={STUDENT_STATUSES[s.status] ?? s.status} /></td>
                  <td>
                    {s.missing_batch && <StatusBadge status="left" label="Needs batch" />}{' '}
                    {s.missing_teacher && <StatusBadge status="left" label="Needs teacher" />}{' '}
                    {noFolder.has(s.id) && <StatusBadge status="left" label="No Drive folder" />}
                  </td>
                  <td><CreatedModified created={s.created_at} updated={s.updated_at} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
