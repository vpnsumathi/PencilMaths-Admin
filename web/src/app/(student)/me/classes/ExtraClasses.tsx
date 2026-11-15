import { termStart } from '@/lib/attendanceReport';
import { markLabel } from '@/lib/classLink';
import { dayLabel, KIND_LABEL, shortWhen, ukClock, ukDate, ukDay, type MyExtra, type MyExtras } from '@/lib/extraClasses';
import { todayInUk } from '@/lib/options';
import styles from '../../student.module.css';
import x from './extraClasses.module.css';
import { JoinExtraButton } from './JoinExtraButton';

// My classes › Extra classes (guide 24): what's coming and what has been taken. Families never see internal notes,
// who booked it or the office's reasons. Extra classes have their own attendance line, so the weekly figure above
// doesn't change.
export function ExtraClasses({ data }: { data: MyExtras }) {
  if (data.upcoming.length === 0 && data.taken.length === 0) return null;
  const term = termStart(todayInUk());
  const takenThisTerm = data.taken.filter((t) => !t.cancelled && ukDate(t.starts_at) >= term).length;
  return (
    <section className={x.section} aria-labelledby="extra-title">
      <div className={x.head}>
        <h2 id="extra-title">Extra classes</h2>
        <span className={styles.muted}>
          {data.total > 0 ? `Extra classes: attended ${data.attended} of ${data.total}` : 'No extra classes marked yet'}
          {takenThisTerm > 0 ? ` · ${takenThisTerm} taken this term` : ''}
        </span>
      </div>
      <p className={x.line}>One-off classes, such as a catch-up. They don&apos;t change the attendance of your weekly classes.</p>

      <h2 style={{ marginTop: 20 }}>Upcoming</h2>
      {data.upcoming.length === 0 ? <p className={x.empty}>No extra classes coming up.</p> : (
        <div className={x.list}>
          {data.upcoming.map((c) => <UpcomingCard key={c.id} c={c} window={data.window} />)}
        </div>
      )}

      <h2>Taken</h2>
      {data.taken.length === 0 ? <p className={x.empty}>None yet.</p> : (
        <ul className={x.taken}>
          {data.taken.map((c) => (
            <li key={c.id}>
              <span>
                <b>{ukDay(c.starts_at)}</b> · {c.subject} · {KIND_LABEL[c.kind]}
                <small>{ukClock(c.starts_at)}–{ukClock(c.ends_at)} with {c.teacher}</small>
              </span>
              <span className={`${styles.markChip} ${c.cancelled || !c.mark ? '' : styles[c.mark_source === 'link' ? 'chipChecked' : `chip_${c.mark}`]}`}>
                {c.cancelled ? 'Cancelled' : c.mark ? markLabel(c.mark, c.mark_source) : 'Not marked yet'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// One upcoming extra class, with "I'm here, open class" during join time.
export function UpcomingCard({ c, window, back = '/me/classes' }: { c: MyExtra; window: MyExtras['window']; back?: '/me' | '/me/classes' }) {
  const started = new Date(c.starts_at).getTime() <= Date.now();
  return (
    <article className={`${styles.classCard} ${c.cancelled ? x.cancelledCard : ''}`}>
      <header className={styles.classHead}>
        <div>
          <p className={styles.subject}>{c.subject} · <span className={x.badge}>Extra</span></p>
          <h3 className={styles.classTitle} style={{ fontSize: 20 }}>{KIND_LABEL[c.kind]}</h3>
          <p className={styles.muted}>Teacher: <strong className={styles.strong}>{c.teacher}</strong></p>
          {c.moved_from && <p className={x.moved}>Moved from {shortWhen(c.moved_from)}</p>}
        </div>
        <div className={styles.pills}>
          {c.cancelled
            ? <p className={x.cancelPill}>Cancelled</p>
            : c.in_window && <p className={`${styles.nextPill} ${styles.nowPill}`}>{started ? `Class now · started ${ukClock(c.starts_at)}` : `Starting soon · ${ukClock(c.starts_at)}`}</p>}
          <p className={`${styles.nextPill} ${x.when}`}>{dayLabel(c.starts_at)}–{ukClock(c.ends_at)} · {c.length_minutes} min</p>
        </div>
      </header>
      {!c.cancelled && (
        <div className={`${styles.joinPanel} ${c.in_window ? styles.joinPanelNow : ''}`}>
          {c.in_window && <JoinExtraButton id={c.id} back={back} />}
          <div className={styles.joinText}>
            <p className={styles.checkInTimes}><strong>Check in:</strong> {ukDay(c.starts_at)} {ukClock(c.opens_at)}–{ukClock(c.ends_at)}</p>
            <p className={styles.muted}>
              {c.mark_source === 'link' ? `You're checked in (${markLabel(c.mark ?? 'present', 'link').toLowerCase()}). Press again to reopen the class. `
                : c.in_window ? '' : 'The button appears here when it is time to join. '}
              Late after {window.late_minutes} minutes.
            </p>
          </div>
        </div>
      )}
      {c.note && <p className={x.note}><strong>From Pencil Maths:</strong> {c.note}</p>}
    </article>
  );
}
