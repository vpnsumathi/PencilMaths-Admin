import Link from 'next/link';
import { FocusMessage } from '@/components/FocusMessage';
import { attendanceLine, currentClass, markLabel, shiftTime } from '@/lib/classLink';
import { formatDate, formatTime } from '@/lib/format';
import { WEEKDAYS, yearLabel } from '@/lib/options';
import styles from '../../student.module.css';
import { type Dashboard, nextClass } from '../dashboard';
import { getMyDashboard } from '../myDashboard';
import { JoinClassButton } from './JoinClassButton';

export const metadata = { title: 'My classes' };

// "2026-11-10" → "10 Nov"
const shortDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// One card per class, full width: who and when, the class button with its check-in times, the class details,
// then attendance and homework side by side (stacked on phones).
export default async function MyClasses({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  // The same answer the layout already asked for (cached), so no second call.
  const me = (await getMyDashboard()) as Dashboard; // the layout has already checked this is a student

  return (
    <>
      <h1>My classes</h1>
      <p className={styles.muted}>Your classes at Pencil Maths, with your teacher and class times.</p>
      {error && <FocusMessage key={`error${Date.now()}`} className={styles.errorMsg} role="alert">{error}</FocusMessage>}

      {me.classes.length === 0 && <p className={styles.muted} style={{ marginTop: 16 }}>You are not in any classes yet.</p>}
      <div className={styles.classList}>
        {me.classes.map((c) => {
          const next = nextClass(c.times);
          const w = me.class_window;
          const now = currentClass(c.times, w);
          const a = c.attendance;
          return (
            <article key={c.subject} className={styles.classCard} aria-labelledby={`class-${c.subject}`}>
              {/* Who and when */}
              <header className={styles.classHead}>
                <div>
                  <p className={styles.subject}>{c.subject}</p>
                  <h2 id={`class-${c.subject}`} className={styles.classTitle}>
                    {c.batch_code ? `Class ${c.batch_code}` : 'Class not chosen yet'}
                  </h2>
                  <p className={styles.muted}>Teacher: <strong className={styles.strong}>{c.teacher ?? 'To be confirmed'}</strong></p>
                </div>
                <div className={styles.pills}>
                  {now && <p className={`${styles.nextPill} ${styles.nowPill}`}>{now.label}</p>}
                  <p className={styles.nextPill}>{next ? `Next: ${next.label}` : 'Times to be confirmed'}</p>
                </div>
              </header>

              {/* Open the class, and when pressing it checks the student in */}
              {c.batch_id && c.has_class_link && (
                <div className={`${styles.joinPanel} ${now ? styles.joinPanelNow : ''}`}>
                  <JoinClassButton batchId={c.batch_id} checkIn={now !== null} />
                  <div className={styles.joinText}>
                    {w && c.times.length > 0 ? (
                      <>
                        <p className={styles.checkInTimes}>
                          <strong>Check in:</strong>{' '}
                          {c.times.map((t) => `${WEEKDAYS[t.weekday].slice(0, 3)} ${shiftTime(t.start_time, -w.before_minutes)}–${shiftTime(t.start_time, w.after_minutes)}`).join(' · ')}
                        </p>
                        <p className={styles.muted}>Late after {w.late_minutes} minutes. At other times the button just opens your class.</p>
                      </>
                    ) : (
                      <p className={styles.muted}>Opens your Google Classroom. Check-in starts once your class times are set.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Class details */}
              <dl className={styles.facts}>
                <div><dt>Class times</dt><dd>{c.times.length === 0 ? 'To be confirmed' : c.times.map((t) => `${WEEKDAYS[t.weekday]} ${formatTime(t.start_time)}`).join(', ')}</dd></div>
                <div><dt>Topic now</dt><dd>{c.topic ?? 'To be confirmed'}</dd></div>
                {c.class_year && <div><dt>Class year</dt><dd>{yearLabel(c.class_year)}</dd></div>}
                <div><dt>Joined</dt><dd>{formatDate(c.started_on)}</dd></div>
              </dl>

              {/* Attendance and homework */}
              <div className={styles.stats}>
                {a && (
                  <section className={styles.stat} aria-label="Attendance">
                    <p className={styles.statLabel}>Attendance · last 12 weeks</p>
                    {a.total === 0 ? (
                      <p className={styles.statSub}>No classes recorded yet.</p>
                    ) : (
                      <>
                        <p className={styles.statBig}>{a.present + a.late}<span className={styles.statOf}> of {a.total} attended</span></p>
                        <p className={styles.statSub}>{attendanceLine(a).split(' · ').slice(1).join(' · ') || 'Never late or absent'}</p>
                      </>
                    )}
                    {a.recent.length > 0 && (
                      <ul className={styles.markChips} aria-label="Latest classes">
                        {a.recent.map((r) => (
                          <li key={r.class_date} className={`${styles.markChip} ${styles[r.source === 'link' ? 'chipChecked' : `chip_${r.status}`]}`}>
                            {shortDate(r.class_date)} · {markLabel(r.status, r.source)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
                <Link href="/me/homework" className={`${styles.stat} ${styles.statLinkable}`}>
                  <span className={styles.statLabel}>Homework</span>
                  <span className={`${styles.statBig} ${c.to_do > 0 ? styles.overdue : styles.marked}`}>
                    {c.to_do > 0 ? c.to_do : '✓'}<span className={styles.statOf}>{c.to_do > 0 ? ' to hand in' : ' all handed in'}</span>
                  </span>
                  <span className={styles.statSub}>{c.marked > 0 ? `${c.marked} marked` : 'Nothing marked yet'}</span>
                  <span className={styles.tileLink}>Open My homework →</span>
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
