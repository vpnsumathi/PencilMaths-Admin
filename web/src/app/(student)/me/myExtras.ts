import 'server-only';
import { cache } from 'react';
import type { MyExtras } from '@/lib/extraClasses';
import { createClient } from '@/lib/supabase/server';

// The signed-in student's extra classes (my_extra_classes, guide 24): upcoming (plus classes cancelled in the last
// 7 days), taken, and the attended count. null if the extra classes script hasn't been run on the database yet.
// cache: asked once per page load.
export const getMyExtras = cache(async (): Promise<MyExtras | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_extra_classes');
  if (error) {
    if (error.code !== 'PGRST202') console.error('my_extra_classes:', error.message);
    return null;
  }
  return (data as MyExtras | null) ?? null;
});
