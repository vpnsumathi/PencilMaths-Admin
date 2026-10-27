import Image from 'next/image';
import { redirect } from 'next/navigation';
import styles from '@/components/AuthCard.module.css';
import { FocusMessage } from '@/components/FocusMessage';
import { createClient } from '@/lib/supabase/server';
import { updatePassword } from './actions';

export const metadata = { title: 'Choose your password' };

// Reached from an invite or reset email (via /auth/accept or /auth/callback), so the user is already signed in here.
export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await searchParams;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        {/* Logo file: web/public/logo.png (a copy is kept in the Logo folder at the top of the project). */}
        <Image src="/logo.png" alt="Pencil Maths" width={181} height={60} priority className={styles.logo} />
        <h1 className={styles.title}>Choose your password</h1>
        <p className={styles.subtitle}>
          For {user.email}. Use at least 8 characters. You&apos;ll sign in with your email and this password.
        </p>
        {error && <FocusMessage key={Date.now()} className={styles.error} role="alert">{error}</FocusMessage>}
        <form action={updatePassword} className={styles.form}>
          <label className={styles.field}>
            New password
            <input name="password" type="password" autoComplete="new-password" minLength={8} required className={styles.input} />
          </label>
          <label className={styles.field}>
            Confirm password
            <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className={styles.input} />
          </label>
          <button className={styles.submit}>Save password</button>
        </form>
      </section>
    </main>
  );
}
