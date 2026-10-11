import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { createClient } from '@/lib/supabase/server';
import { EnquiryForm } from '../EnquiryForm';

export const metadata = { title: 'Add enquiry' };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function NewEnquiryPage({ searchParams }: Props) {
  const { error: problem } = await searchParams;
  const supabase = await createClient();
  const { data: subjects } = await supabase.from('subjects').select('id, name').eq('active', true).order('sort');

  return (
    <>
      <Link href="/enquiries" className={ui.back}>← All enquiries</Link>
      <div className={ui.header}><h1 className={ui.title}>Add enquiry</h1></div>
      <Alerts problem={problem} />
      <EnquiryForm subjects={subjects ?? []} />
    </>
  );
}