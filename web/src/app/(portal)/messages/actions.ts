'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { redirectWith, text } from '@/lib/form';
import { MESSAGE_MAX, messagesMissing, MESSAGES_NOT_READY, studentsWord } from '@/lib/messages';
import { UUID, YEARS } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Messages to students (Help/29-messages.md). Staff only: teachers and students are stopped here and by the
// database (send_messages and remove_message check the login again).

// Only back to a Messages page of this app.
function backTo(value: string, fallback: string) {
  return /^\/messages(\/(new|[0-9a-f-]{36}))?$/i.test(value) ? value : fallback;
}

// Send a message: from the New message form (one student, chosen students, a batch, a year group, everyone),
// or the reply box in a conversation (one student). Each student gets their own copy.
export async function sendMessage(form: FormData) {
  await requireStaff();
  const kind = text(form, 'kind');
  const body = text(form, 'body');
  const back = backTo(text(form, 'back'), '/messages/new');
  if (!body) redirectWith(back, 'error', 'Write a message first.');
  if (body.length > MESSAGE_MAX) redirectWith(back, 'error', `A message can be at most ${MESSAGE_MAX.toLocaleString('en-GB')} characters.`);

  const supabase = await createClient();
  let students: string[] | null = null;
  let batch: string | null = null;
  let year: number | null = null;
  if (kind === 'students') {
    students = [...new Set(form.getAll('students').map(String).filter((id) => UUID.test(id)))];
    if (students.length === 0) redirectWith(back, 'error', 'Choose at least one student.');
  } else if (kind === 'batch') {
    batch = text(form, 'batch');
    if (!UUID.test(batch)) redirectWith(back, 'error', 'Choose a batch.');
  } else if (kind === 'year') {
    year = Number(text(form, 'year'));
    if (!YEARS.includes(year)) redirectWith(back, 'error', 'Choose a year group.');
  } else if (kind !== 'all') {
    redirectWith(back, 'error', 'Choose who the message is for.');
  }

  const { data: sent, error } = await supabase.rpc('send_messages', {
    p_kind: kind, p_students: students, p_batch: batch, p_year: year, p_body: body,
  });
  if (error) {
    console.error('send_messages failed:', error.message);
    redirectWith(back, 'error', messagesMissing(error) ? MESSAGES_NOT_READY
      : /no current student/i.test(error.message) ? 'There is no current student to send this to.'
      : /batch is closed/i.test(error.message) ? 'That batch is closed. Choose another batch.' : 'Could not send the message.');
  }
  revalidatePath('/messages');
  // A message to one student opens their conversation; a group send goes to the list of group sends.
  if (kind === 'students' && students!.length === 1) {
    revalidatePath(`/messages/${students![0]}`);
    redirect(`/messages/${students![0]}`);
  }
  redirectWith('/messages?view=groups', 'ok', `Sent to ${studentsWord(Number(sent))}. Each one has their own copy and can reply privately.`);
}

// Remove a message you sent. The student then sees "Message removed"; staff still see the words.
export async function removeMessage(form: FormData) {
  await requireStaff();
  const id = text(form, 'message_id');
  const student = text(form, 'student_id');
  if (!UUID.test(student)) redirect('/messages');
  const back = `/messages/${student}`;
  if (!UUID.test(id)) redirectWith(back, 'error', 'Message not found.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_message', { p_message: id });
  if (error) {
    console.error('remove_message failed:', error.message);
    redirectWith(back, 'error', /only remove/i.test(error.message) ? 'You can only remove a message you sent.' : 'Could not remove the message.');
  }
  revalidatePath(back);
  revalidatePath('/messages');
  redirectWith(back, 'ok', 'Message removed. The student now sees "Message removed" instead.');
}
