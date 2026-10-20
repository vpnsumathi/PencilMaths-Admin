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
