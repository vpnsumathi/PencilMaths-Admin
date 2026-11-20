import Link from 'next/link';
import ui from '@/components/ui.module.css';
import { messagesMissing, officeUnread, sentLabel } from '@/lib/messages';
import { createClient } from '@/lib/supabase/server';

type Row = { id: string; from_side: 'office' | 'student'; sender_name: string; body: string; created_at: string; removed_at: string | null };

// "Messages" on the student page (staff only, Help/29): the last 3 messages with this student and a link to
// the whole conversation, where staff can reply.
export async function MessagesCard({ studentId, firstName }: { studentId: string; firstName: string }) {
  const supabase = await createClient();
  const [{ data, error }, { data: thread }] = await Promise.all([
    supabase.from('messages').select('id, from_side, sender_name, body, created_at, removed_at')
      .eq('student_id', studentId).order('created_at', { ascending: false }).limit(3),
    supabase.from('message_threads').select('last_student_at, office_read_at').eq('student_id', studentId).maybeSingle(),
  ]);
  if (error) {
    if (!messagesMissing(error)) console.error('MessagesCard failed:', error.message);
    return null;
  }
  const rows = ((data ?? []) as Row[]).reverse();
  const unread = thread ? officeUnread(thread.last_student_at, thread.office_read_at) : false;

  return (
    <section id="messages" className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
      <div className={ui.header} style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Messages{unread && <span className={`${ui.badge} ${ui.badgeBrand}`} style={{ marginLeft: 8 }}>New reply</span>}</h2>
        <Link href={`/messages/${studentId}`} className={ui.secondaryButton}>{rows.length ? 'Open conversation' : `Message ${firstName}`}</Link>
      </div>
      {rows.length === 0 ? <p className={ui.empty}>No messages with {firstName} yet.</p> : (
        <ul className={ui.list} style={{ margin: 0 }}>
          {rows.map((m) => (
            <li key={m.id} style={{ display: 'block' }}>
              <strong>{m.from_side === 'office' ? `${m.sender_name.split(' ')[0]} (office)` : m.sender_name}</strong>
              <span className={ui.stamp}> · {sentLabel(m.created_at)}</span>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: m.removed_at ? 'var(--muted)' : undefined }}>
                {m.removed_at ? `Removed: ${m.body}` : m.body.length > 240 ? `${m.body.slice(0, 240)}…` : m.body}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
