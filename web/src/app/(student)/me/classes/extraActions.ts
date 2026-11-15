'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { shortWhen } from '@/lib/extraClasses';
import { extraMeetLink } from '@/lib/extraMeet';
import { redirectWith, text } from '@/lib/form';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// A student (or family login) presses "I'm here, open class" on an extra class (guide 24). The database
// (join_extra_class) checks the class is theirs and that it is join time, and records the check-in. Only then does
// the server look up the class's Meet room and send them to it, so the link is never on the page itself.
export async function joinExtraClass(form: FormData) {
  const id = text(form, 'id');
  const back = text(form, 'back') === '/me' ? '/me' : '/me/classes';
  if (!UUID.test(id)) redirectWith(back, 'error', 'Class not found.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('join_extra_class', { p_id: id });
  if (error) {
    console.error('joinExtraClass failed:', error.message);
    redirectWith(back, 'error', error.code === 'P0001' ? error.message : 'Could not open your class. Please try again.');
  }
  const r = data as { attendance: string; opens_at: string; ends_at: string };
  if (r.attendance === 'outside') {
    redirectWith(back, 'error', new Date(r.opens_at).getTime() > Date.now()
      ? `Your extra class opens at ${shortWhen(r.opens_at)}. Come back then.`
      : 'This extra class has finished.');
  }

  let link: string | null = null;
  try {
    link = await extraMeetLink(id);
  } catch (e) {
    console.error('joinExtraClass: Meet room:', e);
  }
  revalidatePath('/me', 'layout');
  if (!link) redirectWith(back, 'error', 'You are checked in, but the class room could not be opened. Please tell Pencil Maths.');
  redirect(link!);
}
