import { ConfirmButton } from '@/components/ConfirmButton';
import ui from '@/components/ui.module.css';
import { notesTableMissing, NOTES_NOT_READY } from '@/lib/classNotes';
import { formatDay } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { ClassNoteForm, type NoteClass } from '../batches/ClassNoteForm';
import styles from '../batches/classNotes.module.css';
import { removeClassNote } from '../batches/notesActions';

type Note = {
  id: string; title: string; body: string | null; created_at: string; created_by_name: string | null;
  batch_id: string | null; batch_code: string | null; subject: string | null; topic: string | null;
  for_you: boolean; provider: string | null; url: string | null; file_name: string | null;
};

// "Notes and documents for <name>" on the student page: every class note this student can see now (whole batch
// notes, notes for chosen students, personal notes), and a form to add one just for them.
// Staff can add a personal note that is not for any class; a teacher picks one of their own classes, and the
// database only gives a teacher the notes of their own batches (never personal notes).
export async function StudentNotesCard({ studentId, firstName, teacher }: { studentId: string; firstName: string; teacher: boolean }) {
  const supabase = await createClient();
  const [{ data, error }, { data: enrolments }] = await Promise.all([
    supabase.rpc('student_class_notes', { p_student: studentId }),
    // The student's current classes (a teacher only gets their own back).
    supabase.from('enrolments').select('batch_id, subjects(name), batches(code, closed_on)')
      .eq('student_id', studentId).is('ended_on', null).not('batch_id', 'is', null),
  ]);

  if (error) {
    if (!notesTableMissing(error)) console.error('student_class_notes failed:', error.message);
    return (
      <section className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
        <h2>Notes and documents for {firstName}</h2>
        <p className={ui.empty}>{notesTableMissing(error) ? NOTES_NOT_READY : 'Could not load the notes.'}</p>
      </section>
    );
  }

  const notes = (data ?? []) as Note[];
  type Row = { batch_id: string; subjects: { name: string } | null; batches: { code: string; closed_on: string | null } | null };
  const classes: NoteClass[] = ((enrolments ?? []) as unknown as Row[])
    .filter((e) => e.batches && !e.batches.closed_on)
    .map((e) => ({ id: e.batch_id, label: `${e.batches!.code}${e.subjects ? ` · ${e.subjects.name}` : ''}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const canAdd = !teacher || classes.length > 0;
  const back = `/students/${studentId}`;

  return (
    <section id="notes" className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
      <h2>Notes and documents for {firstName}</h2>
      <p className={ui.hint} style={{ marginTop: 0 }}>
        What {firstName} sees under <strong>Class Notes/Documents</strong> in their login. A note added here is for {firstName} only.
      </p>

      {canAdd && (
        <details className={styles.add} open={notes.length === 0}>
          <summary className={ui.primaryButton}>＋ Add a note for {firstName}</summary>
          <div className={styles.addBody}>
            <ClassNoteForm mode="student" studentId={studentId} firstName={firstName} classes={classes} allowPersonal={!teacher} />
          </div>
        </details>
      )}

      {notes.length === 0 && <p className={ui.empty}>No notes yet.</p>}
      <ul className={styles.notes}>
        {notes.map((n) => (
          <li key={n.id} className={styles.note}>
            <div className={styles.head}>
              <div>
                <strong>{n.title}</strong>
                {n.topic && <span className={styles.topic}>{n.topic}</span>}
                {n.for_you
                  ? <span className={`${styles.forWhom} ${styles.forSome}`}>{n.batch_code ? `Chosen students · ${n.batch_code}` : 'Personal'}</span>
                  : <span className={styles.forWhom}>Whole batch · {n.batch_code}</span>}
                <div className={ui.stamp}>Added {formatDay(n.created_at)}{n.created_by_name ? ` by ${n.created_by_name}` : ''}</div>
              </div>
              <form action={removeClassNote}>
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="note_id" value={n.id} />
                <ConfirmButton className={ui.dangerButton}
                  message={`Remove "${n.title}"? ${n.for_you ? 'Nobody it was for' : `No student in ${n.batch_code}`} will see it any more.${n.provider === 'google_drive' ? ' The file stays in Google Drive.' : ''}`}>
                  Remove
                </ConfirmButton>
              </form>
            </div>
            {n.body && <p className={styles.body}>{n.body}</p>}
            {n.provider === 'google_drive' && (
              <a href={`/class-notes/${n.id}`} target="_blank" rel="noreferrer" className={ui.link}>📄 {n.file_name ?? 'Open document'}</a>
            )}
            {n.provider === 'external_link' && n.url && (
              <a href={n.url} target="_blank" rel="noopener noreferrer" className={ui.link}>🔗 {n.url}</a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
