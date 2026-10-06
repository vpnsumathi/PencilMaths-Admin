import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Every page inside (portal) is for active staff only.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // The security rules only return this row if the user is active staff.
  const { data: staff } = await supabase.from('staff').select('id').eq('id', user.id).maybeSingle();
  if (!staff) redirect('/no-access');

  return <>{children}</>;
}
