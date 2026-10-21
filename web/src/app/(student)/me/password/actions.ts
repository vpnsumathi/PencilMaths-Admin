'use server';

import { createClient } from '@/lib/supabase/server';
import { redirectWith } from '@/lib/form';

const PATH = '/me/password';

// The signed-in student changes their password. The current password is checked first,
// so someone using a phone left signed in can't change it.
export async function changeMyPassword(form: FormData) {
  const current = String(form.get('current') ?? '');
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  if (password.length < 8) redirectWith(PATH, 'error', 'Use at least 8 characters for the new password.');
  if (password !== confirm) redirectWith(PATH, 'error', 'The new passwords do not match.');
  if (password === current) redirectWith(PATH, 'error', 'The new password must be different from the current one.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirectWith('/login', 'error', 'Please sign in again.');

  const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) redirectWith(PATH, 'error', 'Your current password is not right.');

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error('changeMyPassword failed:', error.message);
    redirectWith(PATH, 'error', 'Could not change the password. Please try again.');
  }
  redirectWith(PATH, 'ok', 'Password changed. Use the new one next time you sign in.');
}
