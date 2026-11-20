'use client';
// The Student view's table (guide 26): one row per homework, newest first, with a heading per month. A client
// component for page size (guide 27): the page sends the rows' data once instead of the finished table twice
// (as HTML and as React's copy of it), about half the bytes for a full school year of about 350 homework.
import Link from 'next/link';
import { Fragment } from 'react';
import ui from '@/components/ui.module.css';
import {
  correctedAfter, hwDate, markText, monthOf, timing, waiting, type FileRef, type StudentRow,
} from '@/lib/homework/tracker';
import att from '../attendance/attendance.module.css';
import { StateBadge } from './parts';
import styles from './tracker.module.css';

// classCodes: each row's class code, shown for All their classes when there is more than one class.
export function StudentTable({ rows, today, student, batchLink, classCodes }: {
  rows: StudentRow[]; today: string; student: string; batchLink: boolean; classCodes: Record<string, string> | null;
}) {
  return (
    <div className={att.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Homework</th><th>Set · Due</th><th>Status</th><th>Submitted</th><th>Corrected</th><th>Mark</th><th>Files</th><th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <Fragment key={row.sheet_id}>
              {(i === 0 || monthOf(rows[i - 1].set_on) !== monthOf(row.set_on)) && (
                <tr className={styles.month}><td colSpan={8}>{monthOf(row.set_on)}</td></tr>
              )}
              <Row row={row} today={today} classCode={classCodes?.[row.batch_id] ?? null} student={student} batchLink={batchLink} />
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Files({ label, files }: { label: string; files: FileRef[] }) {
  if (files.length === 0) return null;
  return (
    <>
      {files.map((f, i) => (
        <a key={f.id} href={`/files/${f.id}`} target="_blank" rel="noreferrer" title={f.label ?? undefined}>
          {label}{files.length > 1 ? ` ${i + 1}` : ''}
        </a>
      ))}
    </>
  );
}

// One homework. id="hw-<sheet>" so a cell in the Batch view opens straight on it. Batch page per row only for
// All their classes (for one batch it is in the header).
function Row({ row, today, classCode, student, batchLink }: {
  row: StudentRow; today: string; classCode: string | null; student: string; batchLink: boolean;
}) {
  const tm = timing(row.in_on, row.due_on);
  const wait = waiting(row, today);
  const after = row.state === 'corrected' ? correctedAfter(row.received_on, row.marked_on) : null;
  return (
    <tr id={`hw-${row.sheet_id}`}>
      <td>
        <span className={styles.title}>{row.title}</span>
        {(row.lesson_code || classCode) && (
          <span className={styles.sub}>
            {classCode}{classCode && row.lesson_code ? ' · ' : ''}
            {row.lesson_code ? `${row.lesson_code} · Hw-${row.slot}${row.term ? ` · Term ${row.term}` : ''}` : ''}
          </span>
        )}
      </td>
      <td data-label="Set · Due">
        {hwDate(row.set_on)}
        <span className={styles.sub}>{row.due_on ? `Due ${hwDate(row.due_on)}` : 'No due date'}</span>
      </td>
      <td data-label="Status">
        <StateBadge state={row.state} />
        {wait && <span className={`${styles.sub} ${row.state === 'overdue' ? styles.dangerText : ''}`}>{wait}</span>}
        {row.draft && <span className={`${styles.sub} ${styles.lateText}`}>Corrected, not sent</span>}
      </td>
      <td data-label="Submitted">
        {row.in_on ? hwDate(row.in_on) : '—'}
        {tm && <span className={`${styles.sub} ${tm.late ? styles.lateText : ''}`}>{tm.label}</span>}
        {row.in_on && !row.received_on && <span className={styles.sub}>on paper</span>}
      </td>
      <td data-label="Corrected">
        {row.state === 'corrected' ? hwDate(row.marked_on) : '—'}
        {after && <span className={styles.sub}>{after}</span>}
      </td>
      <td data-label="Mark">{row.state === 'corrected' ? markText(row.mark, row.max_mark) : '—'}</td>
      <td data-label="Files">
        <span className={styles.files}>
          <Files label="Worksheet" files={row.sheets} />
          <Files label="Submitted" files={row.handed} />
          <Files label="Corrected sheet" files={row.corrected} />
          {row.sheets.length + row.handed.length + row.corrected.length === 0 && <span className={ui.muted}>—</span>}
        </span>
      </td>
      <td>
        <span className={styles.actions}>
          {row.state === 'submitted' && (
            <a href={`/batches/${row.batch_id}/mark?sheet=${row.sheet_id}&student=${student}`} target="_blank" rel="noreferrer"
              className={`${ui.button} ${styles.small}`}>🖊️ Mark</a>
          )}
          {batchLink && <Link href={`/batches/${row.batch_id}#homework`} prefetch={false} className={`${ui.button} ${styles.small}`}>Batch page</Link>}
        </span>
      </td>
    </tr>
  );
}
