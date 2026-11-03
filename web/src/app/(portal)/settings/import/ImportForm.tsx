'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { FocusMessage } from '@/components/FocusMessage';
import ui from '@/components/ui.module.css';
import { bulkImport, makeDriveFolders, type ImportReport, type ImportState } from './actions';
import styles from './import.module.css';

const BADGE = { new: ui.badgeOk, change: ui.badgeBrand, same: ui.badgeMuted };

function batchWhat(b: ImportReport['batches'][number]) {
  if (b.action === 'new') return { text: 'New batch', tone: BADGE.new };
  const changes = b.changes.map((c) => (c === 'named' ? 'named (was made by hand)' : c));
  return changes.length ? { text: `Update: ${changes.join(', ')}`, tone: BADGE.change } : { text: 'Already there', tone: BADGE.same };
}

function studentWhat(s: ImportReport['students'][number]) {
  if (s.place === 'moved') return { text: `Moved from ${s.from}`, tone: BADGE.change };
  if (s.place === 'unchanged') return { text: 'Already in this batch', tone: BADGE.same };
  return s.status === 'new' ? { text: 'New student', tone: BADGE.new } : { text: 'Existing student, added to batch', tone: BADGE.change };
}

// Counts for the summary line.
function summary(r: ImportReport) {
  const count = <T,>(list: T[], test: (x: T) => boolean) => list.filter(test).length;
  return [
    `${count(r.students, (s) => s.status === 'new')} new students`,
    `${count(r.students, (s) => s.status === 'existing')} already in the portal`,
    `${count(r.students, (s) => s.place === 'moved')} moved batch`,
    `${count(r.batches, (b) => b.action === 'new')} new batches`,
    `${count(r.batches, (b) => b.action === 'existing' && b.changes.length > 0)} batches updated`,
    `${count(r.teachers, (t) => t.action === 'new')} new teachers`,
  ].join(' · ');
}

