'use server';
import { redirect } from 'next/navigation';
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

  // ask Supabase to email a reset link. 
const supabase = await createClient();
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
});
    if (error) console.error('sendReset failed:', error.message);
    return { ok: 'If that email belongs to a staff account, a reset link is on its way.' };
}