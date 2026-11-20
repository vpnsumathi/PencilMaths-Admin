import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Home } from './_home/model';

// What the home page needs on top of my_dashboard (my_home, Help/12 section 3.2): homework to do, this week's due
// dates, extra classes, each class's next lesson and the newest notes. null for anyone who isn't a student, and
// until the student home script (20261123000001_student_home.sql) has been run on the database: the page then
// shows the parts it can without it.
export const getMyHome = cache(async (): Promise<Home | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_home');
  if (error) {
    if (error.code !== 'PGRST202') console.error('my_home failed:', error.message);
    return null;
  }
  return (data as Home | null) ?? null;
});
