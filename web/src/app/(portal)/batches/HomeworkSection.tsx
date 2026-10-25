import { ConfirmButton } from '@/components/ConfirmButton';
import { Field } from '@/components/Field';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { formatDate } from '@/lib/format';
import { todayInUk } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import {
  addHomeworkFile, createHomework, deleteHomework, giveHomework, markHomework, removeHomeworkFile,
} from './actions';

// Label and badge colour for each homework status.
const STATUS: Record<string, { tone: string; label: string }> = {
  pending: { tone: 'closed', label: 'Not handed in' },
  received: { tone: 'trial', label: 'To mark' },
  marked: { tone: 'active', label: 'Marked' },
  excused: { tone: 'paused', label: 'Excused' },
};

const SHEET_ACCEPT = '.pdf,.doc,.docx,image/*';

type Member = { id: string; first_name: string; last_name: string };
type Result = {
  student_id: string; status: string; mark: number | null; received_on: string | null;
  students: { first_name: string; last_name: string };
};

// Homework for one batch: set new homework, see who handed in, open their files, enter marks.
export async function HomeworkSection({ batchId, members }: { batchId: string; members: Member[] }) {
  const supabase = await createClient();
  const { data: sheets } = await supabase
    .from('homework_sheets')
    .select('id, title, set_on, due_on, max_mark, homework_results(student_id, status, mark, received_on, students(first_name, last_name))')
    .eq('batch_id', batchId)
    .order('set_on', { ascending: false })
    .order('created_at', { ascending: false });
  const sheetIds = (sheets ?? []).map((s) => s.id);
  const { data: allFiles } = sheetIds.length
    ? await supabase
        .from('file_links')
        .select('owner_type, owner_id, student_id, url, label')
        .in('owner_type', ['homework_submission', 'homework_correction'])
        .in('owner_id', sheetIds)
        .order('created_at')
    : { data: [] };
  // What students handed in, and the teacher's corrected sheets.
  const files = (allFiles ?? []).filter((f) => f.owner_type === 'homework_submission');
  const corrections = (allFiles ?? []).filter((f) => f.owner_type === 'homework_correction');
  const { data: sheetFiles } = sheetIds.length
    ? await supabase
        .from('file_links')
        .select('id, owner_id, url, label')
        .eq('owner_type', 'homework_sheet')
        .in('owner_id', sheetIds)
        .order('created_at')
    : { data: [] };

  // The latest active homework (newest one someone still has to hand in or have marked) is open and
  // highlighted; the rest are folded away. With nothing active, the newest homework is the latest.
  const latestId = (sheets ?? []).find((s) =>
    (s.homework_results as unknown as Result[]).some((r) => r.status === 'pending' || r.status === 'received'),
  )?.id ?? sheets?.[0]?.id;

  return (
    <section id="homework" className={ui.card} style={{ marginTop: 16, scrollMarginTop: 16 }}>
      <h2>Upload Homework</h2>

      <form action={createHomework} className={ui.fieldGrid} style={{ marginBottom: 16 }}>
        <input type="hidden" name="batch_id" value={batchId} />
        <Field label="Title" full>
          <input name="title" required placeholder="e.g. Fractions worksheet 2" className={ui.input} />
        </Field>
        <Field label="Set on">
          <input name="set_on" type="date" defaultValue={todayInUk()} className={ui.input} />
        </Field>
        <Field label="Due on (optional)">
          <input name="due_on" type="date" className={ui.input} />
        </Field>
        <Field label="Maximum mark (optional)">
          <input name="max_mark" type="number" min={1} step="0.5" className={ui.input} />
        </Field>
        <Field label="Homework file (optional, PDF, Word or photo, 4 MB max)">
          <input name="sheet_file" type="file" accept={SHEET_ACCEPT} className={ui.input} />
        </Field>
        <Field label="Or a link to it (optional)">
          <input name="sheet_url" type="url" placeholder="https://…" className={ui.input} />
        </Field>
        <div className={ui.formActions} style={{ alignSelf: 'end' }}>
          <button className={ui.primaryButton}>Set homework</button>
        </div>
      </form>

      {(sheets ?? []).length === 0 && <p className={ui.empty}>No homework set yet.</p>}

      {(sheets ?? []).map((sheet) => {
        // Supabase can't tell students(...) is a single row here, so the type is set by hand.
        const results = sheet.homework_results as unknown as Result[];
        const byStudent = new Map(results.map((r) => [r.student_id, r]));
        // Students the homework was given to (a result row): everyone in the batch when it was set,
        // plus anyone given it later. Students who joined after it was set are listed under "Not given to".
        const rows = results
          .map((r) => ({ id: r.student_id, name: `${r.students.first_name} ${r.students.last_name}` }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const notGiven = members.filter((m) => !byStudent.has(m.id));
        const toMark = results.filter((r) => r.status === 'received').length;

        return (
          <details key={sheet.id} id={sheet.id === latestId ? 'latest-homework' : undefined}
            className={`${ui.homework} ${sheet.id === latestId ? ui.homeworkLatest : ''}`} open={sheet.id === latestId}>
            <summary>
              <strong>{sheet.title}</strong>
              <span className={ui.muted}>
                {' '}· set {formatDate(sheet.set_on)}
                {sheet.due_on && ` · due ${formatDate(sheet.due_on)}`}
                {sheet.max_mark && ` · out of ${sheet.max_mark}`}
              </span>
              {sheet.id === latestId && <> <StatusBadge status="in_progress" label="Latest" /></>}
              {toMark > 0 && <> <StatusBadge status="trial" label={`${toMark} to mark`} /></>}
            </summary>

            <div style={{ margin: '8px 0 12px' }}>
              <strong>Homework file: </strong>
              {(sheetFiles ?? []).filter((f) => f.owner_id === sheet.id).length === 0 && <span className={ui.muted}>none yet </span>}
              {(sheetFiles ?? []).filter((f) => f.owner_id === sheet.id).map((f) => (
                <form key={f.id} action={removeHomeworkFile} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginRight: 12 }}>
                  <input type="hidden" name="batch_id" value={batchId} />
                  <input type="hidden" name="file_id" value={f.id} />
                  <a href={f.url} target="_blank" rel="noreferrer" className={ui.link}>{f.label}</a>
                  <ConfirmButton className={ui.button} message={`Remove "${f.label}" from this homework? An uploaded file stays in Google Drive.`}>
                    Remove
                  </ConfirmButton>
                </form>
              ))}
              <form action={addHomeworkFile} className={ui.formActions} style={{ marginTop: 6 }}>
                <input type="hidden" name="batch_id" value={batchId} />
                <input type="hidden" name="sheet_id" value={sheet.id} />
                <input name="sheet_file" type="file" accept={SHEET_ACCEPT} className={ui.input} aria-label="Homework file" />
                <input name="sheet_url" type="url" placeholder="or paste a link" className={ui.input} aria-label="Homework link" />
                <button className={ui.button}>Add file</button>
              </form>
            </div>

            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead><tr><th>Student</th><th>Status</th><th>Files</th><th>Mark</th></tr></thead>
                <tbody>
                  {rows.map((student) => {
                    const r = byStudent.get(student.id);
                    const status = STATUS[r?.status ?? 'pending'];
                    const theirFiles = files.filter((f) => f.owner_id === sheet.id && f.student_id === student.id);
                    const corrected = corrections.filter((f) => f.owner_id === sheet.id && f.student_id === student.id);
                    return (
                      <tr key={student.id}>
                        <td>{student.name}</td>
                        <td>
                          <StatusBadge status={status.tone} label={status.label} />
                          {r?.received_on && <span className={ui.muted}> {formatDate(r.received_on)}</span>}
                        </td>
                        <td>
                          {theirFiles.length === 0 && corrected.length === 0 ? '—' : (
                            <span className={ui.files}>
                              {theirFiles.map((f, i) => (
                                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className={ui.link} title={f.label}>
                                  File {i + 1}
                                </a>
                              ))}
                              {corrected.map((f, i) => (
                                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className={ui.link} title={f.label}>
                                  ✏️ Corrected{corrected.length > 1 ? ` ${i + 1}` : ''}
                                </a>
                              ))}
                            </span>
                          )}
                        </td>
                        <td>
                          {/* One Save: the mark, plus the corrected sheet if one is chosen. */}
                          <form action={markHomework} className={ui.formActions}>
                            <input type="hidden" name="batch_id" value={batchId} />
                            <input type="hidden" name="sheet_id" value={sheet.id} />
                            <input type="hidden" name="student_id" value={student.id} />
                            <input name="mark" type="number" min={0} max={sheet.max_mark ?? undefined} step="0.5"
                              defaultValue={r?.mark ?? ''} className={ui.input} style={{ width: 80 }} aria-label={`Mark for ${student.name}`} />
                            <input name="correction" type="file" accept={SHEET_ACCEPT} className={ui.input}
                              title="Corrected sheet (optional)" aria-label={`Corrected sheet for ${student.name} (optional)`} />
                            <button className={ui.button}>Save</button>
                            <button name="excuse" value="true" className={ui.button}>Excuse</button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {notGiven.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong>Not given to: </strong>
                <span className={ui.muted}>joined the class after this homework was set</span>
                {notGiven.map((m) => (
                  <form key={m.id} action={giveHomework} className={ui.formActions} style={{ marginTop: 6 }}>
                    <input type="hidden" name="batch_id" value={batchId} />
                    <input type="hidden" name="sheet_id" value={sheet.id} />
                    <input type="hidden" name="student_id" value={m.id} />
                    <span>{m.first_name} {m.last_name}</span>
                    <button className={ui.button}>Give homework</button>
                  </form>
                ))}
              </div>
            )}

            <form action={deleteHomework} style={{ marginTop: 10 }}>
              <input type="hidden" name="batch_id" value={batchId} />
              <input type="hidden" name="sheet_id" value={sheet.id} />
              <ConfirmButton className={ui.dangerButton} message={`Delete "${sheet.title}" and its marks? Files stay in Google Drive.`}>
                Delete homework
              </ConfirmButton>
            </form>
          </details>
        );
      })}
    </section>
  );
}