type Drive = { done: number; failed: number; total: number; running: boolean };

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(bulkImport, {});
  const [changedAt, setChangedAt] = useState(0); // when a different file was chosen
  const [drive, setDrive] = useState<Drive | null>(null);
  const report = state.report;
  const fresh = !!state.at && state.at > changedAt; // the result belongs to the file now chosen

  // After a real import, make the new students' Google Drive folders, a few at a time.
  useEffect(() => {
    const ids = report?.saved ? report.new_student_ids : [];
    if (!ids.length) { setDrive(null); return; }
    let stopped = false;
    (async () => {
      const progress: Drive = { done: 0, failed: 0, total: ids.length, running: true };
      setDrive({ ...progress });
      for (let i = 0; i < ids.length && !stopped; i += 5) {
        try {
          const r = await makeDriveFolders(ids.slice(i, i + 5));
          progress.done += r.made;
          progress.failed += r.failed;
        } catch {
          progress.failed += Math.min(5, ids.length - i);
        }
        if (!stopped) setDrive({ ...progress });
      }
      if (!stopped) setDrive({ ...progress, running: false });
    })();
    return () => { stopped = true; };
  }, [report]);

  const checked = fresh && report?.dry_run && report.ok;

  // Sent by hand rather than with <form action>, which would empty the file box after "Check file"
  // (the same file is sent again by "Import"). The button pressed (check or import) goes with it.
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(form));
  }

  return (
    <form onSubmit={submit} className={ui.form}>
      <section className={ui.card}>
        <h2>1. Choose the spreadsheet</h2>
        <p className={ui.hint}>
          One row per student, with these headings in the first row (any order). An optional <strong>Subject</strong> column
          is allowed; without it every batch is Maths.
        </p>
        <div className={styles.example}>
          <table className={ui.table}>
            <thead><tr><th>Year</th><th>Batch</th><th>Student Name</th><th>Teacher Name</th><th>Batch Time</th></tr></thead>
            <tbody>
              <tr><td>Year 2</td><td>Batch 1</td><td>Nevaeh Mariam</td><td>Agnes</td><td>Monday: 4.30 to 5.30 p.m.<br />Wednesday: 4.30 to 5.30 p.m.</td></tr>
            </tbody>
          </table>
        </div>
        <ul className={styles.rules}>
          <li>Batch time: one day per line (or separated by <code>;</code>). Only the start time is kept.</li>
          <li>Nothing is added twice. Teachers, batches and students already in the portal are matched by name
            (a batch by its year and name, e.g. Year 2 Batch 1), so you can import the same file again after changing it.</li>
          <li>A student already in another batch of the subject is moved to the batch in the file. Students in a batch
            who are not in the file stay where they are.</li>
          <li>New students get a Google Drive folder and a hand-in link, as when they are added by hand.</li>
        </ul>
        <div className={ui.formActions}>
          <input type="file" name="file" accept=".xlsx,.csv" required className={ui.input} aria-label="Spreadsheet"
            disabled={pending} onChange={() => setChangedAt(Date.now())} />
          <button name="mode" value="check" className={checked ? ui.button : ui.primaryButton} disabled={pending}>
            {pending ? 'Working…' : 'Check file'}
          </button>
        </div>
      </section>

      {fresh && state.problem && (
        <FocusMessage className={`${ui.alert} ${ui.alertError}`} role="alert" signal={state.at}>{state.problem}</FocusMessage>
      )}

      {fresh && report && (
        <section className={ui.card}>
          <h2>{report.saved ? '✅ Imported' : report.ok ? '2. Check the result, then import' : 'Nothing can be imported yet'}</h2>

          {report.saved && (
            <FocusMessage className={`${ui.alert} ${ui.alertOk}`} role="status" signal={state.at}>
              {state.fileName}: {state.rows} rows imported. {summary(report)}.
            </FocusMessage>
          )}
          {report.saved && drive && (
            <p className={drive.failed ? styles.warn : ui.muted} role="status">
              {drive.running
                ? `Making Google Drive folders… ${drive.done + drive.failed} of ${drive.total}`
                : drive.failed
                  ? `Drive folders made for ${drive.done} of ${drive.total} new students. For the others, open the student and press "Create Drive folder" (check the connection on the Google Drive page).`
                  : `Google Drive folders made for all ${drive.total} new students.`}
            </p>
          )}

          {!report.ok && (
            <FocusMessage as="div" className={`${ui.alert} ${ui.alertError}`} role="alert" signal={state.at}>
              <strong>Fix these in the spreadsheet, then check it again. Nothing was saved.</strong>
              <ul className={styles.messages}>
                {report.errors.map((e, i) => <li key={i}>{e.row ? `Row ${e.row}: ` : ''}{e.message}</li>)}
              </ul>
            </FocusMessage>
          )}

          {report.ok && !report.saved && (
            <FocusMessage as="div" className={`${ui.alert} ${ui.alertOk}`} role="status" signal={state.at}>
              {state.fileName}: {state.rows} rows read, no problems. Nothing is saved yet. {summary(report)}.
            </FocusMessage>
          )}

          {report.warnings.length > 0 && (
            <div className={styles.warn}>
              <strong>Good to know</strong>
              <ul className={styles.messages}>
                {report.warnings.map((w, i) => <li key={i}>{w.row ? `Row ${w.row}: ` : ''}{w.message}</li>)}
              </ul>
            </div>
          )}

          {report.ok && (
            <>
              <h3 className={styles.subhead}>Teachers</h3>
              <ul className={ui.list}>
                {report.teachers.map((t) => (
                  <li key={t.name}>
                    <span>{t.name}</span>
                    <span className={`${ui.badge} ${t.action === 'new' ? BADGE.new : BADGE.same}`}>
                      {t.action === 'new' ? 'New teacher' : `Existing: ${t.matched} (${t.code})`}
                    </span>
                  </li>
                ))}
              </ul>

              <h3 className={styles.subhead}>Batches</h3>
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead><tr><th>Batch</th><th>Teacher</th><th>Class times</th><th></th></tr></thead>
                  <tbody>
                    {report.batches.map((b) => {
                      const what = batchWhat(b);
                      return (
                        <tr key={b.batch}>
                          <td>{b.batch}</td><td>{b.teacher}</td><td>{b.times}</td>
                          <td><span className={`${ui.badge} ${what.tone}`}>{what.text}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <h3 className={styles.subhead}>Students</h3>
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead><tr><th>Row</th><th>Student</th><th>Batch</th><th></th></tr></thead>
                  <tbody>
                    {report.students.map((s) => {
                      const what = studentWhat(s);
                      return (
                        <tr key={s.row}>
                          <td>{s.row}</td><td>{s.student}</td><td>{s.batch}</td>
                          <td><span className={`${ui.badge} ${what.tone}`}>{what.text}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {checked && (
            <div className={`${ui.formActions} ${styles.importBar}`}>
              <button name="mode" value="import" className={ui.primaryButton} disabled={pending}>
                {pending ? 'Importing…' : `Import ${state.rows} rows`}
              </button>
              <span className={ui.muted}>Uses the file chosen above.</span>
            </div>
          )}
        </section>
      )}
    </form>
  );
}
