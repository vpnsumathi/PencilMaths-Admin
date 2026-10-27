import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { BarChart } from './BarChart';
import { loadHomework } from './homework';
import { NudgeButton } from './NudgeButton';
import styles from '../dashboard.module.css';

const SHOW = 8; // rows shown in each list before "+N more"

// The dashboard's Homework section: five numbers, the marking queue, students falling behind and
// each batch's on-time hand-in rate. Numbers are worked out in homework.ts.
// For a teacher, everything is already limited to their own batches, and there's no WhatsApp nudge
// (that needs a parent's phone number, which teachers can't see).
export async function HomeworkPanel({ teacher = false }: { teacher?: boolean }) {
  const h = await loadHomework(!teacher);
  const s = h.summary;

  return (
    <section id="homework" className={styles.homework} aria-labelledby="homework-title">
      <h2 id="homework-title" className={styles.sectionTitle}>Homework</h2>

      <div className={styles.hwKpis}>
        <a href="#to-mark" className={styles.kpi}>
          <span className={styles.kpiLabel}>To mark</span>
          <strong className={`${styles.kpiValue} ${s.toMark ? styles.down : ''}`}>{s.toMark}</strong>
          <span className={styles.kpiSub}>Handed in, not marked</span>
        </a>
        <a href="#falling-behind" className={styles.kpi}>
          <span className={styles.kpiLabel}>Overdue</span>
          <strong className={`${styles.kpiValue} ${s.overdue ? styles.down : ''}`}>{s.overdue}</strong>
          <span className={styles.kpiSub}>Not handed in after the due date</span>
        </a>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Handed in this week</span>
          <strong className={styles.kpiValue}>{s.handedThisWeek}</strong>
          <span className={styles.kpiSub}>Since Monday {formatDate(h.weekStart)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Marked this week</span>
          <strong className={styles.kpiValue}>{s.markedThisWeek}</strong>
          <span className={styles.kpiSub}>Sent back to students</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Marked, not sent</span>
          <strong className={styles.kpiValue}>{s.notSent}</strong>
          <span className={styles.kpiSub}>Saved with Save &amp; close; press Send on the batch page</span>
        </div>
      </div>

      <div className={styles.pair}>
        <article id="to-mark" className={styles.card}>
          <h2>Needs marking <span className={styles.count}>{h.toMark.length}</span></h2>
          <p className={styles.cardSub}>Oldest first · 🖊️ Mark opens the hand-in in a new tab</p>
          {h.toMark.length === 0 ? (
            <p className={styles.allClear}>Everything handed in is marked. 🎉</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.hwTable}>
                <thead>
                  <tr><th>Student</th><th>Batch</th><th>Homework</th><th>Waiting</th><th><span className={styles.srOnly}>Mark</span></th></tr>
                </thead>
                <tbody>
                  {h.toMark.slice(0, SHOW).map((m) => (
                    <tr key={m.key}>
                      <td>{m.student}</td>
                      <td>{m.batch}</td>
                      <td className={styles.hwTitle}>{m.homework}</td>
                      <td className={m.waiting >= 7 ? styles.down : ''}>{m.waiting === 0 ? 'Today' : `${m.waiting} day${m.waiting === 1 ? '' : 's'}`}</td>
                      <td><a href={m.href} target="_blank" rel="noreferrer" className={styles.markLink}>🖊️ Mark</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {h.toMark.length > SHOW && <p className={styles.more}>+{h.toMark.length - SHOW} more on the batch pages</p>}
        </article>

        <article id="falling-behind" className={styles.card}>
          <h2>Students falling behind <span className={styles.count}>{h.behind.length}</span></h2>
          <p className={styles.cardSub}>2 or more homeworks overdue in their current batches</p>
          {h.behind.length === 0 ? (
            <p className={styles.allClear}>No one is falling behind. 🎉</p>
          ) : (
            <ul className={styles.behind}>
              {h.behind.slice(0, SHOW).map((b) => (
                <li key={b.studentId}>
                  <div className={styles.behindRow}>
                    <Link href={`/students/${b.studentId}`} className={`${styles.attentionText} ${styles.behindName}`}>
                      <strong>{b.name}</strong>
                      <span>{b.batches} · <b className={styles.down}>{b.overdue} overdue</b> · oldest due {formatDate(b.oldestDue)}</span>
                    </Link>
                    {!teacher && <NudgeButton student={b} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {h.behind.length > SHOW && <p className={styles.more}>+{h.behind.length - SHOW} more</p>}
        </article>
      </div>

      <article className={styles.card} style={{ marginBottom: 16 }}>
        <h2>Hand-in rate by batch</h2>
        <p className={styles.cardSub}>Share of homework handed in on or before its due date · last 4 weeks · click a batch to open its homework</p>
        <BarChart bars={h.rate} orientation="rows" max={100} unit="%" ariaLabel="On-time hand-in rate per batch, last 4 weeks"
          emptyText="No open batches." />
      </article>
    </section>
  );
}
