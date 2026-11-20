import Link from 'next/link';
import {
  hwDate, schoolYearChoices, schoolYearLabel, schoolYearOf, splitUpcoming, STATE_LABEL, upcomingLabel,
  type HwState, type SchoolYearCount, type Upcoming,
} from '@/lib/homework/tracker';
import { addDays } from '@/lib/lessons/tracker';
import styles from './tracker.module.css';

// A status badge in the Homework Tracker's colours.
export function StateBadge({ state, extra }: { state: HwState; extra?: string }) {
  return <span className={`${styles.badge} ${styles[state]}`}>{STATE_LABEL[state]}{extra ? ` · ${extra}` : ''}</span>;
}

// The school year shown, and the others with homework (guide 27). Hidden when there is only this school year.
// A red number = homework in that year still needing action (Overdue, Submitted or Not given).
export function SchoolYears({ years, shown, today, href }: {
  years: SchoolYearCount[]; shown: number; today: string; href: (year: number) => string;
}) {
  const now = schoolYearOf(today);
  const list = schoolYearChoices(years, shown);
  if (shown === 0 || (list.length < 2 && shown === now)) return null;
  return (
    <nav className={styles.years} aria-label="School year">
      <span className={styles.yearsLabel}>School year</span>
      <span className={styles.switch}>
        {list.map((y) => {
          const n = y.homework ?? y.sheets ?? 0;
          return (
            <Link key={y.year} href={href(y.year)} prefetch={false} className={y.year === shown ? styles.switchOn : undefined}
              aria-current={y.year === shown ? 'true' : undefined}
              title={`${n} homework${y.action ? `, ${y.action} needing action` : ''}`}>
              {schoolYearLabel(y.year)}{y.year === now ? ' (now)' : ''}
              {y.action ? <span className={styles.yearFlag}>{y.action}</span> : null}
            </Link>
          );
        })}
      </span>
    </nav>
  );
}

// Upcoming homework of one batch, from the Lesson Tracker: what was never sent for a completed lesson, what is
// expected in the next 14 days (or the next lessons, without dates, when the batch has no tracker), and the rest.
export function UpcomingList({ items, today, title = 'Upcoming homework', tracker }: {
  items: Upcoming[]; today: string; title?: string; tracker: boolean;
}) {
  const { notSent, soon, later } = splitUpcoming(items, today);
  const line = (u: Upcoming) => (
    <li key={u.lesson_homework_id}>
      <span>
        <b>{u.lesson_code} · Hw-{u.slot}</b> ({u.code}) <span className={styles.sub} style={{ display: 'inline' }}>{u.lesson}</span>
        {u.no_worksheet && <span className={styles.flag}>Worksheet missing</span>}
      </span>
      <span className={u.kind === 'not_sent' || u.behind ? styles.dangerText : undefined}>{upcomingLabel(u, today)}</span>
    </li>
  );
  if (items.length === 0) {
    return (
      <section className={styles.upcoming}>
        <h3>{title}</h3>
        <p className={styles.note}>Nothing to come: every Lesson library homework of this plan has been sent, or the batch&apos;s plan has no homework.</p>
      </section>
    );
  }
  return (
    <section className={styles.upcoming}>
      {notSent.length > 0 && (
        <>
          <h3>Not sent <span className={`${styles.badge} ${styles.overdue}`}>{notSent.length}</span></h3>
          <p className={styles.note} style={{ margin: '0 0 6px' }}>The lesson was marked completed but this homework wasn&apos;t ticked, so the class never got it. Give it from the batch page if it was missed.</p>
          <ul className={styles.items}>{notSent.map(line)}</ul>
        </>
      )}
      <h3>{title} <span className={`${styles.badge} ${styles.assigned}`}>{soon.length + later.length}</span></h3>
      <p className={styles.note} style={{ margin: '0 0 6px' }}>
        {tracker
          ? `Homework is sent when the teacher marks the lesson completed, so each is expected on its lesson's Lesson Tracker date. Next 14 days (to ${hwDate(addDays(today, 14))}):`
          : 'This batch has no Lesson Tracker yet, so there are no dates: the next lessons of the plan, in order.'}
      </p>
      {soon.length > 0 ? <ul className={styles.items}>{(tracker ? soon : soon.slice(0, 9)).map(line)}</ul>
        : <p className={styles.note}>Nothing expected in the next 14 days.</p>}
      {(later.length > 0 || (!tracker && soon.length > 9)) && (
        <details className={styles.more}>
          <summary>Show the rest of the year ({tracker ? later.length : soon.length - 9})</summary>
          <ul className={styles.items}>{(tracker ? later : soon.slice(9)).map(line)}</ul>
        </details>
      )}
    </section>
  );
}
