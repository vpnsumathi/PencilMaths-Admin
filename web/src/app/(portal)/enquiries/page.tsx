import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { requireStaff } from '@/lib/auth';
import { ENQUIRY_STAGES, stageTone } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Enquiries' };

type Props = { searchParams: Promise<{ ok?: string; error?: string; stage?: string }> };

export default async function EnquiriesPage({ searchParams }: Props) {
  await requireStaff();
  const { ok, error: problem, stage = 'open' } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('enquiries')
    .select('id, code, child_first_name, child_last_name, year_group, parent_name, parent_phone, stage, stage_changed_at, enquiry_subjects(subjects(name))')
    .order('stage_changed_at', { ascending: false });
  // "Open" = every stage except enrolled and not proceeding.
  query = stage in ENQUIRY_STAGES ? query.eq('stage', stage) : query.not('stage', 'in', '(enrolled,not_proceeding)');
  const { data: enquiries, error } = await query;
  if (error) throw error;

  const tabs = [['open', 'Open'], ...Object.entries(ENQUIRY_STAGES)];

  return (
    <>
      <div className={ui.header}>
        <h1 className={ui.title}>Enquiries</h1>
        <Link href="/enquiries/new" className={ui.primaryButton}>Add enquiry</Link>
      </div>
      <Alerts ok={ok} problem={problem} />

      <nav className={ui.filters} aria-label="Stage">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/enquiries?stage=${key}`} className={key === stage ? ui.primaryButton : ui.button}>{label}</Link>
        ))}
      </nav>

      {enquiries.length === 0 ? <p className={ui.empty}>No enquiries here.</p> : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr><th>Code</th><th>Child</th><th>Year</th><th>Subjects</th><th>Parent</th><th>Phone</th><th>Stage</th><th>In stage</th></tr>
            </thead>
            <tbody>
              {enquiries.map((e) => {
                const subjects = (e.enquiry_subjects as unknown as { subjects: { name: string } }[]).map((s) => s.subjects.name);
                const days = Math.floor((Date.now() - Date.parse(e.stage_changed_at)) / 86_400_000);
                return (
                  <tr key={e.id}>
                    <td className={ui.muted}>{e.code}</td>
                    <td><Link href={`/enquiries/${e.id}`} className={ui.link}>{e.child_first_name} {e.child_last_name}</Link></td>
                    <td>{e.year_group}</td>
                    <td>{subjects.join(', ') || '—'}</td>
                    <td>{e.parent_name}</td>
                    <td>{e.parent_phone ?? '—'}</td>
                    <td><StatusBadge status={stageTone(e.stage)} label={ENQUIRY_STAGES[e.stage] ?? e.stage} /></td>
                    <td className={days >= 7 ? ui.muted : undefined}>{days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}