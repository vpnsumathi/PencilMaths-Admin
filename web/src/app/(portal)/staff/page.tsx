import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import styles from './staff.module.css';

export const metadata = { title: 'Staff' };

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  operations: 'Operations',
  head_teacher: 'Head teacher',
};

export default async function StaffPage() {
  const supabase = await createClient();

  // Admins only. The layout has already checked this person is active staff.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('staff').select('role').eq('id', user!.id).single();
  if (me?.role !== 'admin') redirect('/');

  const { data: staff, error } = await supabase
    .from('staff')
    .select('id, full_name, email, role, active, created_at')
    .order('full_name');
  if (error) throw error;

  return (
    <>
      <h1 className={styles.title}>Staff</h1>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Added</th></tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.full_name}{s.id === user!.id && <span className={styles.you}>You</span>}</td>
                <td>{s.email}</td>
                <td>{ROLE_LABELS[s.role] ?? s.role}</td>
                <td><span className={s.active ? styles.active : styles.inactive}>{s.active ? 'Active' : 'Inactive'}</span></td>
                <td>{new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}