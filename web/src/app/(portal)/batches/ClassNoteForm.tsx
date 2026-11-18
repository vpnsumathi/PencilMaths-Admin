'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Field } from '@/components/Field';
import { FocusMessage } from '@/components/FocusMessage';
import ui from '@/components/ui.module.css';
import styles from './classNotes.module.css';
import { saveClassNote, startNoteUpload, uploadNoteViaServer, type NoteTarget } from './notesActions';

export type TopicGroup = { label: string; options: { value: string; label: string }[] };
export type NoteStudent = { id: string; name: string };
export type NoteClass = { id: string; label: string };

// Where the form is:
// - on the batch page: for the whole batch, or for students ticked from the batch's list;
// - on a student's page: for that one student, in one of their classes, or (staff only) not for any class.
type Props =
  | { mode: 'batch'; batchId: string; topics: TopicGroup[]; students: NoteStudent[] }
  | { mode: 'student'; studentId: string; firstName: string; classes: NoteClass[]; allowPersonal: boolean };

const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*';

// Add a class note or document: who it is for, title, the topic it is for (optional), some text, and a file or
// a link. A file goes straight from this browser to Google Drive (see notesActions.ts), so big slide decks are fine.
export function ClassNoteForm(props: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string; at: number } | null>(null);
  const [forSome, setForSome] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Who the note is for, from the form.
  function readTarget(form: FormData): NoteTarget | string {
    if (props.mode === 'student') {
      const cls = String(form.get('batch') ?? '');
      if (!cls && !props.allowPersonal) return 'Choose the class the note is for.';
      return { batchId: cls || null, studentIds: [props.studentId] };
    }
    if (!forSome) return { batchId: props.batchId, studentIds: [] };
    if (picked.size === 0) return 'Tick at least one student, or choose Whole batch.';
    return { batchId: props.batchId, studentIds: [...picked] };
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const target = readTarget(form);
    const file = form.get('file');
    const chosen = file instanceof File && file.size > 0 ? file : null;
    const fields = {
      title: String(form.get('title') ?? ''),
      body: String(form.get('body') ?? ''),
      topic: String(form.get('topic') ?? ''),
      link: String(form.get('link') ?? ''),
    };
    const done = (ok: boolean, message: string) => { setResult({ ok, message, at: Date.now() }); setBusy(null); };
    if (typeof target === 'string') return done(false, target);

    try {
      let uploaded: { driveFileId: string; fileName: string } | null = null;
      if (chosen) {
        if (fields.link.trim()) return done(false, 'Add a file or a link, not both. Add the other as a second note.');
        setBusy(`Uploading ${chosen.name}…`);
        const start = await startNoteUpload(target, { name: chosen.name, size: chosen.size });
        if (!start.ok) return done(false, start.error);
        try {
          // Straight from this browser to Drive.
          const res = await fetch(start.uploadUrl, { method: 'PUT', headers: { 'Content-Type': start.type }, body: chosen });
          if (res.ok) uploaded = { driveFileId: ((await res.json()) as { id: string }).id, fileName: start.name };
        } catch (err) {
          console.warn('class notes: direct upload to Drive failed, trying through the server', err);
        }
        if (!uploaded) {
          const via = new FormData();
          via.append('file', chosen);
          const sent = await uploadNoteViaServer(target, via);
          if (!sent.ok) return done(false, sent.error);
          uploaded = { driveFileId: sent.driveFileId, fileName: sent.name };
        }
      }
      setBusy('Saving…');
      const saved = await saveClassNote(target, { ...fields, ...(uploaded ?? {}) });
      if (!saved.ok) return done(false, saved.error);
      formRef.current?.reset();
      setForSome(false);
      setPicked(new Set());
      done(true, saved.message);
      router.refresh();
    } catch (err) {
      console.error('class notes: save failed', err);
      done(false, 'Could not add the note. Check your connection and try again.');
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className={ui.fieldGrid} style={{ marginBottom: 16 }}>
      {props.mode === 'batch' && (
        <fieldset className={`${styles.audience} ${ui.full}`} disabled={Boolean(busy)}>
          <legend>Who can see it?</legend>
          <div className={styles.choices}>
            <label className={ui.check}>
              <input type="radio" name="audience" value="batch" checked={!forSome} onChange={() => setForSome(false)} /> Whole batch
            </label>
            <label className={ui.check}>
              <input type="radio" name="audience" value="students" checked={forSome} onChange={() => setForSome(true)}
                disabled={props.students.length === 0} /> Chosen students
            </label>
          </div>
          {forSome && (
            <div className={styles.pick}>
              <label className={ui.check}>
                <input type="checkbox" checked={picked.size === props.students.length}
                  onChange={(e) => setPicked(new Set(e.target.checked ? props.students.map((s) => s.id) : []))} /> Select all
              </label>
              {props.students.map((s) => (
                <label key={s.id} className={ui.check}>
                  <input type="checkbox" checked={picked.has(s.id)} onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(s.id); else next.delete(s.id);
                    setPicked(next);
                  }} /> {s.name}
                </label>
              ))}
              <p className={ui.hint} style={{ margin: 0 }}>
                Only the ticked students (and their family login) see this note. A document for one student is saved in their own Drive folder.
              </p>
            </div>
          )}
        </fieldset>
      )}
      {props.mode === 'student' && (
        <Field label="Class" full>
          <select name="batch" defaultValue={props.classes.length === 1 && !props.allowPersonal ? props.classes[0].id : ''}
            className={ui.select} disabled={Boolean(busy)} required={!props.allowPersonal}>
            {props.allowPersonal ? <option value="">Not for a class (personal note)</option> : <option value="" disabled>Choose a class</option>}
            {props.classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
      )}
      <Field label="Title" full>
        <input name="title" required maxLength={200} placeholder="e.g. Fractions: key facts" className={ui.input} disabled={Boolean(busy)} />
      </Field>
      {props.mode === 'batch' && (
        <Field label="Lesson plan topic (optional)" full>
          <select name="topic" defaultValue="" className={ui.select} disabled={Boolean(busy)}>
            <option value="">No particular topic</option>
            {props.topics.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
      )}
      <Field label="Notes (optional)" full>
        <textarea name="body" maxLength={5000} rows={4} placeholder="What was covered, what to revise, anything students should know"
          className={ui.textarea} disabled={Boolean(busy)} />
      </Field>
      <Field label="Document (optional: PDF, Word, PowerPoint, Excel or photo, 50 MB max)">
        <input name="file" type="file" accept={ACCEPT} className={ui.input} disabled={Boolean(busy)} />
      </Field>
      <Field label="Or a link (optional)">
        <input name="link" type="url" maxLength={1000} placeholder="https://…" className={ui.input} disabled={Boolean(busy)} />
      </Field>
      <div className={ui.formActions} style={{ alignSelf: 'end' }}>
        <button className={ui.primaryButton} disabled={Boolean(busy)}>{busy ?? 'Add note'}</button>
      </div>
      {result && (
        <FocusMessage key={result.at} signal={result.at} role={result.ok ? 'status' : 'alert'}
          className={`${ui.alert} ${result.ok ? ui.alertOk : ui.alertError} ${ui.full}`}>
          {result.message}
        </FocusMessage>
      )}
    </form>
  );
}
