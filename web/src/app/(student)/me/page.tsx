import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import styles from '../student.module.css';
import { type Dashboard, nextClass } from './dashboard';

export const metadata = { title: 'My dashboard' };

// The student's home page: tiles for their classes and homework, then their class schedule.
export default async function MyDashboard() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_dashboard');
  const me = data as Dashboard; // the layout has already checked this is a student
  const hw = me.homework;
  // Soonest class first; classes with no times yet go last.
  const schedule = me.classes
    .map((c) => ({ c, next: nextClass(c.times) }))
    .sort((a, b) => (a.next ? `${a.next.date} ${a.next.time}` : 'z').localeCompare(b.next ? `${b.next.date} ${b.next.time}` : 'z'));

  return (
    <>
      <h1>Hi {me.first_name}</h1>
      <p className={styles.muted}>
        {me.first_name} {me.last_name} · {me.code} · Year {me.year_group}
        {me.school ? ` · ${me.school}` : ''}
      </p>

      <div className={styles.tiles}>
        <Link href="/me/classes" className={`${styles.tile} ${styles.tileLinkable}`}>
          <p className={styles.subject}>My classes</p>
          <p className={styles.big}>{me.classes.length}</p>
          {me.classes.length === 0 && <p className={styles.muted}>You are not in any classes yet.</p>}
          <ul className={styles.recent}>
            {me.classes.map((c) => (
              <li key={c.subject}>
                <strong>{c.subject}{c.batch_code ? ` · ${c.batch_code}` : ''}</strong> with <strong>{c.teacher ?? 'teacher to be confirmed'}</strong>
              </li>
            ))}
          </ul>
          <span className={styles.tileLink}>See class details →</span>
        </Link>

        {/* Three blocks, each opening its own tab of My homework. */}
        <div className={styles.tile}>
          <p className={styles.subject}>My homework</p>
          <Link href="/me/homework" className={`${styles.block} ${hw.to_do > 0 ? styles.blockDue : styles.blockOk}`}>
            <span className={styles.mid}>{hw.to_do}</span>
            <span>
              <strong>To hand in</strong>
              <span className={styles.muted}>{hw.to_do === 0 ? ' · all done 🎉' : hw.overdue > 0 ? ` · ${hw.overdue} overdue` : ''}</span>
            </span>
          </Link>
          <Link href="/me/homework?tab=handed" className={styles.block}>
            <span className={styles.mid}>{hw.handed_in}</span>
            <span><strong>Handed in</strong><span className={styles.muted}> · waiting to be marked</span></span>
          </Link>
          <Link href="/me/homework?tab=marked" className={`${styles.block} ${styles.blockOk}`}>
            <span className={styles.mid}>✅</span>
            <div>
              <strong>Recently marked</strong>
              {hw.recently_marked.length === 0 ? (
                <p className={styles.muted}>Nothing in the last 2 weeks.</p>
              ) : (
                <ul className={styles.recent}>
                  {hw.recently_marked.map((m) => (
                    <li key={`${m.title}-${m.marked_on}`}>
                      {m.title}: <strong>{m.mark !== null ? `${m.mark}${m.max_mark ? ` / ${m.max_mark}` : ''}` : 'done'}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Link>
        </div>
      </div>

      <section className={`${styles.tile} ${styles.wide}`}>
        <p className={styles.subject}>Class schedule</p>
        {schedule.length === 0 && <p className={styles.muted}>You are not in any classes yet.</p>}
        <div className={styles.scheduleList}>
          {schedule.map(({ c, next }) => (
            <div key={c.subject} className={styles.block}>
              <span className={styles.mid}>🗓️</span>
              <div>
                <strong>{c.subject}{c.batch_code ? ` · ${c.batch_code}` : ''}</strong>
                <p className={styles.nextClass}>{next ? `Next class: ${next.label}` : 'Class times to be confirmed'}</p>
                <p className={styles.muted}>
                  {c.topic ? <>{c.topic_started ? 'Topic now: ' : 'First topic: '}<strong>{c.topic}</strong></> : 'Topic to be confirmed'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
