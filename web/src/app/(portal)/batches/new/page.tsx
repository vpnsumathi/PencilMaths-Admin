import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { createClient } from '@/lib/supabase/server';
import { BatchForm } from '../BatchForm';

export const metadata = { title: 'New batch' };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function NewBatchPage({ searchParams }: Props) {
  const { error: problem } = await searchParams;
  const supabase = await createClient();
  const [{ data: subjects }, { data: teachers }] = await Promise.all([
    supabase.from('subjects').select('id, name').eq('active', true).order('sort'),
    supabase.from('teachers').select('id, first_name, last_name, subject_id').eq('status', 'active').order('first_name'),
  ]);

  return (
    <>
      <Link href="/batches" className={ui.back}>← All batches</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>New batch</h1>
          <p className={ui.subtitle}>The subject&apos;s curriculum is copied in as this batch&apos;s lesson plan.</p>
        </div>
      </div>
      <Alerts problem={problem} />
      <BatchForm subjects={subjects ?? []} teachers={teachers ?? []} />
    </>
  );
}
