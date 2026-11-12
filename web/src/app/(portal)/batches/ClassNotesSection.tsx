import { ConfirmButton } from '@/components/ConfirmButton';
import { Section } from '@/components/Section';
import ui from '@/components/ui.module.css';
import { notesTableMissing, NOTES_NOT_READY } from '@/lib/classNotes';
import { formatDay } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { ClassNoteForm, type TopicGroup } from './ClassNoteForm';
import styles from './classNotes.module.css';
import { removeClassNote } from './notesActions';

type Note = {
  id: string; title: string; body: string | null; provider: string | null; url: string | null; file_name: string | null;
  created_by_name: string | null; created_at: string;
  batch_topics: { name: string } | null; lessons: { code: string; name: string } | null;
};

// Class notes and documents of one batch: staff and the batch's teacher add notes, files and links, optionally
// for one lesson plan topic. The batch's students see them in their login under Class Notes/Documents (/me/notes).
export async function ClassNotesSection({ batch, usesLibrary }: {
  batch: { id: string; subject_id: string; year_group: number }; usesLibrary: boolean;
}) {
  const supabase = await createClient();
  const [{ data, error }, { data: lessons }, { data: topics }] = await Promise.all([
    supabase
      .from('class_notes')
      .select('id, title, body, provider, url, file_name, created_by_name, created_at, batch_topics(name), lessons(code, name)')
      .eq('batch_id', batch.id)
      .order('created_at', { ascending: false }),
    // The topics to choose from: the Lesson library's lessons (grouped by term and module), or the batch's
    // curriculum topics for subjects not in the Lesson library.
    usesLibrary
      ? supabase.from('lessons').select('id, term, module, code, name').eq('subject_id', batch.subject_id).eq('year_group', batch.year_group)
          .order('term').order('position')
      : Promise.resolve({ data: [] as { id: string; term: number; module: string; code: string; name: string }[] }),
    usesLibrary
      ? Promise.resolve({ data: [] as { id: string; position: number; name: string }[] })
      : supabase.from('batch_topics').select('id, position, name').eq('batch_id', batch.id).order('position'),
  ]);

  if (error) {
    if (!notesTableMissing(error)) console.error('ClassNotesSection failed:', error.message);
    return (
      <Section id="class-notes" title="Class notes and documents" summary="Not available yet">
        <p className={ui.empty}>{notesTableMissing(error) ? NOTES_NOT_READY : 'Could not load the class notes.'}</p>
      </Section>
    );
  }
  const notes = (data ?? []) as unknown as Note[];

  const groups: TopicGroup[] = [];
  if (usesLibrary) {
    for (const l of lessons ?? []) {
      const label = `Term ${l.term} · ${l.module}`;
      let group = groups.find((g) => g.label === label);
      if (!group) groups.push(group = { label, options: [] });
      group.options.push({ value: `lesson:${l.id}`, label: `${l.code} ${l.name}` });
    }
  } else if ((topics ?? []).length > 0) {
    groups.push({ label: 'Lesson plan', options: (topics ?? []).map((t) => ({ value: `topic:${t.id}`, label: `${t.position}. ${t.name}` })) });
  }

  return (
    <Section id="class-notes" title="Class notes and documents"
      summary={notes.length === 0 ? 'None yet' : `${notes.length} note${notes.length === 1 ? '' : 's'} · latest ${formatDay(notes[0].created_at)}`}>
      <p className={ui.hint} style={{ marginTop: 0 }}>
        Students in this batch see these in their login, under <strong>Class Notes/Documents</strong>.
      </p>

      {/* The form folds away behind "Add a note" once there are notes, so the list is what you see first. */}
      <details className={styles.add} open={notes.length === 0}>
        <summary className={ui.primaryButton}>＋ Add a note</summary>
        <div className={styles.addBody}>
          <ClassNoteForm batchId={batch.id} topics={groups} />
        </div>
      </details>

      {notes.length === 0 && <p className={ui.empty}>No class notes yet.</p>}
      <ul className={styles.notes}>
        {notes.map((n) => {
          const topic = n.lessons ? `${n.lessons.code} ${n.lessons.name}` : n.batch_topics?.name;
          return (
            <li key={n.id} className={styles.note}>
              <div className={styles.head}>
                <div>
                  <strong>{n.title}</strong>
                  {topic && <span className={styles.topic}>{topic}</span>}
                  <div className={ui.stamp}>Added {formatDay(n.created_at)}{n.created_by_name ? ` by ${n.created_by_name}` : ''}</div>
                </div>
                <form action={removeClassNote}>
                  <input type="hidden" name="batch_id" value={batch.id} />
                  <input type="hidden" name="note_id" value={n.id} />
                  <ConfirmButton className={ui.dangerButton}
                    message={`Remove "${n.title}"? Students will no longer see it.${n.provider === 'google_drive' ? ' The file stays in Google Drive.' : ''}`}>
                    Remove
                  </ConfirmButton>
                </form>
              </div>
              {n.body && <p className={styles.body}>{n.body}</p>}
              {n.provider === 'google_drive' && (
                // Through the app, because teachers don't have access to the Pencil Maths Google Drive.
                <a href={`/class-notes/${n.id}`} target="_blank" rel="noreferrer" className={ui.link}>📄 {n.file_name ?? 'Open document'}</a>
              )}
              {n.provider === 'external_link' && n.url && (
                <a href={n.url} target="_blank" rel="noopener noreferrer" className={ui.link}>🔗 {n.url}</a>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
