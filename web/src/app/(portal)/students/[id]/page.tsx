import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alerts } from '@/components/Alerts';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { formatPercent } from '@/lib/format';
import { STUDENT_STATUSES, UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
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
  const { data: student } = await supabase
    .from('students')
    .select('id, code, family_id, first_name, last_name, year_group, school, date_of_birth, status, start_date')
    .eq('id', id)
    .maybeSingle();
  if (!student) notFound();

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
    supabase.from('file_links').select('url').eq('student_id', id).eq('owner_type', 'student_folder').maybeSingle(),
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
      <StudentForm
        student={student as Student}
        guardian={guardian as Guardian | null}
        enrolments={(enrolments ?? []) as Enrolment[]}
        folderUrl={folder?.url}
        options={options}
      />
    </>
  );
}
