import Link from 'next/link';
import { nextClass } from '@/app/(student)/me/dashboard';
import ui from '@/components/ui.module.css';
import { CLASS_WINDOW, cleanClassLink, currentClass } from '@/lib/classLink';
import { dayLabel, KIND_LABEL, ukClock, ukClock24, ukDate, type ListResult } from '@/lib/extraClasses';
import { createClient } from '@/lib/supabase/server';
import { ExtraBadge } from '../extra-classes/bits';
import styles from './teacher.module.css';

// The teacher's dashboard box: their next class (or the one on now) with Join class, and the two after it.
// Weekly batch classes and extra classes (guide 24) sit in the same list; an extra class has the Extra label.
// A few small queries, only for teachers, shown inside <Suspense> so the rest of the dashboard never waits for it.
// The database only gives a teacher their own batches and extra classes.

type Row = {
  id: string; code: string; name: string | null; teacher_id: string | null; class_link: string | null;
  subjects: { name: string } | null; batch_slots: { weekday: number; start_time: string }[];
};
type Classroom = { batch_id: string; course_state: string | null; teacher_status: string; teacher_id: string | null; teacher_link: string | null };
// One class in the list, batch or extra.
type Item = {
  key: string; href: string; title: string; extra: boolean; link: string | null;
  now: { started: boolean; label: string } | null; when: string; sort: string;
};

export async function NextClass() {
  const supabase = await createClient();
  const [{ data: batches }, { data: classrooms }, { data: rooms }, { data: extras }] = await Promise.all([
    supabase.from('batches')
      .select('id, code, name, teacher_id, class_link, subjects(name), batch_slots(weekday, start_time)')
      .is('closed_on', null),
    // Classes made with Create Google Classroom (empty, not an error, if that script hasn't run yet).
    supabase.from('batch_classrooms').select('batch_id, course_state, teacher_status, teacher_id, teacher_link'),
    // Batches with a Meet room: at class time Join class opens it (empty if that script hasn't run yet).
    supabase.from('batch_meet_rooms').select('batch_id'),
    // The teacher's next extra classes (nothing, not an error, if the extra classes script hasn't run yet).
    supabase.rpc('extra_class_list', { p: { status: ['upcoming', 'live'], order: 'soonest', page_size: 5 } }),
  ]);
  const withRoom = new Set((rooms ?? []).map((r) => r.batch_id as string));
  const created = new Map(((classrooms ?? []) as Classroom[]).map((c) => [c.batch_id, c]));
  const title = (r: Row) => `${r.code}${r.name ? ` · ${r.name}` : ''}${r.subjects ? ` · ${r.subjects.name}` : ''}`;

  const weekly: Item[] = ((batches ?? []) as unknown as Row[])
    .filter((b) => b.batch_slots.length > 0)
    .map((b) => {
      const c = created.get(b.id);
      // Same rule as the batch page: a created class only once Google says this teacher has joined it
      // (before that its invite link would make them a student), otherwise the pasted link.
      const link = c
        ? (c.course_state === 'ACTIVE' && c.teacher_status === 'joined' && c.teacher_id === b.teacher_id ? cleanClassLink(c.teacher_link) : null)
        : cleanClassLink(b.class_link);
      const now = currentClass(b.batch_slots, CLASS_WINDOW);
      const next = nextClass(b.batch_slots)!;
      return {
        key: b.id, href: `/batches/${b.id}`, title: title(b), extra: false,
        // At class time a batch with a Meet room opens the room (guide 21, section 12).
        link: now && withRoom.has(b.id) ? `/batches/${b.id}/meet` : link,
        now, when: next.label, sort: `${next.date} ${next.time}`,
      };
    });

  const oneOff: Item[] = ((extras as ListResult | null)?.rows ?? []).map((r) => {
    const live = r.status === 'live';
    const started = new Date(r.starts_at).getTime() <= Date.now();
    const time = `${ukClock(r.starts_at)}–${ukClock(r.ends_at)}`;
    return {
      key: r.id, href: `/extra-classes/${r.id}`, extra: true,
      title: `${r.students.map((s) => s.name).join(', ')} · ${KIND_LABEL[r.kind]} · ${r.subject} · ${time}`,
      link: live ? `/extra-classes/${r.id}/meet` : null,
      now: live ? { started, label: started ? `Class now · started ${ukClock(r.starts_at)}` : `Starting soon · ${ukClock(r.starts_at)}` } : null,
      when: dayLabel(r.starts_at), sort: `${ukDate(r.starts_at)} ${ukClock24(r.starts_at)}`,
    };
  });

  const classes = [...weekly, ...oneOff].sort((x, y) => Number(y.now !== null) - Number(x.now !== null) || x.sort.localeCompare(y.sort));

  if (classes.length === 0) {
    return (
      <article className={`${styles.card} ${styles.nextClassCard}`}>
        <h2>Next class</h2>
        <p className={styles.cardSub}>None of your batches has class times yet, and you have no extra classes booked.</p>
      </article>
    );
  }
  const [first, ...later] = classes;

  return (
    <article className={`${styles.card} ${styles.nextClassCard}`}>
      <h2>{first.now ? (first.now.started ? 'Class now' : 'Starting soon') : 'Next class'}{first.extra && <ExtraBadge />}</h2>
      <div className={styles.nextClassMain}>
        <div>
          <p className={styles.nextClassWhen}>{first.now ? first.now.label : first.when}</p>
          <p className={styles.nextClassWhat}><Link href={first.href} className={ui.link}>{first.title}</Link></p>
        </div>
        {first.link ? (
          <a href={first.link} target="_blank" rel="noopener noreferrer" className={ui.primaryButton}>Join class</a>
        ) : (
          <span className={styles.kpiSub}>{first.extra ? 'Join class appears 15 minutes before the start' : 'No class link yet'}</span>
        )}
      </div>
      {later.length > 0 && (
        <ul className={styles.nextClassLater}>
          {later.slice(0, 2).map((c) => (
            <li key={c.key}>
              <span>{c.now ? c.now.label : c.when}</span>
              {c.extra && <ExtraBadge />}
              <Link href={c.href} className={ui.link}>{c.title}</Link>
              {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" className={ui.link}>Join</a>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
