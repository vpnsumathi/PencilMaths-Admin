import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Full-rights connection to Supabase, used to send invite emails and remove logins.
// Server only: the secret key must never reach the browser. Only call it after checking the user is staff.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY is missing from .env.local / Vercel.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// The login id for an email, or null. Supabase has no lookup by email, so page through the logins (fine at this size).
export async function findUserByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const wanted = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const user = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (user) return user.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
