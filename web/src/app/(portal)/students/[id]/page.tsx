import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alerts } from '@/components/Alerts';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { isTeacher } from '@/lib/auth';
import { formatPercent } from '@/lib/format';
import { STUDENT_STATUSES, UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { createDriveFolder } from '../actions';
import { HandInLink } from '../HandInLink';
import { PortalAccess } from '../PortalAccess';
import { loadStudentFormOptions, StudentForm, type Enrolment, type Guardian, type Student } from '../StudentForm';

export const metadata = { title: 'Student' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function StudentPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { ok, error: problem } = await searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  // Teachers only get students in their own batches back (database rules), so anyone else is "not found".
  const { data: found } = await supabase
    .from('students')
    .select('id, code, family_id, first_name, last_name, year_group, school, status, start_date, auth_user_id')
    .eq('id', id)
    .maybeSingle();
  if (!found) notFound();
  if (await isTeacher()) return <TeacherView student={found} />;

  // Date of birth and the secret hand-in code are only readable by staff, through student_private.
  const { data: extra } = await supabase.rpc('student_private', { p_student: id });
  const student = { ...found, date_of_birth: extra?.date_of_birth ?? null, handin_code: extra?.handin_code ?? '' };

  const [{ data: guardian }, { data: enrolments }, { data: folder }, { data: stats }, options] = await Promise.all([
    student.family_id
      ? supabase
          .from('guardians')
          .select('full_name, relationship, phone, email')
          .eq('family_id', student.family_id)
          .eq('is_primary', true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('enrolments').select('id, subject_id, teacher_id, batch_id').eq('student_id', id).is('ended_on', null),
    supabase.from('file_links').select('url, provider').eq('student_id', id).eq('owner_type', 'student_folder').maybeSingle(),
    supabase.from('student_stats').select('attendance_pct, homework_pct').eq('student_id', id).maybeSingle(),
    loadStudentFormOptions(),
  ]);

  return (
    <>
      <Link href="/students" className={ui.back}>← All students</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>{student.first_name} {student.last_name}</h1>
          <p className={ui.subtitle}>
            {student.code} · Year {student.year_group} · Attendance {formatPercent(stats?.attendance_pct)} · Homework{' '}
            {formatPercent(stats?.homework_pct)} (last 28 days)
          </p>
        </div>
        <StatusBadge status={student.status} label={STUDENT_STATUSES[student.status] ?? student.status} />
      </div>
      <Alerts ok={ok} problem={problem} />
      {folder?.provider !== 'google_drive' && (
        <form action={createDriveFolder} className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
          <input type="hidden" name="id" value={student.id} />
          <p style={{ margin: '0 0 12px' }}>This student has no Google Drive folder yet.</p>
          <button className={ui.primaryButton}>Create Drive folder</button>
        </form>
      )}
      {student.status !== 'left' && (
        <HandInLink
          studentId={student.id}
          firstName={student.first_name}
          url={`${process.env.NEXT_PUBLIC_SITE_URL}/h/${student.handin_code}`}
          hasFolder={folder?.provider === 'google_drive'}
        />
      )}
      {(student.status !== 'left' || student.auth_user_id) && (
        <PortalAccess studentId={student.id} authUserId={student.auth_user_id} suggestedEmail={guardian?.email ?? null} />
      )}
      <StudentForm
        student={student as Student}
        guardian={guardian as Guardian | null}
        enrolments={(enrolments ?? []) as Enrolment[]}
        folder={folder}
        options={options}
      />
    </>
  );
}

type Basic = { id: string; code: string; first_name: string; last_name: string; year_group: number; school: string | null; status: string };

// What a teacher sees: the student and their classes with this teacher. No parent details, logins,
// hand-in link or Drive folder, and nothing to edit.
async function TeacherView({ student }: { student: Basic }) {
  const supabase = await createClient();
  const [{ data: enrolments }, { data: stats }] = await Promise.all([
    // Only enrolments in the teacher's own batches come back.
    supabase.from('enrolments').select('id, batch_id, subjects(name), batches(code, year_group)').eq('student_id', student.id).is('ended_on', null),
    supabase.from('student_stats').select('attendance_pct, homework_pct').eq('student_id', student.id).maybeSingle(),
  ]);
  type Row = { id: string; batch_id: string; subjects: { name: string } | null; batches: { code: string; year_group: number } | null };

  return (
    <>
      <Link href="/students" className={ui.back}>← My students</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>{student.first_name} {student.last_name}</h1>
          <p className={ui.subtitle}>
            {student.code} · Year {student.year_group}{student.school ? ` · ${student.school}` : ''} · Attendance{' '}
            {formatPercent(stats?.attendance_pct)} · Homework {formatPercent(stats?.homework_pct)} (last 28 days, your classes)
          </p>
        </div>
        <StatusBadge status={student.status} label={STUDENT_STATUSES[student.status] ?? student.status} />
      </div>
      <section className={ui.card} style={{ maxWidth: 900 }}>
        <h2>Classes with you</h2>
        <ul className={ui.list}>
          {((enrolments ?? []) as unknown as Row[]).map((e) => (
            <li key={e.id}>
              <Link href={`/batches/${e.batch_id}`} className={ui.link}>{e.batches?.code ?? 'Batch'}</Link>
              <span className={ui.muted}>{e.subjects?.name} · Year {e.batches?.year_group}</span>
            </li>
          ))}
        </ul>
        <p className={ui.hint}>Homework, hand-ins and marking are on the batch page.</p>
      </section>
    </>
  );
}
