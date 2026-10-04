'use server';

// These run on the server when the login form is submitted.
// For now they only check the form. In Piece 5 we connect them to Supabase.

export type AuthState = { error?: string; ok?: string } | undefined;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');

  if (!email || !password) return { error: 'Enter your email address and password.' };
  if (!EMAIL.test(email)) return { error: 'Enter an email address like name@pencilmaths.com.' };

  // Piece 5: check the email and password with Supabase, then redirect('/').
  return { error: 'Sign-in is not connected yet. We connect it to Supabase in the next step.' };
}

export async function sendReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim();

  if (!email) return { error: 'Enter your email address first.' };
  if (!EMAIL.test(email)) return { error: 'Enter an email address like name@pencilmaths.com.' };

  // Piece 5: ask Supabase to email a reset link.
  return { ok: 'Password reset is not connected yet. We connect it to Supabase in the next step.' };
}
