import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { updatePassword } from './actions';

// Reached from the reset email (via /auth/callback), so the user is already signed in here.
export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await searchParams;

  return (
    <main style={{ padding: 24, maxWidth: 360 }}>
      <h1>Choose a new password</h1>
      {error && <p role="alert">{error}</p>}
      <form action={updatePassword}>
        <p><label>New password<br /><input name="password" type="password" autoComplete="new-password" required /></label></p>
        <p><label>Confirm password<br /><input name="confirm" type="password" autoComplete="new-password" required /></label></p>
        <button>Save password</button>
      </form>
    </main>
  );
}