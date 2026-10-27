import { FocusMessage } from '@/components/FocusMessage';
import styles from '../../student.module.css';
import { changeMyPassword } from './actions';

export const metadata = { title: 'Change password' };

// Change password for the signed-in student (link in the top bar).
export default async function ChangePassword({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  return (
    <>
      <h1>Change password</h1>
      <p className={styles.muted}>Use at least 8 characters. Forgotten your current one? Sign out and use “Forgot password”.</p>
      {ok && <FocusMessage key={`ok${Date.now()}`} className={styles.okMsg} role="status">✅ {ok}</FocusMessage>}
      {error && <FocusMessage key={`error${Date.now()}`} className={styles.errorMsg} role="alert">{error}</FocusMessage>}
      <form action={changeMyPassword} className={`${styles.card} ${styles.passwordForm}`}>
        <label>Current password<input name="current" type="password" autoComplete="current-password" required /></label>
        <label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
        <button className={styles.cta} style={{ marginTop: 8, border: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700 }}>
          Change password
        </button>
      </form>
    </>
  );
}
