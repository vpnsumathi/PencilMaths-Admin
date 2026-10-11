import { ConfirmButton } from '@/components/ConfirmButton';
import { Field } from '@/components/Field';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { formatDate } from '@/lib/format';
import { todayInUk } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { createHomework, deleteHomework, markHomework } from './actions';

// Label and badge colour for each homework status.
const STATUS: Record<string, { tone: string; label: string }> = {
  pending: { tone: 'closed', label: 'Not handed in' },
  received: { tone: 'trial', label: 'To mark' },
  marked: { tone: 'active', label: 'Marked' },
  excused: { tone: 'paused', label: 'Excused' },
};

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
  const { data: files } = sheetIds.length
    ? await supabase
        .from('file_links')
        .select('owner_id, student_id, url, label')
        .eq('owner_type', 'homework_submission')
        .in('owner_id', sheetIds)
        .order('created_at')
    : { data: [] };

  return (
    <section className={ui.card} style={{ marginTop: 16 }}>
      <h2>Homework</h2>

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
        <div className={ui.formActions} style={{ alignSelf: 'end' }}>
          <button className={ui.primaryButton}>Set homework</button>
        </div>
      </form>

      {(sheets ?? []).length === 0 && <p className={ui.empty}>No homework set yet.</p>}

      {(sheets ?? []).map((sheet) => {
        // Supabase can't tell students(...) is a single row here, so the type is set by hand.
        const results = sheet.homework_results as unknown as Result[];
        const byStudent = new Map(results.map((r) => [r.student_id, r]));
        // Everyone in the batch now, plus anyone with a result who has since left it.
        const rows = members.map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}` }));
        for (const r of results) {
          if (!rows.some((row) => row.id === r.student_id)) {
            rows.push({ id: r.student_id, name: `${r.students.first_name} ${r.students.last_name}` });
          }
        }
        const toMark = results.filter((r) => r.status === 'received').length;

        return (
          <details key={sheet.id} className={ui.homework} open={toMark > 0}>
            <summary>
              <strong>{sheet.title}</strong>
              <span className={ui.muted}>
                {' '}· set {formatDate(sheet.set_on)}
                {sheet.due_on && ` · due ${formatDate(sheet.due_on)}`}
                {sheet.max_mark && ` · out of ${sheet.max_mark}`}
              </span>
              {toMark > 0 && <> <StatusBadge status="trial" label={`${toMark} to mark`} /></>}
            </summary>

            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead><tr><th>Student</th><th>Status</th><th>Files</th><th>Mark</th></tr></thead>
                <tbody>
                  {rows.map((student) => {
                    const r = byStudent.get(student.id);
                    const status = STATUS[r?.status ?? 'pending'];
                    const theirFiles = (files ?? []).filter((f) => f.owner_id === sheet.id && f.student_id === student.id);
                    return (
                      <tr key={student.id}>
                        <td>{student.name}</td>
                        <td>
                          <StatusBadge status={status.tone} label={status.label} />
                          {r?.received_on && <span className={ui.muted}> {formatDate(r.received_on)}</span>}
                        </td>
                        <td>
                          {theirFiles.length === 0 ? '—' : (
                            <span className={ui.files}>
                              {theirFiles.map((f, i) => (
                                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className={ui.link} title={f.label}>
                                  File {i + 1}
                                </a>
                              ))}
                            </span>
                          )}
                        </td>
                        <td>
                          <form action={markHomework} className={ui.formActions}>
                            <input type="hidden" name="batch_id" value={batchId} />
                            <input type="hidden" name="sheet_id" value={sheet.id} />
                            <input type="hidden" name="student_id" value={student.id} />
                            <input name="mark" type="number" min={0} max={sheet.max_mark ?? undefined} step="0.5"
                              defaultValue={r?.mark ?? ''} className={ui.input} style={{ width: 80 }} aria-label={`Mark for ${student.name}`} />
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
