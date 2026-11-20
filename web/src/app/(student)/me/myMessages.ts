import 'server-only';
import { cache } from 'react';
import { messagesMissing } from '@/lib/messages';
import { createClient } from '@/lib/supabase/server';

// How many messages from PencilMaths the signed-in student (or the child picked on a family login) has not
// seen yet. 0 until the Messages script has been run on the database.
// cache: asked for once per page load, though the layout (the tab's number) and the dashboard tile both use it.
export const getMyUnread = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_unread_messages');
  if (error) {
    if (!messagesMissing(error)) console.error('my_unread_messages failed:', error.message);
    return 0;
  }
  return data ?? 0;
});
