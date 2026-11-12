'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Field } from '@/components/Field';
import { FocusMessage } from '@/components/FocusMessage';
import ui from '@/components/ui.module.css';
import { saveClassNote, startNoteUpload, uploadNoteViaServer } from './notesActions';

export type TopicGroup = { label: string; options: { value: string; label: string }[] };

const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*';

// Add a class note or document: title, the topic it is for (optional), some text, and a file or a link.
// A file goes straight from this browser to Google Drive (see notesActions.ts), so big slide decks are fine.
export function ClassNoteForm({ batchId, topics }: { batchId: string; topics: TopicGroup[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string; at: number } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get('file');
    const chosen = file instanceof File && file.size > 0 ? file : null;
    const fields = {
      title: String(form.get('title') ?? ''),
      body: String(form.get('body') ?? ''),
      topic: String(form.get('topic') ?? ''),
      link: String(form.get('link') ?? ''),
    };
    const done = (ok: boolean, message: string) => { setResult({ ok, message, at: Date.now() }); setBusy(null); };

    try {
      let uploaded: { driveFileId: string; fileName: string } | null = null;
      if (chosen) {
        if (fields.link.trim()) return done(false, 'Add a file or a link, not both. Add the other as a second note.');
        setBusy(`Uploading ${chosen.name}…`);
        const start = await startNoteUpload(batchId, { name: chosen.name, size: chosen.size });
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
          const sent = await uploadNoteViaServer(batchId, via);
          if (!sent.ok) return done(false, sent.error);
          uploaded = { driveFileId: sent.driveFileId, fileName: sent.name };
        }
      }
      setBusy('Saving…');
      const saved = await saveClassNote(batchId, { ...fields, ...(uploaded ?? {}) });
      if (!saved.ok) return done(false, saved.error);
      formRef.current?.reset();
      done(true, saved.message);
      router.refresh();
    } catch (err) {
      console.error('class notes: save failed', err);
      done(false, 'Could not add the note. Check your connection and try again.');
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className={ui.fieldGrid} style={{ marginBottom: 16 }}>
      <Field label="Title" full>
        <input name="title" required maxLength={200} placeholder="e.g. Fractions: key facts" className={ui.input} disabled={Boolean(busy)} />
      </Field>
      <Field label="Lesson plan topic (optional)" full>
        <select name="topic" defaultValue="" className={ui.select} disabled={Boolean(busy)}>
          <option value="">Whole class (no particular topic)</option>
          {topics.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
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
