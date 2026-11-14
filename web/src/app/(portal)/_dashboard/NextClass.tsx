import Link from 'next/link';
import { nextClass } from '@/app/(student)/me/dashboard';
import ui from '@/components/ui.module.css';
import { CLASS_WINDOW, cleanClassLink, currentClass } from '@/lib/classLink';
import { createClient } from '@/lib/supabase/server';
import styles from '../dashboard.module.css';

// The teacher's dashboard box: their next class (or the one on now) with Join class, and the two after it.
// Two small queries, only for teachers, shown inside <Suspense> so the rest of the dashboard never waits for it.
// The database only gives a teacher their own batches.

type Row = {
  id: string; code: string; name: string | null; teacher_id: string | null; class_link: string | null;
  subjects: { name: string } | null; batch_slots: { weekday: number; start_time: string }[];
};
type Classroom = { batch_id: string; course_state: string | null; teacher_status: string; teacher_id: string | null; teacher_link: string | null };

export async function NextClass() {
  const supabase = await createClient();
  const [{ data: batches }, { data: classrooms }, { data: rooms }] = await Promise.all([
    supabase.from('batches')
      .select('id, code, name, teacher_id, class_link, subjects(name), batch_slots(weekday, start_time)')
      .is('closed_on', null),
    // Classes made with Create Google Classroom (empty, not an error, if that script hasn't run yet).
    supabase.from('batch_classrooms').select('batch_id, course_state, teacher_status, teacher_id, teacher_link'),
    // Batches with a Meet room: at class time Join class opens it (empty if that script hasn't run yet).
    supabase.from('batch_meet_rooms').select('batch_id'),
  ]);
  const withRoom = new Set((rooms ?? []).map((r) => r.batch_id as string));
  const created = new Map(((classrooms ?? []) as Classroom[]).map((c) => [c.batch_id, c]));

  const classes = ((batches ?? []) as unknown as Row[])
    .filter((b) => b.batch_slots.length > 0)
    .map((b) => {
      const c = created.get(b.id);
      // Same rule as the batch page: a created class only once Google says this teacher has joined it
      // (before that its invite link would make them a student), otherwise the pasted link.
      const link = c
        ? (c.course_state === 'ACTIVE' && c.teacher_status === 'joined' && c.teacher_id === b.teacher_id ? cleanClassLink(c.teacher_link) : null)
        : cleanClassLink(b.class_link);
      const now = currentClass(b.batch_slots, CLASS_WINDOW);
      // At class time a batch with a Meet room opens the room (guide 21, section 12).
      return { b, link: now && withRoom.has(b.id) ? `/batches/${b.id}/meet` : link, now, next: nextClass(b.batch_slots)! };
    })
    .sort((x, y) => Number(y.now !== null) - Number(x.now !== null)
      || `${x.next.date} ${x.next.time}`.localeCompare(`${y.next.date} ${y.next.time}`));

  if (classes.length === 0) {
    return (
      <article className={`${styles.card} ${styles.nextClassCard}`}>
        <h2>Next class</h2>
        <p className={styles.cardSub}>None of your batches has class times yet.</p>
      </article>
    );
  }
  const [first, ...later] = classes;
  const title = (r: Row) => `${r.code}${r.name ? ` · ${r.name}` : ''}${r.subjects ? ` · ${r.subjects.name}` : ''}`;

  return (
    <article className={`${styles.card} ${styles.nextClassCard}`}>
      <h2>{first.now ? (first.now.started ? 'Class now' : 'Starting soon') : 'Next class'}</h2>
      <div className={styles.nextClassMain}>
        <div>
          <p className={styles.nextClassWhen}>{first.now ? first.now.label : first.next.label}</p>
          <p className={styles.nextClassWhat}><Link href={`/batches/${first.b.id}`} className={ui.link}>{title(first.b)}</Link></p>
        </div>
        {first.link ? (
          <a href={first.link} target="_blank" rel="noopener noreferrer" className={ui.primaryButton}>Join class</a>
        ) : (
          <span className={styles.kpiSub}>No class link yet</span>
        )}
      </div>
      {later.length > 0 && (
        <ul className={styles.nextClassLater}>
          {later.slice(0, 2).map(({ b, next, link }) => (
            <li key={b.id}>
              <span>{next.label}</span>
              <Link href={`/batches/${b.id}`} className={ui.link}>{title(b)}</Link>
              {link && <a href={link} target="_blank" rel="noopener noreferrer" className={ui.link}>Join</a>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
