import Link from 'next/link';
import { AutoRefresh } from '@/components/AutoRefresh';
import { FocusMessage } from '@/components/FocusMessage';
import { MessageList } from '@/components/MessageList';
import { ReplyBox } from '@/components/ReplyBox';
import { ScrollToEnd } from '@/components/ScrollToEnd';
import { messagesMissing, type Message } from '@/lib/messages';
import { createClient } from '@/lib/supabase/server';
import styles from '../../student.module.css';
import { sendMyMessage } from './actions';
import page from './messages.module.css';

export const metadata = { title: 'Messages' };

type Props = { searchParams: Promise<{ before?: string; sent?: string; error?: string }> };

// Messages from PencilMaths and the student's replies (Help/29-messages.md). On a family login this is the
// conversation of the child picked in the top bar. Opening the page marks everything as seen.
export default async function MyMessages({ searchParams }: Props) {
  const { before: beforeAsked, sent, error: problem } = await searchParams;
  const before = beforeAsked && !Number.isNaN(Date.parse(beforeAsked)) ? beforeAsked : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_messages', { p_before: before });
  if (error && !messagesMissing(error)) console.error('my_messages failed:', error.message);
  const result = (data ?? { messages: [], more: false }) as { messages: Message[]; more: boolean };
  const messages = result.messages;

  // Seen: the "new" marks above were worked out first, so they show this once. Only up to the newest message on
  // this screen (its exact time from the database), so a message that arrives meanwhile stays New.
  const newest = messages.at(-1);
  if (!error && !before && newest && messages.some((m) => m.new)) {
    const { error: readError } = await supabase.rpc('mark_my_messages_read', { p_through: newest.created_at });
    if (readError) console.error('mark_my_messages_read failed:', readError.message);
  }

  return (
    <>
      <h1>Messages</h1>
      <p className={styles.muted}>Messages from PencilMaths. Only the PencilMaths office sees your replies.</p>
      {problem && <FocusMessage key={`error${Date.now()}`} className={styles.errorMsg} role="alert">{problem}</FocusMessage>}
      {sent && !problem && <p className={styles.okMsg} role="status">Sent. PencilMaths will reply here.</p>}

      <ScrollToEnd className={page.convo} last={messages.at(-1)?.id ?? null} stay={!before}>
        {result.more && messages[0] && (
          <Link href={`/me/messages?before=${encodeURIComponent(messages[0].created_at)}`} className={page.older}>
            Older messages
          </Link>
        )}
        {before && <Link href="/me/messages" className={page.older}>Back to the latest messages</Link>}
        {messages.length === 0
          ? <p className={styles.muted} style={{ marginTop: 12 }}>No messages yet. You can write to PencilMaths below.</p>
          : <MessageList messages={messages} viewer="student" />}
      </ScrollToEnd>

      {!error && (
        <ReplyBox action={sendMyMessage} placeholder="Write a message to PencilMaths…" label="Message to PencilMaths"
          classes={{ form: page.reply, row: page.row, textarea: page.textarea, button: page.send, count: page.count }} />
      )}
      {error && <p className={styles.muted}>Messages are not switched on yet.</p>}
      <AutoRefresh />
    </>
  );
}
