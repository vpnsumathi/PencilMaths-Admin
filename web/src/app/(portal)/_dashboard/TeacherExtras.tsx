import Link from 'next/link';
import ui from '@/components/ui.module.css';
import { shortWhen, ukClock, type ListResult, type TeacherChange } from '@/lib/extraClasses';
import { createClient } from '@/lib/supabase/server';
import { ExtraBadge } from '../extra-classes/bits';
import styles from './teacher.module.css';

// A teacher's dashboard: extra classes to mark (ended, register not saved) and what the office changed in the last
// 48 hours (booked, moved, cancelled, restored, another teacher, students added or taken off), so a moved class
// isn't missed (guide 24). Shows nothing when there is nothing to say. Inside <Suspense>, teachers only.
export async function TeacherExtras() {
  const supabase = await createClient();
  const [{ data: toMark }, { data: changes }] = await Promise.all([
    supabase.rpc('extra_class_list', { p: { status: 'to_mark', page_size: 20 } }),
    supabase.rpc('teacher_extra_changes'),
  ]);
  const marking = (toMark as ListResult | null)?.rows ?? [];
  const changed = (changes as TeacherChange[] | null) ?? [];
  if (marking.length === 0 && changed.length === 0) return null;

  return (
    <article className={styles.card} style={{ marginBottom: 16 }}>
      <h2>Extra classes <ExtraBadge /></h2>
      <p className={styles.cardSub}>Attendance to take, and changes the office made in the last 48 hours</p>
      <ul className={styles.attention}>
        {marking.map((r) => (
          <li key={`m${r.id}`}>
            <Link href={`/extra-classes/${r.id}#register`} className={styles.attentionItem}>
              <span className={styles.attentionText}>
                <strong>Take attendance: {r.code} · {shortWhen(r.starts_at)}</strong>
                <span>{r.students.map((s) => s.name).join(', ')} · {r.subject}</span>
              </span>
              <span className={`${styles.pill} ${styles.danger}`}>Mark attendance</span>
            </Link>
          </li>
        ))}
        {changed.map((c, i) => {
          const { label, tone } = changeLabel(c);
          return (
            <li key={`c${i}`}>
              {/* A class given to another teacher can't be opened any more, so it isn't a link. */}
              <MaybeLink href={c.still_mine ? `/extra-classes/${c.extra_class_id}` : null}>
                <span className={styles.attentionText}>
                  <strong>{c.code} · {shortWhen(c.starts_at)}–{ukClock(c.ends_at)}{c.students ? ` · ${c.students}` : ''}</strong>
                  <span>{label}{c.reason ? ` · “${c.reason}”` : ''} · {shortWhen(c.at)}</span>
                </span>
                <span className={`${styles.pill} ${styles[tone]}`}>{badge(c)}</span>
              </MaybeLink>
            </li>
          );
        })}
      </ul>
      <p className={styles.more}><Link href="/extra-classes" className={ui.link}>All your extra classes →</Link></p>
    </article>
  );
}

function MaybeLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? <Link href={href} className={styles.attentionItem}>{children}</Link> : <div className={styles.attentionItem}>{children}</div>;
}

// The short label on the right: New, Moved, Cancelled …
function badge(c: TeacherChange) {
  switch (c.event) {
    case 'booked': return 'New';
    case 'rescheduled': return 'Moved';
    case 'cancelled': return 'Cancelled';
    case 'restored': return 'Back on';
    case 'teacher_changed': return c.still_mine ? 'Now yours' : 'Moved to another teacher';
    case 'student_added': return 'Student added';
    case 'student_removed': return 'Student taken off';
    default: return 'Changed';
  }
}

function changeLabel(c: TeacherChange): { label: string; tone: 'danger' | 'warn' | 'info' } {
  const d = c.detail as { from?: { starts_at?: string; name?: string }; to?: { name?: string }; name?: string };
  switch (c.event) {
    case 'booked': return { label: 'The office created this extra class for you', tone: 'info' };
    case 'rescheduled': return { label: d.from?.starts_at ? `Moved from ${shortWhen(d.from.starts_at)}` : 'Moved to a new time', tone: 'warn' };
    case 'cancelled': return { label: 'Cancelled by the office', tone: 'danger' };
    case 'restored': return { label: 'The cancellation was undone: the class is on', tone: 'info' };
    case 'teacher_changed':
      return c.still_mine
        ? { label: `Given to you${d.from?.name ? ` (was ${d.from.name})` : ''}`, tone: 'info' }
        : { label: `Given to ${d.to?.name ?? 'another teacher'}`, tone: 'warn' };
    case 'student_added': return { label: `${d.name ?? 'A student'} was added`, tone: 'info' };
    case 'student_removed': return { label: `${d.name ?? 'A student'} was taken off`, tone: 'warn' };
    default: return { label: 'Changed by the office', tone: 'info' };
  }
}
