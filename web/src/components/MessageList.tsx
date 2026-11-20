import { linkify, sentLabel, type Message } from '@/lib/messages';
import styles from './MessageList.module.css';

// A conversation, oldest message first. The person looking sees their own side on the right:
// staff see office messages on the right; students see their own replies on the right.
// Staff (viewer "staff") also see removed words, group sends and family-login replies; remove() draws the
// Remove button under a message the staff member sent.
export function MessageList({ messages, viewer, readAt, remove }: {
  messages: Message[];
  viewer: 'staff' | 'student';
  // Staff: when the student last opened Messages, to show "Seen" under office messages.
  readAt?: string | null;
  remove?: (m: Message) => React.ReactNode;
}) {
  const firstNew = viewer === 'student' ? messages.findIndex((m) => m.new) : -1;
  return (
    <ol className={styles.list}>
      {messages.map((m, i) => {
        const mine = viewer === 'staff' ? m.from === 'office' : m.from === 'student';
        const seen = viewer === 'staff' && m.from === 'office' && !m.removed && !!readAt && new Date(readAt).getTime() >= new Date(m.created_at).getTime();
        return (
          <li key={m.id} style={{ display: 'contents' }}>
            {viewer === 'staff' && m.audience && <span className={styles.group}>Sent to {m.audience}</span>}
            {i === firstNew && <span className={styles.newLine}>New</span>}
            <div className={`${styles.item} ${mine ? styles.right : styles.left} ${m.removed ? styles.removed : ''}`}>
              <div className={styles.bubble}>
                {m.removed && viewer === 'student' ? 'Message removed' : linkify(m.body ?? '').map((p, j) => p.href
                  ? <a key={j} href={p.href} target="_blank" rel="noopener noreferrer">{p.text}</a>
                  : <span key={j}>{p.text}</span>)}
              </div>
              <div className={styles.meta}>
                <span>
                  {viewer === 'student' && m.from === 'student' ? 'You' : m.sender}
                  {viewer === 'student' && m.from === 'office' ? ', PencilMaths' : viewer === 'staff' && m.from === 'office' ? ', office' : ''}
                  {' · '}{sentLabel(m.created_at)}
                </span>
                {m.removed && viewer === 'staff' && <span className={styles.tag}>Removed: the student no longer sees this</span>}
                {seen && <span>· Seen</span>}
                {viewer === 'staff' && m.family_login && <span className={styles.tag}>family login</span>}
                {remove && m.mine && !m.removed && remove(m)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
