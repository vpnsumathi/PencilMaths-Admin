'use server';
import { redirect } from 'next/navigation';
import { createClient as createPlainClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// These run on the server when the login form is submitted.

export type AuthState = { error?: string; ok?: string } | undefined;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');

  if (!email || !password) return { error: 'Enter your email address and password.' };
  if (!EMAIL.test(email)) return { error: 'Enter an email address like name@pencilmaths.com.' };

  // Piece 5: check the email and password with Supabase, then redirect('/').
const supabase = await createClient();
const { error } = await supabase.auth.signInWithPassword({ email, password });
if (error) return { error: 'Email or password is incorrect.' };
redirect('/');
}

export async function sendReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim();

  if (!email) return { error: 'Enter your email address first.' };
  if (!EMAIL.test(email)) return { error: 'Enter an email address like name@pencilmaths.com.' };

  // Ask Supabase to email a reset link (staff and students alike).
  // The "implicit" kind of link carries the sign-in itself, so it works even when opened on another
  // device (e.g. requested on a laptop, opened on a phone). It lands on /auth/accept, which goes on
  // to /reset-password, the same as an invite.
  const supabase = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/accept`,
  });
  if (error) console.error('sendReset failed:', error.message);
  return { ok: 'If that email has a Pencil Maths account, a reset link is on its way. Check your spam folder too.' };
}
