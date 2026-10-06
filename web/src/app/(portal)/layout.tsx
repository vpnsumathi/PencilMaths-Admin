import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';

// Every page inside (portal) is for active staff only.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // The security rules only return this row if the user is active staff.
  const { data: staff } = await supabase.from('staff').select('full_name, role').eq('id', user.id).maybeSingle();
  if (!staff) redirect('/no-access');

  return <AppShell staff={staff}>{children}</AppShell>;
}
