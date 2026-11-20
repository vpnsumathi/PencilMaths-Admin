'use client';
// The Batch view's grid (guide 26): students x homework, newest on the left, and each student's rates for the
// school year. A client component for page size (guide 27): the page then sends the compact cells once (about
// 60 bytes each) instead of the finished table twice, as HTML and as React's copy of it (about 770 bytes a cell).
// A full term tab of 12 students has about 1,200 cells. Cells are plain links with a tooltip, without prefetch.
import Link from 'next/link';
import ui from '@/components/ui.module.css';
import {
  cellTitle, gridRows, hwDate, rates, rateTone, shortDate, STATE_LABEL, STATE_LETTER, type BatchData, type HwState,
} from '@/lib/homework/tracker';
import att from '../attendance/attendance.module.css';
import { trackerHref, type TrackerQuery } from './query';
import styles from './tracker.module.css';

const LEGEND: HwState[] = ['assigned', 'overdue', 'submitted', 'corrected', 'excused', 'not_given'];
const pctText = (v: number | null) => (v == null ? '—' : `${v}%`);

export function BatchGrid({ q, data, yearText }: {
  q: TrackerQuery; data: Pick<BatchData, 'students' | 'sheets' | 'cells'>; yearText: string;
}) {
  const rows = gridRows(data);
  return (
    <>
      <div className={att.gridWrap}>
        <table className={att.grid}>
          <thead>
            <tr>
              <th className={att.stickyCol} scope="col">Student</th>
              {data.sheets.map((s) => (
                <th key={s.id} scope="col" title={`${s.title} · set ${hwDate(s.set_on)}${s.due_on ? ` · due ${hwDate(s.due_on)}` : ''}`}>
                  <span className={styles.colHead}>
                    <b>{s.lesson_code ? `${s.lesson_code.replace(/^.*?-/, '')} Hw-${s.slot}` : s.title}</b>
                    <span>{shortDate(s.set_on)}</span>
                  </span>
                </th>
              ))}
              <th scope="col" className={styles.totalCol} title={`Submitted or Corrected, out of the homework done or past its due date (all of ${yearText})`}>Done</th>
              <th scope="col" title={`Submitted on or before the due date (all of ${yearText})`}>On time</th>
              <th scope="col" title={`Average mark of corrected homework with a maximum mark (all of ${yearText})`}>Mark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, cells }) => {
              const r = rates(student.totals);
              const studentQ = { ...q, student: student.id, show: 'all', scope: 'batch' as const };
              return (
                <tr key={student.id}>
                  <th scope="row" className={att.stickyCol}>
                    <Link href={trackerHref(studentQ, { show: null })} prefetch={false} className={ui.link}>{student.first_name} {student.last_name}</Link>
                    {!student.current && <span className={att.left}>Left</span>}
                  </th>
                  {cells.map((c, i) => (
                    // The row's heading (the student's name) tells a screen reader whose cell this is.
                    <td key={i}>
                      {c ? (
                        <Link href={trackerHref(studentQ, {}, `#hw-${data.sheets[i].id}`)} prefetch={false}
                          title={cellTitle(c, data.sheets[i])}
                          className={`${styles.cell} ${styles[c[2]]}${c[6] ? ` ${styles.draft}` : ''}`}>
                          {STATE_LETTER[c[2]]}
                        </Link>
                      ) : <span className={styles.none} title="Set before they joined, or after they left">·</span>}
                    </td>
                  ))}
                  <td className={`${styles.totalCol} ${rateTone(r.completed) ? styles[rateTone(r.completed)!] : ''}`}>{pctText(r.completed)}</td>
                  <td className={rateTone(r.onTime) ? styles[rateTone(r.onTime)!] : undefined}>{pctText(r.onTime)}</td>
                  <td>{pctText(r.mark)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={`${att.legend} ${styles.legend}`}>
        {LEGEND.map((s) => (
          <span key={s}><span className={`${styles.cell} ${styles[s]}`}>{STATE_LETTER[s]}</span>{STATE_LABEL[s]}</span>
        ))}
        <span><span className={`${styles.cell} ${styles.corrected} ${styles.draft}`}>C</span>Marked, not sent</span>
        <span><span className={styles.none}>·</span>&nbsp;Set before they joined</span>
      </div>
    </>
  );
}
