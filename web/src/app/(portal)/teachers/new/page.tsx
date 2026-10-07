import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { createClient } from '@/lib/supabase/server';
import { TeacherForm } from '../TeacherForm';

export const metadata = { title: 'Add teacher' };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function NewTeacherPage({ searchParams }: Props) {
  const { error: problem } = await searchParams;
  const supabase = await createClient();
  const { data: subjects } = await supabase.from('subjects').select('id, name').eq('active', true).order('sort');

  return (
    <>
      <Link href="/teachers" className={ui.back}>← All teachers</Link>
      <div className={ui.header}><h1 className={ui.title}>Add teacher</h1></div>
      <Alerts problem={problem} />
      <TeacherForm subjects={subjects ?? []} />
    </>
  );
}
