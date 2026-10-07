import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// For admin-only pages and actions. Returns the Supabase connection and user,
// or sends anyone who is not an admin to `redirectTo`.
export async function requireAdmin(redirectTo = '/') {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('staff').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'admin') redirect(redirectTo);

  return { supabase, user };
}
