import Link from 'next/link';
import ui from '@/components/ui.module.css';
import { daysBetween, schoolYearLabel, schoolYearOf, splitUpcoming, termName, type BatchData } from '@/lib/homework/tracker';
import { yearLabel } from '@/lib/options';
import att from '../attendance/attendance.module.css';
import { BatchGrid } from './BatchGrid';
import { SchoolYears, UpcomingList } from './parts';
import { trackerHref, type TrackerQuery } from './query';
import styles from './tracker.module.css';


// Batch view: one school year (guide 27): tiles for the batch, a tab per term, then students x homework (newest on
// the left), each cell a letter and colour, and each student's totals for the school year. A cell opens that
// homework in the Student view. The grid itself is BatchGrid (a client component, for page size).
export function BatchView({ q, data }: { q: TrackerQuery; data: BatchData }) {
  if (!data.batch) return <p className={ui.empty}>Batch not found.</p>;
  const b = data.batch;
  const term = data.term ?? 0;
  const up = splitUpcoming(data.upcoming, data.today);
  const oldest = data.tiles.oldest_submitted ? daysBetween(data.tiles.oldest_submitted, data.today) : null;
  // This school year (or every year): tiles count the students in the batch now, and Upcoming is shown.
  const live = data.year === 0 || data.year === schoolYearOf(data.today);
  const yearText = schoolYearLabel(data.year);

  return (
    <>
      <div className={styles.who}>
        <div>
          <h2>{b.code}{b.name ? ` · ${b.name}` : ''} · {b.subject} · {yearLabel(b.year_group)}{b.closed_on ? ' (closed)' : ''}</h2>
          <p>
            {b.teacher ?? 'No teacher'} · {live ? `${data.students.filter((s) => s.current).length} students now`
              : `${data.students.length} students in ${yearText}`}
            {' · '}{b.tracker ? 'Lesson Tracker set' : 'No Lesson Tracker yet'}
          </p>
        </div>
        <Link href={`/batches/${b.id}#homework`} className={ui.secondaryButton}>Open batch page</Link>
      </div>
      <SchoolYears years={data.years} shown={data.year} today={data.today} href={(sy) => trackerHref(q, { sy, term: null })} />

      <div className={att.tiles}>
        <div className={att.tile}><span>Assigned</span><b>{data.tiles.assigned}</b><small>not due yet</small></div>
        <div className={`${att.tile} ${data.tiles.overdue > 0 ? att.tileBad : ''}`}><span>Overdue</span><b>{data.tiles.overdue}</b></div>
        <div className={`${att.tile} ${oldest != null && oldest > 7 ? att.tileWarn : ''}`}>
          <span>Submitted</span><b>{data.tiles.submitted}</b>
          <small>{oldest == null ? 'waiting for correction' : `oldest waiting ${oldest} day${oldest === 1 ? '' : 's'}`}</small>
        </div>
        <div className={att.tile}><span>Corrected</span><b>{data.tiles.corrected}</b></div>
        <div className={`${att.tile} ${data.tiles.not_given > 0 ? att.tileWarn : ''}`}>
          <span>Not given</span><b>{data.tiles.not_given}</b><small>set while in the batch, never given</small>
        </div>
        {live && (
          <div className={`${att.tile} ${up.notSent.length > 0 ? att.tileWarn : ''}`}>
            <span>Upcoming</span><b>{up.soon.length}</b>
            <small>{b.tracker ? 'next 14 days' : 'next lessons, no dates'}{up.notSent.length ? ` · ${up.notSent.length} not sent` : ''}</small>
          </div>
        )}
      </div>
      <p className={att.caption}>
        {live ? 'Tiles count the students in the batch now, across this school year\'s homework.'
          : `Tiles count everyone who was in the batch in ${yearText}, across that year's homework.`}
      </p>

      {data.terms.length > 0 && (
        <nav className={att.tabs} aria-label="Terms">
          {data.terms.map((t) => (
            <Link key={t.term} href={trackerHref(q, { term: t.term })} className={`${att.tab} ${t.term === term ? att.tabOn : ''}`}
              aria-current={t.term === term ? 'page' : undefined}>
              {termName(t.term)} <span className={att.left}>{t.sheets}</span>
            </Link>
          ))}
        </nav>
      )}
      <section className={att.panel} style={data.terms.length ? undefined : { borderTop: '1px solid var(--border)', borderRadius: 18 }}>
        {data.students.length === 0 ? <p className={ui.empty}>No students in this batch yet.</p>
          : data.sheets.length === 0 ? <p className={ui.empty}>No homework {data.terms.length ? 'in this tab' : `set in ${yearText} yet`}.</p>
            : (
              <BatchGrid q={q} data={{ students: data.students, sheets: data.sheets, cells: data.cells }} yearText={yearText} />
            )}
        {live && <UpcomingList items={data.upcoming} today={data.today} tracker={b.tracker} />}
      </section>
    </>
  );
}
