import Link from 'next/link';
import { formatDate, formatTime } from '@/lib/format';
import { WEEKDAYS } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import styles from '../../student.module.css';
import { type Dashboard, nextClass } from '../dashboard';

export const metadata = { title: 'My classes' };

// One card per class the student is in: teacher, class times and homework for that class.
export default async function MyClasses() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_dashboard');
  const me = data as Dashboard; // the layout has already checked this is a student

  return (
    <>
      <h1>My classes</h1>
      <p className={styles.muted}>Your classes at Pencil Maths, with your teacher and class times.</p>

      {me.classes.length === 0 && <p className={styles.muted} style={{ marginTop: 16 }}>You are not in any classes yet.</p>}
      <div className={`${styles.cards} ${styles.classCards}`} style={{ marginTop: 16 }}>
        {me.classes.map((c) => (
          <article key={c.subject} className={styles.card}>
            <p className={styles.subject}>{c.subject}</p>
            <h3><strong>{c.batch_code ? `Class ${c.batch_code}` : 'Class not chosen yet'}</strong></h3>
            <p className={styles.teacherLine}>Teacher: <strong>{c.teacher ?? 'To be confirmed'}</strong></p>
            <dl className={styles.details}>
              <dt>Teacher</dt><dd><strong>{c.teacher ?? 'To be confirmed'}</strong></dd>
              {c.class_year && <><dt>Class year</dt><dd>Year {c.class_year}</dd></>}
              <dt>Class times</dt>
              <dd>
                {c.times.length === 0
                  ? 'To be confirmed'
                  : c.times.map((t) => `${WEEKDAYS[t.weekday]} ${formatTime(t.start_time)}`).join(', ')}
              </dd>
              <dt>Next class</dt><dd>{nextClass(c.times)?.label ?? 'To be confirmed'}</dd>
              <dt>Topic</dt><dd>{c.topic ?? 'To be confirmed'}</dd>
              <dt>Joined</dt><dd>{formatDate(c.started_on)}</dd>
              <dt>Homework</dt>
              <dd>
                <Link href="/me/homework" className={c.to_do > 0 ? styles.overdue : styles.marked}>
                  {c.to_do > 0 ? `${c.to_do} to hand in` : 'All handed in'}
                </Link>
                {c.marked > 0 && ` · ${c.marked} marked`}
              </dd>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
