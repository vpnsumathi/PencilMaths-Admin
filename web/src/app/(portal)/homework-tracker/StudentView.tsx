import Link from 'next/link';
import ui from '@/components/ui.module.css';
import {
  defaultShow, filterRows, hwDate, needsAction, rates, rateTone, schoolYearOf, SHOW, splitUpcoming,
  type Show, type StudentClass, type StudentData,
} from '@/lib/homework/tracker';
import { yearLabel } from '@/lib/options';
import att from '../attendance/attendance.module.css';
import { SchoolYears, UpcomingList } from './parts';
import { trackerHref, type TrackerQuery } from './query';
import { StudentTable } from './StudentTable';
import styles from './tracker.module.css';

type Student = { code: string; first_name: string; last_name: string; year_group: number; status: string };

const pctText = (v: number | null) => (v == null ? '—' : `${v}%`);

// In the school year shown (0 = every year): the class overlaps 1 September to 31 August.
const inYear = (c: StudentClass, year: number) =>
  year === 0 || ((!c.from_on || c.from_on < `${year + 1}-09-01`) && (!c.to_on || c.to_on >= `${year}-09-01`));

// Student view, one school year (guide 27): who and which classes, tiles and rates, filter chips, then every
// homework newest first with a heading per month, and (this school year) the homework still to come.
// teacher: the database only returns the student's classes and homework in the teacher's own batches.
export function StudentView({ q, data, student, teacher = false }: { q: TrackerQuery; data: StudentData; student: Student; teacher?: boolean }) {
  const live = data.year === 0 || data.year === schoolYearOf(data.today);
  const shows = (Object.keys(SHOW) as Show[]).filter((s) => live || s !== 'upcoming');
  const show: Show = q.show && (shows as string[]).includes(q.show) ? (q.show as Show) : defaultShow(data.rows);
  const rows = filterRows(data.rows, show);
  const t = data.totals;
  const r = rates(t);
  const classes = new Map(data.classes.map((c) => [c.batch_id, c]));
  const current = data.classes.filter((c) => c.current);
  const upcomingCount = current.reduce((n, c) => {
    const u = splitUpcoming(data.upcoming[c.batch_id] ?? [], data.today);
    return n + u.soon.length + u.later.length;
  }, 0);
  const counts: Record<Show, number> = {
    action: data.rows.filter(needsAction).length,
    all: data.rows.length,
    assigned: t.assigned + t.overdue,
    submitted: t.submitted,
    corrected: t.corrected,
    excused: t.excused,
    not_given: t.not_given,
    upcoming: upcomingCount,
  };
  const chosen = q.batch ? classes.get(q.batch) : null;
  const showClass = q.scope === 'all' && data.classes.length > 1;
  // The header lists the classes of the school year shown (all of them if none overlap it).
  const yearClasses = data.classes.some((c) => inYear(c, data.year)) ? data.classes.filter((c) => inYear(c, data.year)) : data.classes;

  return (
    <>
      <div className={styles.who}>
        <div>
          <h2>{student.first_name} {student.last_name}</h2>
          <p>
            {student.code} · {yearLabel(student.year_group)}
            {data.classes.length === 0 ? (teacher ? ' · not in your batches now' : ' · not in any class') : ` · ${yearClasses.map((c) =>
              `${c.code} ${c.subject}${c.teacher ? ` (${c.teacher})` : ''}${c.current ? '' : c.to_on ? `, left ${hwDate(c.to_on)}` : ', not in it now'}`).join(' · ')}`}
          </p>
          {chosen?.from_on && q.scope === 'batch' && (
            <p>In {chosen.code} from {hwDate(chosen.from_on)}{chosen.to_on ? ` to ${hwDate(chosen.to_on)}` : ''}</p>
          )}
        </div>
        <div className={ui.formActions}>
          {q.batch && (
            <nav className={styles.switch} aria-label="Which homework">
              <Link href={trackerHref(q, { scope: 'batch' })} className={q.scope === 'batch' ? styles.switchOn : undefined}
                aria-current={q.scope === 'batch' ? 'true' : undefined}>This batch</Link>
              <Link href={trackerHref(q, { scope: 'all' })} className={q.scope === 'all' ? styles.switchOn : undefined}
                aria-current={q.scope === 'all' ? 'true' : undefined}>{teacher ? 'All your batches' : 'All their classes'}</Link>
            </nav>
          )}
          {q.batch && q.scope === 'batch' && <Link href={`/batches/${q.batch}#homework`} prefetch={false} className={ui.button}>Batch page</Link>}
          <Link href={`/students/${q.student}`} className={ui.button}>Student page</Link>
        </div>
      </div>
      <SchoolYears years={data.years} shown={data.year} today={data.today} href={(sy) => trackerHref(q, { sy, show: null })} />

      <div className={att.tiles}>
        <Tile q={q} show="assigned" label="Assigned" value={t.assigned} note="not due yet" />
        <Tile q={q} show="assigned" label="Overdue" value={t.overdue} tone={t.overdue > 0 ? att.tileBad : ''} />
        <Tile q={q} show="submitted" label="Submitted" value={t.submitted} note="waiting for correction" />
        <Tile q={q} show="corrected" label="Corrected" value={t.corrected} />
        <Tile q={q} show="excused" label="Excused" value={t.excused} />
        <Tile q={q} show="not_given" label="Not given" value={t.not_given} tone={t.not_given > 0 ? att.tileWarn : ''} note="set while in the batch" />
        {live && <Tile q={q} show="upcoming" label="Upcoming" value={upcomingCount} note="from the Lesson Tracker" />}
      </div>
      <p className={styles.rates}>
        <span>Completed <b className={toneClass(r.completed)}>{pctText(r.completed)}</b> <small>({t.done} of {t.due})</small></span>
        <span>On time <b className={toneClass(r.onTime)}>{pctText(r.onTime)}</b> <small>({t.on_time} of {t.timed})</small></span>
        <span>Average mark <b>{pctText(r.mark)}</b></span>
        <span>Corrected after <b>{t.correction_days == null ? '—' : `${t.correction_days} days`}</b> <small>on average</small></span>
      </p>

      <nav className={att.tabs} aria-label="Show">
        {shows.map((s) => (
          <Link key={s} href={trackerHref(q, { show: s })} className={`${att.tab} ${s === show ? att.tabOn : ''}`}
            aria-current={s === show ? 'page' : undefined}>
            {SHOW[s]}
            <span className={s === 'action' && counts.action > 0 ? att.count : att.left}>{counts[s]}</span>
          </Link>
        ))}
      </nav>
      <section className={att.panel}>
        {show === 'upcoming' ? (
          current.length === 0 ? <p className={ui.empty}>Not in a class now, so nothing is coming.</p>
            : current.map((c) => (
              <UpcomingList key={c.batch_id} items={data.upcoming[c.batch_id] ?? []} today={data.today}
                tracker={(data.upcoming[c.batch_id] ?? []).some((u) => u.planned_on)}
                title={current.length > 1 ? `Upcoming in ${c.code} ${c.subject}` : 'Upcoming homework'} />
            ))
        ) : rows.length === 0 ? (
          <p className={ui.empty}>{show === 'action' ? 'Nothing needs action.' : 'No homework here.'}</p>
        ) : (
          <StudentTable rows={rows} today={data.today} student={q.student!} batchLink={q.scope === 'all'}
            classCodes={showClass ? Object.fromEntries(data.classes.map((c) => [c.batch_id, c.code])) : null} />
        )}
        {data.before_joining > 0 && show !== 'upcoming' && (
          <p className={styles.note}>
            {data.before_joining} homework {data.before_joining === 1 ? 'was' : 'were'} set before {student.first_name} joined
            {q.scope === 'all' ? ' a class' : ' this batch'} (or after they left), so {data.before_joining === 1 ? 'it isn\'t' : 'they aren\'t'} counted.
            To give one, use <b>Give homework</b> on the batch page.
          </p>
        )}
        {show !== 'upcoming' && current.length > 0 && (
          current.map((c) => {
            const items = data.upcoming[c.batch_id] ?? [];
            return items.length ? (
              <UpcomingList key={c.batch_id} items={items} today={data.today} tracker={items.some((u) => u.planned_on)}
                title={current.length > 1 ? `Upcoming in ${c.code} ${c.subject}` : 'Upcoming homework'} />
            ) : null;
          })
        )}
      </section>
    </>
  );
}

function toneClass(v: number | null) {
  const t = rateTone(v);
  return t ? styles[t] : undefined;
}

function Tile({ q, show, label, value, note, tone = '' }: { q: TrackerQuery; show: Show; label: string; value: number; note?: string; tone?: string }) {
  return (
    <Link href={trackerHref(q, { show })} className={`${att.tile} ${tone}`}>
      <span>{label}</span><b>{value}</b>{note && <small>{note}</small>}
    </Link>
  );
}
