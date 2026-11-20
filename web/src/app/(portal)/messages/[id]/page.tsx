import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alerts } from '@/components/Alerts';
import { AutoRefresh } from '@/components/AutoRefresh';
import { ConfirmButton } from '@/components/ConfirmButton';
import { MessageList } from '@/components/MessageList';
import listStyles from '@/components/MessageList.module.css';
import { ReplyBox } from '@/components/ReplyBox';
import { ScrollToEnd } from '@/components/ScrollToEnd';
import ui from '@/components/ui.module.css';
import { requireStaff } from '@/lib/auth';
import { messagesMissing, MESSAGES_NOT_READY, officeUnread, sentLabel, studentsWord, type Message } from '@/lib/messages';
import { UUID, yearLabel } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { removeMessage, sendMessage } from '../actions';
import styles from '../messages.module.css';

export const metadata = { title: 'Conversation' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string; ok?: string; error?: string }> };
type Row = {
  id: string; from_side: 'office' | 'student'; sender_id: string | null; sender_name: string; family_login: boolean;
  body: string; created_at: string; removed_at: string | null;
  message_broadcasts: { audience: string; recipients: number } | null;
};

const PAGE = 50;

// One student's conversation with the office: the latest 50 messages (Older messages for more), and a reply box.
// Opening it marks the student's messages as read for every staff member.
export default async function ConversationPage({ params, searchParams }: Props) {
  const viewer = await requireStaff();
  const { id } = await params;
  const { before: beforeAsked, ok, error: problem } = await searchParams;
  if (!UUID.test(id)) notFound();
  const before = beforeAsked && !Number.isNaN(Date.parse(beforeAsked)) ? beforeAsked : null;
  const supabase = await createClient();

  let messageQuery = supabase.from('messages')
    .select('id, from_side, sender_id, sender_name, family_login, body, created_at, removed_at, message_broadcasts(audience, recipients)')
    .eq('student_id', id)
    .order('created_at', { ascending: false })
    .limit(PAGE + 1);
  if (before) messageQuery = messageQuery.lt('created_at', before);

  const [{ data: student }, { data: classes }, thread, list] = await Promise.all([
    supabase.from('students').select('id, first_name, last_name, code, year_group, status, auth_user_id').eq('id', id).maybeSingle(),
    supabase.from('enrolments').select('subjects(name), batches(code)').eq('student_id', id).is('ended_on', null).not('batch_id', 'is', null),
    supabase.from('message_threads').select('last_student_at, office_read_at, office_read_by, student_read_at').eq('student_id', id).maybeSingle(),
    messageQuery,
  ]);
  if (!student) notFound();
  const missing = messagesMissing(list.error ?? thread.error);
  if (list.error && !missing) throw list.error;

  const rows = (list.data ?? []) as unknown as Row[];

  // Opened: the student's messages are now read (for every staff member), but only on the latest view and only up
  // to the newest message on this screen (its exact time from the database), so a reply that arrives meanwhile
  // stays unread. Older messages (?before=) never mark anything read.
  const t = thread.data;
  if (t && !before && rows[0] && officeUnread(t.last_student_at, t.office_read_at)) {
    const { error } = await supabase.rpc('mark_thread_read', { p_student: id, p_through: rows[0].created_at });
    if (error) console.error('mark_thread_read failed:', error.message);
  }

  const more = rows.length > PAGE;
  const messages: Message[] = rows.slice(0, PAGE).reverse().map((m) => ({
    id: m.id, from: m.from_side, sender: m.sender_name.split(' ')[0] || m.sender_name, body: m.body,
    removed: m.removed_at !== null, created_at: m.created_at, family_login: m.family_login,
    audience: m.message_broadcasts ? `${m.message_broadcasts.audience} (${studentsWord(m.message_broadcasts.recipients)})` : null,
    mine: m.from_side === 'office' && m.sender_id === viewer.userId,
  }));
  type Class = { subjects: { name: string } | null; batches: { code: string } | null };
  const classList = ((classes ?? []) as unknown as Class[])
    .map((c) => `${c.batches?.code ?? ''}${c.subjects ? ` ${c.subjects.name}` : ''}`.trim()).filter(Boolean).join(', ');
  const left = student.status === 'left';
  const back = `/messages/${id}`;

  return (
    <div className={styles.thread}>
      <Link href="/messages" className={ui.back}>← Messages</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>{student.first_name} {student.last_name}</h1>
          <p className={ui.subtitle}>
            {student.code} · {yearLabel(student.year_group)}{classList ? ` · ${classList}` : ''}{' · '}
            <Link href={`/students/${id}`} className={ui.link}>Student page</Link>
          </p>
        </div>
      </div>
      <Alerts ok={ok} problem={problem} />
      {missing && <p className={`${ui.alert} ${ui.alertWarn}`}>{MESSAGES_NOT_READY}</p>}
      {!student.auth_user_id && !left && (
        <p className={`${ui.alert} ${ui.alertWarn}`}>
          {student.first_name} has no PencilMaths login yet, so they will see these messages once they are given portal access on their student page.
        </p>
      )}
      {left && <p className={`${ui.alert} ${ui.alertWarn}`}>{student.first_name} has left, so they can no longer see or send messages. The history is kept here.</p>}

      <ScrollToEnd className={styles.convo} last={messages.at(-1)?.id ?? null} stay={!before}>
        {more && (
          <Link href={`${back}?before=${encodeURIComponent(rows[PAGE - 1].created_at)}`} className={`${ui.link} ${styles.older}`}>
            Older messages
          </Link>
        )}
        {before && <Link href={back} className={`${ui.link} ${styles.older}`}>Back to the latest messages</Link>}
        {messages.length === 0
          ? <p className={ui.empty}>No messages yet. Write the first one below.</p>
          : <MessageList messages={messages} viewer="staff" readAt={t?.student_read_at ?? null} remove={(m) => (
              <form action={removeMessage}>
                <input type="hidden" name="message_id" value={m.id} />
                <input type="hidden" name="student_id" value={id} />
                <ConfirmButton className={listStyles.metaButton}
                  message={`Remove this message? ${student.first_name} will see "Message removed" instead. Staff still see the words.`}>
                  Remove
                </ConfirmButton>
              </form>
            )} />}
      </ScrollToEnd>
      {t?.office_read_by && t.office_read_at && (
        <p className={ui.stamp}>Last opened by {t.office_read_by}, {sentLabel(t.office_read_at)}</p>
      )}

      {!left && (
        <ReplyBox action={sendMessage} hidden={{ kind: 'students', students: id, back }}
          placeholder={`Write to ${student.first_name}…`} label={`Message to ${student.first_name}`}
          classes={{ form: styles.reply, row: styles.replyRow, textarea: `${ui.input} ${ui.textarea}`, button: ui.primaryButton, count: styles.count }} />
      )}
      <AutoRefresh />
    </div>
  );
}
