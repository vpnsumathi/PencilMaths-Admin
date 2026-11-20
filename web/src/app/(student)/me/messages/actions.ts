'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { MESSAGE_MAX } from '@/lib/messages';
import { createClient } from '@/lib/supabase/server';

// A student (or a family login, for the child picked in the switcher) replies to PencilMaths.
// The database decides whose conversation it goes in (current_student_id), so nothing here can pick another.
export async function sendMyMessage(form: FormData) {
  const body = String(form.get('body') ?? '').trim();
  const fail = (message: string): never => redirect(`/me/messages?error=${encodeURIComponent(message)}`);
  if (!body) fail('Write a message first.');
  if (body.length > MESSAGE_MAX) fail(`A message can be at most ${MESSAGE_MAX.toLocaleString('en-GB')} characters.`);
  const supabase = await createClient();
  const { error } = await supabase.rpc('send_my_message', { p_body: body });
  if (error) {
    console.error('send_my_message failed:', error.message);
    fail(/a lot of messages/i.test(error.message) ? 'You have sent a lot of messages in the last hour. Please wait a little before sending more.'
      : 'Your message could not be sent. Please try again.');
  }
  revalidatePath('/me/messages');
  redirect('/me/messages?sent=1');
}
