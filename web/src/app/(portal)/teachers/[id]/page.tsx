import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { TeacherForm, type Teacher } from '../TeacherForm';

export const metadata = { title: 'Edit teacher' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function EditTeacherPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error: problem } = await searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: teacher }, { data: subjects }] = await Promise.all([
    supabase
      .from('teachers')
      .select('id, code, first_name, last_name, personal_email, phone, subject_id, year_min, year_max, status, joined_on, notes')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('subjects').select('id, name').order('sort'),
  ]);
  if (!teacher) notFound();

  return (
    <>
      <Link href="/teachers" className={ui.back}>← All teachers</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>{teacher.first_name} {teacher.last_name}</h1>
          <p className={ui.subtitle}>{teacher.code}</p>
        </div>
      </div>
      <Alerts problem={problem} />
      <TeacherForm teacher={teacher as Teacher} subjects={subjects ?? []} />
    </>
  );
}
