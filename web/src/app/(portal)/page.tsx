import { createClient } from '@/lib/supabase/server';
import styles from './dashboard.module.css';

export const metadata = { title: 'Dashboard' };

export default async function Dashboard() {
  const supabase = await createClient();
  // head: true returns only the count, not the rows. All four run at the same time.
  const [students, teachers, batches, enquiries] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).neq('status', 'left'),
    supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('batches').select('id', { count: 'exact', head: true }).is('closed_on', null),
    supabase.from('enquiries').select('id', { count: 'exact', head: true }).not('stage', 'in', '(enrolled,not_proceeding)'),
  ]);

  const cards = [
    { label: 'Active students', value: students.count },
    { label: 'Active teachers', value: teachers.count },
    { label: 'Open batches', value: batches.count },
    { label: 'Open enquiries', value: enquiries.count },
  ];

  return (
    <>
      <h1 className={styles.title}>Dashboard</h1>
      <div className={styles.grid}>
        {cards.map((c) => (
          <div key={c.label} className={styles.card}>
            <span>{c.label}</span>
            <strong>{c.value ?? '–'}</strong>
          </div>
        ))}
      </div>
    </>
  );
}