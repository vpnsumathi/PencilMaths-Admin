'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function updatePassword(form: FormData) {
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  if (password.length < 8) redirect('/reset-password?error=Use at least 8 characters.');
  if (password !== confirm) redirect('/reset-password?error=The passwords do not match.');

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error('updatePassword failed:', error.message);
    redirect('/reset-password?error=Could not save the password. Request a new link.');
  }
  redirect('/');
}