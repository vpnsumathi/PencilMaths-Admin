import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { setActive, updateRole } from './actions';
import styles from './staff.module.css';

export const metadata = { title: 'Staff' };

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  operations: 'Operations',
  head_teacher: 'Head teacher',
};

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

export default async function StaffPage({ searchParams }: Props) {
  const { ok, error: problem } = await searchParams;
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

      {ok && <p className={`${styles.alert} ${styles.alertOk}`} role="status">{ok}</p>}
      {problem && <p className={`${styles.alert} ${styles.alertError}`} role="alert">{problem}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Added</th><th></th></tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const isMe = s.id === user!.id;
              return (
                <tr key={s.id}>
                  <td>{s.full_name}{isMe && <span className={styles.you}>You</span>}</td>
                  <td>{s.email}</td>
                  <td>
                    {isMe ? ROLE_LABELS[s.role] : (
                      <form action={updateRole} className={styles.inline}>
                        <input type="hidden" name="id" value={s.id} />
                        <select name="role" defaultValue={s.role} className={styles.select} aria-label={`Role for ${s.full_name}`}>
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <button className={styles.button}>Save</button>
                      </form>
                    )}
                  </td>
                  <td><span className={s.active ? styles.active : styles.inactive}>{s.active ? 'Active' : 'Inactive'}</span></td>
                  <td>{new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>
                    {!isMe && (
                      <form action={setActive}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="active" value={String(!s.active)} />
                        <button className={s.active ? styles.dangerButton : styles.button}>
                          {s.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
