import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alerts } from '@/components/Alerts';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { requireStaff } from '@/lib/auth';
import { ENQUIRY_STAGES, OPEN_STAGES, stageTone, UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { convertToStudent, setStage } from '../actions';
import { EnquiryForm, type Enquiry } from '../EnquiryForm';

export const metadata = { title: 'Enquiry' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

export default async function EnquiryPage({ params, searchParams }: Props) {
  await requireStaff();
  const { id } = await params;
  const { ok, error: problem } = await searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: e }, { data: events }, { data: subjects }] = await Promise.all([
    supabase.from('enquiries').select('*, enquiry_subjects(subject_id)').eq('id', id).maybeSingle(),
    supabase.from('enquiry_events').select('id, stage, at, staff(full_name)').eq('enquiry_id', id).order('at', { ascending: false }),
    supabase.from('subjects').select('id, name').order('sort'),
  ]);
  if (!e) notFound();

  const enquiry: Enquiry = { ...e, subject_ids: (e.enquiry_subjects as { subject_id: string }[]).map((s) => s.subject_id) };
  const isOpen = OPEN_STAGES.includes(e.stage);
  const next = OPEN_STAGES[OPEN_STAGES.indexOf(e.stage) + 1]; // undefined after "confirmed"

  return (
    <>
      <Link href="/enquiries" className={ui.back}>← All enquiries</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>{e.child_first_name} {e.child_last_name}</h1>
          <p className={ui.subtitle}>{e.code} · Year {e.year_group} · enquired {new Date(e.created_at).toLocaleDateString('en-GB')}</p>
        </div>
        <StatusBadge status={stageTone(e.stage)} label={ENQUIRY_STAGES[e.stage]} />
      </div>
      <Alerts ok={ok} problem={problem} />

      <section className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
        <h2>Stage</h2>
        {e.student_id ? (
          <p>Converted to a student. <Link href={`/students/${e.student_id}`} className={ui.link}>Open student →</Link></p>
        ) : (
          <div className={ui.formActions}>
            {next && (
              <form action={setStage}>
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="stage" value={next} />
                <button className={ui.button}>Move to {ENQUIRY_STAGES[next]} →</button>
              </form>
            )}
            {isOpen && (
              <form action={convertToStudent}>
                <input type="hidden" name="id" value={e.id} />
                <button className={ui.primaryButton}>Convert to student</button>
              </form>
            )}
            <form action={setStage} className={ui.formActions}>
              <input type="hidden" name="id" value={e.id} />
              <select name="stage" defaultValue={e.stage} className={ui.select} aria-label="Stage">
                {Object.entries(ENQUIRY_STAGES).filter(([key]) => key !== 'enrolled').map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <button className={ui.button}>Set stage</button>
            </form>
          </div>
        )}
      </section>

      <EnquiryForm enquiry={enquiry} subjects={subjects ?? []} />

      <section className={ui.card} style={{ marginTop: 16, maxWidth: 900 }}>
        <h2>History</h2>
        <ul className={ui.list}>
          {(events ?? []).map((ev) => (
            <li key={ev.id}>
              <span>{ENQUIRY_STAGES[ev.stage] ?? ev.stage}</span>
              <span className={ui.muted}>
                {new Date(ev.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })}
                {(ev.staff as unknown as { full_name: string } | null)?.full_name && ` · ${(ev.staff as unknown as { full_name: string }).full_name}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}