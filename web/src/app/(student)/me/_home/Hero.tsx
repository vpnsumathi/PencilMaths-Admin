import Link from 'next/link';
import { KIND_LABEL } from '@/lib/extraClasses';
import { clock12 } from '@/lib/format';
import type { ClassWindow } from '@/lib/classLink';
import { JoinClassButton } from '../classes/JoinClassButton';
import { JoinExtraButton } from '../classes/JoinExtraButton';
import { dayName, shortDate, startsIn, ukClockOf, type NextLesson, type Upcoming } from './model';
import h from './home.module.css';

const plus = (time: string, minutes: number) => {
  const [hh, mm] = time.split(':').map(Number);
  const t = hh * 60 + mm + minutes;
  return clock12(`${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
};
const lessonText = (l: NextLesson | undefined) =>
  l ? `${l.class_no ? `Class ${l.class_no} · ` : ''}${l.name}${l.planned_on ? ` · ${shortDate(l.planned_on)}` : ''}` : null;

// "In 2 days · with Ms Green"; just "With Ms Green" tomorrow, as the line above already says Tomorrow.
function whenLine(start: Date, now: Date, teacher: string) {
  const rel = startsIn(start, now);
  return rel === 'tomorrow' ? `With ${teacher}` : `${rel.charAt(0).toUpperCase()}${rel.slice(1)} · with ${teacher}`;
}

// The "Up next" card at the top of the home page. During check-in it becomes the big "I'm here, open class" button
// (the database decides whether a press counts, as on My classes). Otherwise it shows the next class.
// hasClasses: the student is in a class (so an empty card can say why).
export function Hero({ hero, window, lessons, hasClasses, now }: {
  hero: Upcoming | null; window: ClassWindow; lessons: NextLesson[]; hasClasses: boolean; now: Date;
}) {
  if (!hero) {
    return (
      <section className={`${h.hero} ${h.heroQuiet}`} aria-labelledby="up-next">
        <p className={h.kicker} id="up-next">Your classes</p>
        <h2 className={h.heroTitle}>{hasClasses ? 'Class times to be confirmed' : 'No classes yet'}</h2>
        <p className={h.when}>
          {hasClasses ? 'Your class times will show here once PencilMaths has set them.'
            : 'When PencilMaths adds you to a class, your next class will show here.'}
        </p>
      </section>
    );
  }

  if (hero.kind === 'extra') {
    const x = hero.extra;
    const title = `${x.subject} · ${KIND_LABEL[x.kind]}`;
    return (
      <section className={h.hero} aria-labelledby="up-next">
        <span className={h.pill}>{hero.open ? <><i className={h.live} aria-hidden="true" />Join Now</> : 'Extra class'}</span>
        <p className={h.kicker} id="up-next">{hero.open ? (hero.started ? 'Extra class now' : 'Starting soon') : dayName(hero.date, now)}</p>
        <h2 className={h.heroTitle}>{hero.open ? title : `${title} · ${hero.time}`}</h2>
        <p className={h.when}>
          {hero.open ? `${hero.started ? 'Started' : 'Starts'} ${hero.time}${hero.started ? '' : ` · ${startsIn(hero.start, now)}`}`
            : whenLine(hero.start, now, x.teacher)}
        </p>
        <dl className={h.meta}>
          <div><dt>Teacher</dt><dd>{x.teacher}</dd></div>
          <div><dt>Length</dt><dd>{x.length_minutes} minutes</dd></div>
          {!hero.open && <div><dt>Check in from</dt><dd>{ukClockOf(x.opens_at)}</dd></div>}
        </dl>
        {x.note && <p className={h.note}><strong>From PencilMaths:</strong> {x.note}</p>}
        {hero.open ? (
          <>
            <JoinExtraButton id={x.id} back="/me" className={h.bigButton} />
            <p className={h.small}>Late after {window.late_minutes} minutes. The first press is the one that counts.</p>
          </>
        ) : (
          <p className={h.small}>The button to join appears here {window.before_minutes} minutes before the start.</p>
        )}
      </section>
    );
  }

  const c = hero.cls;
  const lesson = lessons.find((l) => l.batch_id === c.batch_id);
  const canJoin = Boolean(c.batch_id && c.has_class_link);
  const name = `${c.subject}${c.batch_code ? ` · ${c.batch_code}` : ''}`;
  return (
    <section className={h.hero} aria-labelledby="up-next">
      <span className={h.pill}>{hero.open ? <><i className={h.live} aria-hidden="true" />Join Now</> : 'Next class'}</span>
      <p className={h.kicker} id="up-next">{hero.open ? (hero.started ? 'Class now' : 'Starting soon') : dayName(hero.date, now)}</p>
      <h2 className={h.heroTitle}>{hero.open ? name : `${c.subject} · ${clock12(hero.time)}`}</h2>
      <p className={h.when}>
        {hero.open ? `${hero.started ? 'Started' : 'Starts'} ${clock12(hero.time)}${hero.started ? '' : ` · ${startsIn(hero.start, now)}`}`
          : whenLine(hero.start, now, c.teacher ?? 'your teacher')}
      </p>
      <dl className={h.meta}>
        {hero.open && <div><dt>Teacher</dt><dd>{c.teacher ?? 'To be confirmed'}</dd></div>}
        <div><dt>Topic now</dt><dd>{c.topic ?? 'To be confirmed'}</dd></div>
        {lessonText(lesson) && <div><dt>{lesson!.status === 'in_progress' ? 'This lesson' : 'Next lesson'}</dt><dd>{lessonText(lesson)}</dd></div>}
        {!hero.open && canJoin && <div><dt>Check in from</dt><dd>{plus(hero.time, -window.before_minutes)}</dd></div>}
      </dl>
      {hero.open ? (
        canJoin ? (
          <>
            <JoinClassButton batchId={c.batch_id!} checkIn className={h.bigButton} />
            <p className={h.small}>Late after {plus(hero.time, window.late_minutes)}. The first press is the one that counts.</p>
          </>
        ) : <p className={h.small}>Your class link isn&apos;t ready yet. Your teacher will share it.</p>
      ) : (
        <div className={h.heroLinks}>
          {canJoin && <JoinClassButton batchId={c.batch_id!} checkIn={false} className={h.ghostButton} />}
          <Link href={`/me/lesson-plan?subject=${encodeURIComponent(c.subject)}`} className={h.ghostButton}>Lesson plan</Link>
          <Link href={`/me/notes?subject=${encodeURIComponent(c.subject)}`} className={h.ghostButton}>Class notes</Link>
        </div>
      )}
    </section>
  );
}
