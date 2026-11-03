import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Dashboard } from './dashboard';

// The signed-in student's dashboard (my_dashboard): name, classes and homework. null for staff, unknown
// logins and students who have left.
// cache: asked for once per page load, though both the student layout (for the name) and the page use it.
export const getMyDashboard = cache(async (): Promise<Dashboard | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_dashboard');
  return (data as Dashboard | null) ?? null;
});
