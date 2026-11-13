import Link from 'next/link';
import ui from '@/components/ui.module.css';
import { attendanceHref, markLetter, readFilters, setByText, type StudentAttendance } from '@/lib/attendanceReport';
import { markLabel } from '@/lib/classLink';
import { formatClock, formatDate } from '@/lib/format';
import styles from './attendanceCard.module.css';

// The periods the card can show. 12 weeks is the default (the same as the family sees in the student login).
export const CARD_PERIODS = { '4w': '4 weeks', '12w': '12 weeks', term: 'This term', all: 'All' } as const;
export type CardPeriod = keyof typeof CARD_PERIODS;
export const cardPeriod = (v: string | undefined): CardPeriod => (v && Object.hasOwn(CARD_PERIODS, v) ? (v as CardPeriod) : '12w');

const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

type Props = {
  studentId: string;
  period: CardPeriod;
  data: StudentAttendance | null;
  notReady?: boolean;
  note?: string; // "your classes" for a teacher
};

// A student's attendance in one card that stays the same size however many classes they have had: the attended %
// and counts, warnings, then one line per class with a small square per class day (newest on the right; the latest
// 60 per class). Pointing at a square shows the date, the mark and who set it; clicking it opens that day's register.
// Everything else is on the Attendance page, which the footer links to.
export function AttendanceCard({ studentId, period, data, notReady, note }: Props) {
  if (notReady) {
    return (
      <section className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
        <h2>Attendance</h2>
        <p className={ui.empty}>The database is not ready for this yet: run 20261113000001_attendance_report.sql in Supabase first.</p>
      </section>
    );
  }
  if (!data) return null;

  const attended = data.present + data.late;
  const rate = data.total > 0 ? Math.round((100 * attended) / data.total) : null;
  const all = attendanceHref(readFilters({}), { tab: 'all', range: period, student: studentId });
  const unconfirmed = attendanceHref(readFilters({}), { tab: 'all', range: period, student: studentId, show: 'checked_in' });

  return (
    <section id="attendance" className={`${ui.card} ${styles.card}`}>
      <div className={styles.head}>
        <h2>Attendance{note ? <span className={styles.note}> · {note}</span> : null}</h2>
        <nav className={styles.periods} aria-label="Period">
          {(Object.keys(CARD_PERIODS) as CardPeriod[]).map((p) => (
            <Link key={p} href={`?att=${p}#attendance`} scroll={false} replace
              className={`${styles.period} ${p === period ? styles.periodOn : ''}`} aria-current={p === period ? 'true' : undefined}>
              {CARD_PERIODS[p]}
            </Link>
          ))}
        </nav>
      </div>

      {data.total === 0 ? (
        <p className={ui.empty} style={{ margin: '12px 0' }}>No classes in this period.</p>
      ) : (
        <div className={styles.summary}>
          <div className={styles.big}>
            <b className={rate !== null && rate < 80 ? styles.bad : undefined}>{rate}%</b>
            <small>attended · {attended} of {data.total} {data.total === 1 ? 'class' : 'classes'}</small>
          </div>
          <div className={styles.counts}>
            <span className={styles.count}><i className={styles.dotP} />{data.present} present</span>
            <span className={styles.count}><i className={styles.dotL} />{data.late} late</span>
            <span className={styles.count}><i className={styles.dotA} />{data.absent} absent</span>
            {data.checked_in > 0 && <span className={styles.count}><i className={styles.dotC} />{data.checked_in} checked in, not confirmed</span>}
          </div>
        </div>
      )}

      {(data.streaks.length > 0 || data.checked_in > 0) && (
        <div className={styles.flags}>
          {data.streaks.map((s) => (
            <p key={s.batch_code} className={styles.flagWarn}>
              ⚠ Absent {s.dates.length} classes in a row in {s.subject} · {s.batch_code} ({[...s.dates].reverse().map(short).join(', ')})
            </p>
          ))}
          {data.checked_in > 0 && (
            <Link href={unconfirmed} className={styles.flagInfo}>
              {data.checked_in} portal {data.checked_in === 1 ? 'check-in is' : 'check-ins are'} not confirmed yet →
            </Link>
          )}
        </div>
      )}

      {data.classes.length > 0 && (
        <ul className={styles.classes}>
          {data.classes.map((c) => {
            const crate = c.total > 0 ? Math.round((100 * c.attended) / c.total) : null;
            return (
              <li key={c.batch_id} className={styles.cls}>
                <div className={styles.name}>
                  <Link href={`/batches/${c.batch_id}`} className={ui.link}>{c.subject} · {c.batch_code}</Link>
                  <span>{[c.times, c.teacher].filter(Boolean).join(' · ') || '—'}{c.in_batch ? '' : ' · left this batch'}</span>
                </div>
                <div className={styles.stripWrap}>
                  {c.marks.length === 0 ? <span className={styles.none}>No classes in this period</span> : (
                    <div className={styles.track}>
                      <div className={styles.strip}>
                        {c.earlier > 0 && <span className={styles.earlier} title={`${c.earlier} earlier classes are on the Attendance page`}>+{c.earlier}</span>}
                        {c.marks.map((m) => {
                          const tip = [
                            `${weekday(m.class_date)} ${formatDate(m.class_date)}`,
                            markLabel(m.status, m.source),
                            m.joined_at ? `checked in ${formatClock(m.joined_at)}` : '',
                            setByText(m.source, m.by),
                            m.corrected ? `corrected${m.reason ? `: "${m.reason}"` : ''}` : '',
                          ].filter(Boolean).join(' · ');
                          return (
                            <Link key={m.class_date} href={`/batches/${c.batch_id}?class_date=${m.class_date}#attendance`} title={tip} aria-label={tip}
                              className={`${styles.sq} ${styles[`sq${markLetter(m)}`]} ${m.corrected ? styles.fixed : ''}`} />
                          );
                        })}
                      </div>
                      <div className={styles.axis}>
                        <span>{short(c.marks[0].class_date)}</span>
                        {c.marks.length > 1 && <span>{short(c.marks[c.marks.length - 1].class_date)}</span>}
                      </div>
                    </div>
                  )}
                </div>
                <div className={`${styles.rate} ${crate !== null && crate < 80 ? styles.bad : styles.ok}`}>
                  {c.total > 0 ? `${c.attended}/${c.total}` : '—'}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className={styles.legend}>
        <span><i className={`${styles.sq} ${styles.sqP}`} />Present</span>
        <span><i className={`${styles.sq} ${styles.sqL}`} />Late</span>
        <span><i className={`${styles.sq} ${styles.sqA}`} />Absent</span>
        <span><i className={`${styles.sq} ${styles.sqC}`} />Checked in, not confirmed</span>
        <span><i className={`${styles.sq} ${styles.sqP} ${styles.fixed}`} />Corrected</span>
        <span>Point at a square for the details, click it to open that day&apos;s register</span>
      </p>

      <div className={styles.foot}>
        <span className={ui.muted}>
          {data.last
            ? <>Last class: {weekday(data.last.class_date)} {formatDate(data.last.class_date)}, {data.last.subject} · {markLabel(data.last.status, data.last.source)}
                {data.last.joined_at ? ` ${formatClock(data.last.joined_at)}` : ''}</>
            : 'No classes yet.'}
        </span>
        {data.total > 0 && <Link href={all} className={styles.more}>See all {data.total} {data.total === 1 ? 'class' : 'classes'} in Attendance →</Link>}
      </div>
    </section>
  );
}
