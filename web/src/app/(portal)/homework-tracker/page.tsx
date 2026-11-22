import Link from 'next/link';
import ui from '@/components/ui.module.css';
import { requireStaffOrTeacher } from '@/lib/auth';
import { type BatchData, type StudentData } from '@/lib/homework/tracker';
import { YEARS, yearLabel } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import att from '../attendance/attendance.module.css';
import { AutoSubmit } from './AutoSubmit';
import { readQuery } from './query';
import { BatchView } from './BatchView';
import { StudentView } from './StudentView';
import styles from './tracker.module.css';

export const metadata = { title: 'Homework Tracker' };

const NOT_READY = 'The database is not ready for the Homework Tracker yet: run 20261120000001_homework_tracker.sql in Supabase first.';
const NOT_READY_TEACHER = 'The Homework Tracker is not ready yet. Please ask the office.';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type BatchOption = {
  id: string; code: string; name: string | null; year_group: number; closed_on: string | null;
  subjects: { name: string } | null; teachers?: { first_name: string; last_name: string } | null;
};
type MemberRow = {
  student_id: string; started_on: string; ended_on: string | null;
  students: { code: string; first_name: string; last_name: string } | null;
};

// Homework Tracker (guide 26): pick Year, Batch and Student to review and check every homework. Batch only:
// students x homework (Batch view). With a student: their homework history (Student view). One school year at a
// time (?sy=, default this one), so the page stays the same size however many years there are (guide 27).
// Read only: marking and giving homework stay on the batch page.
// Staff see every batch. A teacher sees only their own open batches, the students in them now, and those students'
// homework in those batches: the database rules decide (the tracker functions run as the signed-in person, guide 26
// section 9), so changing the address can't show anything else. Teachers pick from their batches (no Year list).
export default async function HomeworkTrackerPage({ searchParams }: Props) {
  const viewer = await requireStaffOrTeacher('/');
  const teacher = viewer.kind === 'teacher';
  const q = readQuery(await searchParams);
  const supabase = await createClient();

  // The chosen student's name. Staff opening it from a student's page (?student=… only) need the student's year
  // first for the Batch list, so that one call waits; otherwise it runs with the others.
  const studentCall = q.student
    ? supabase.from('students').select('code, first_name, last_name, year_group, status').eq('id', q.student).maybeSingle()
    : null;
  let student = null;
  let studentRead = false;
  if (q.student && !q.year && !teacher) {
    student = (await studentCall)?.data ?? null;
    studentRead = true;
    q.year = student?.year_group ?? null;
  }
  if (q.student && !q.batch) q.scope = 'all';

  // The batch list. Staff: the chosen year's batches, with their teacher. A teacher: all of their own batches (the
  // database only returns those), without the teachers list, which teachers can't read. Started now, read below.
  const batchesCall = (async () => {
    if (teacher) return supabase.from('batches').select('id, code, name, year_group, closed_on, subjects(name)').order('year_group').order('code');
    if (q.year) {
      return supabase.from('batches').select('id, code, name, year_group, closed_on, subjects(name), teachers(first_name, last_name)')
        .eq('year_group', q.year).order('closed_on', { ascending: false, nullsFirst: true }).order('code');
    }
    return { data: [] as unknown[], error: null };
  })();
  // A teacher with one batch, opening the page with nothing chosen: open that batch straight away.
  if (teacher && !q.batch && !q.student) {
    const only = ((await batchesCall).data ?? []) as unknown as BatchOption[];
    if (only.length === 1) { q.batch = only[0].id; q.year = only[0].year_group; }
  }

  // Side by side: the batch list, the batch's students (past ones too; a teacher gets only the students in it now),
  // the view itself, and the student's name.
  const [batchesRes, membersRes, viewRes, studentRes] = await Promise.all([
    batchesCall,
    q.batch
      ? supabase.from('enrolments').select('student_id, started_on, ended_on, students(code, first_name, last_name)').eq('batch_id', q.batch)
      : Promise.resolve({ data: [], error: null }),
    q.student
      ? supabase.rpc('homework_tracker_student', { p_student: q.student, p_batch: q.scope === 'all' ? null : q.batch, p_year: q.sy })
      : q.batch
        ? supabase.rpc('homework_tracker_batch', { p_batch: q.batch, p_term: q.term, p_year: q.sy })
        : Promise.resolve({ data: null, error: null }),
    !studentRead && studentCall ? studentCall : Promise.resolve({ data: student, error: null }),
  ]);
  student = studentRes.data;
  const failed = viewRes.error ?? batchesRes.error ?? membersRes.error;
  if (failed) console.error('Homework Tracker:', failed.message);
  const notReady = viewRes.error?.code === 'PGRST202';
  // A student id in the address that this person can't see (a teacher: not in their batches now).
  const noStudent = Boolean(q.student && !student && !failed);

  const batches = (batchesRes.data ?? []) as unknown as BatchOption[];
  // One entry per student (someone who left and came back has two enrolments): current members first.
  const members = new Map<string, { id: string; name: string; code: string; current: boolean }>();
  for (const m of (membersRes.data ?? []) as unknown as MemberRow[]) {
    if (!m.students) continue;
    const prev = members.get(m.student_id);
    members.set(m.student_id, {
      id: m.student_id, code: m.students.code, name: `${m.students.first_name} ${m.students.last_name}`,
      current: (prev?.current ?? false) || m.ended_on == null,
    });
  }
  const memberList = [...members.values()].sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));
  const openBatches = batches.filter((b) => !b.closed_on);
  const closedBatches = batches.filter((b) => b.closed_on);
  const batchLabel = (b: BatchOption) =>
    `${b.code}${b.name ? ` · ${b.name}` : ''} · ${b.subjects?.name ?? ''}${teacher ? ` · ${yearLabel(b.year_group)}` : ''}` +
    `${b.teachers ? ` · ${b.teachers.first_name} ${b.teachers.last_name}` : ''}`;

  return (
    <div className={`${att.page} ${styles.page}`}>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Homework Tracker</h1>
          <p className={ui.subtitle}>
            {teacher ? 'Every homework of your batches and their students' : 'Every homework of a batch or a student'}: Assigned,
            Submitted, Corrected and what is coming next from the Lesson Tracker. To mark or give homework, open the batch page from any row.
          </p>
        </div>
      </div>

      {/* Filters: a plain form, so the view is in the address (bookmark it or send it) and Back works. */}
      <form method="get" action="/homework-tracker" className={att.filters}>
        <AutoSubmit />
        {!teacher && (
          <label className={att.field}>
            <span className={ui.label}>Year</span>
            <select name="year" defaultValue={q.year ?? ''} className={ui.select}>
              <option value="">Choose a year</option>
              {YEARS.map((y) => <option key={y} value={y}>{yearLabel(y)}</option>)}
            </select>
          </label>
        )}
        <label className={att.field}>
          <span className={ui.label}>{teacher ? 'Your batch' : 'Batch'}</span>
          <select name="batch" defaultValue={q.batch ?? ''} className={ui.select} disabled={!teacher && !q.year}>
            <option value="">{teacher ? (batches.length ? 'Choose a batch' : 'You have no open batches')
              : q.year ? (batches.length ? 'Choose a batch' : 'No batches in this year') : 'Choose a year first'}</option>
            {openBatches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
            {closedBatches.length > 0 && (
              <optgroup label="Closed">
                {closedBatches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <label className={att.field}>
          <span className={ui.label}>Student</span>
          <select name="student" defaultValue={q.student ?? ''} className={ui.select} disabled={!q.batch && !q.student}>
            <option value="">{q.batch ? 'All students (Batch view)' : 'Choose a batch first'}</option>
            {memberList.filter((m) => m.current).map((m) => <option key={m.id} value={m.id}>{m.name} · {m.code}</option>)}
            {memberList.some((m) => !m.current) && (
              <optgroup label="Left this batch">
                {memberList.filter((m) => !m.current).map((m) => <option key={m.id} value={m.id}>{m.name} · {m.code}</option>)}
              </optgroup>
            )}
            {/* Opened from a student's page with no batch chosen: keep the student in the list. */}
            {q.student && !members.has(q.student) && student && (
              <option value={q.student}>{student.first_name} {student.last_name} · {student.code}</option>
            )}
          </select>
        </label>
        <div className={att.actions}>
          <button className={ui.primaryButton}>Show</button>
          {(q.year || q.batch || q.student) && <Link href="/homework-tracker" className={ui.button}>Clear</Link>}
        </div>
      </form>

      {notReady ? <p className={ui.empty}>{teacher ? NOT_READY_TEACHER : NOT_READY}</p>
        : failed ? <p className={ui.empty}>The homework could not be loaded. Please try again.</p>
          : noStudent ? <p className={ui.empty}>{teacher ? 'This student is not in any of your batches.' : 'Student not found.'}</p>
            : q.student && viewRes.data && student ? <StudentView q={q} data={viewRes.data as StudentData} student={student} teacher={teacher} />
              : q.batch && viewRes.data ? <BatchView q={q} data={viewRes.data as BatchData} teacher={teacher} />
                : (
                  <div className={`${ui.card} ${styles.hint}`}>
                    <p style={{ margin: 0 }}>
                      {teacher ? <>Choose one of <b>your batches</b></> : <>Choose a <b>Year</b> and a <b>Batch</b></>} to see every
                      student&apos;s homework side by side, then a <b>Student</b> for their full homework history.
                    </p>
                  </div>
                )}
    </div>
  );
}
