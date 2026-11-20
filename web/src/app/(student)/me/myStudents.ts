import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { LinkedStudent } from '../StudentSwitcher';

// The children this login can open (my_students): one for a student's own login, several on a family login.
// cache: asked for once per page load, though the layout (the switcher) and the home page (its greeting) both use it.
export const getMyStudents = cache(async (): Promise<LinkedStudent[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_students');
  return (data ?? []) as LinkedStudent[];
});
