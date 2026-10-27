'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { convertWordToPdf } from '@/lib/homework/convert';
import type { HandInResult } from '@/lib/homework/handin';
import { buildPdfs, isWord } from '@/lib/homework/makePdf';
import { FocusMessage } from '@/components/FocusMessage';
import styles from './handin.module.css';

type Status = { kind: 'idle' | 'busy' | 'done' | 'error'; text: string };

// Used by the WhatsApp link (with the family's code) and by the student login (no code: the login says who it is).
// The student adds photos and files one after another, then one Hand in sends them all as a single PDF.
export function HandInForm({ action, code, sheetId, title, label = 'Hand in' }: {
  action: (form: FormData) => Promise<HandInResult>; code?: string; sheetId: string; title?: string; label?: string;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });
  const picker = useRef<HTMLInputElement>(null);
  const naming = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(title ?? '');

  // Each pick adds to the list, so several photos can be taken one at a time.
  function add(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // lets the same file or camera be picked again
    setFiles((current) => [...current, ...picked]);
    setStatus({ kind: 'idle', text: '' });
  }

  async function convertWord(file: File) {
    const form = new FormData();
    if (code) form.set('code', code);
    form.set('sheet_id', sheetId);
    form.set('file', file);
    const result = await convertWordToPdf(form);
    if (!result.ok) throw new Error(result.error);
    return Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0));
  }

  // Combines everything into one PDF, then sends it (two or more PDFs only for very long hand-ins).
  async function send() {
    let pdfs: File[];
    try {
      pdfs = await buildPdfs(files, convertWord, (text) => setStatus({ kind: 'busy', text }));
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Could not make the PDF.' });
      return;
    }
    for (const [i, pdf] of pdfs.entries()) {
      setStatus({ kind: 'busy', text: pdfs.length === 1 ? 'Sending…' : `Sending ${i + 1} of ${pdfs.length}…` });
      const form = new FormData();
      if (code) form.set('code', code);
      form.set('sheet_id', sheetId);
      form.set('part', String(i + 1));
      form.set('parts', String(pdfs.length));
      form.set('name', name);
      form.set('file', pdf);
      const result = await action(form);
      if (!result.ok) {
        setStatus({ kind: 'error', text: result.error });
        return;
      }
    }
    setFiles([]);
    setStatus({ kind: 'done', text: 'Received. Thank you!' });
    router.refresh(); // reload the list so this homework moves to "Handed in"
  }

  const busy = status.kind === 'busy';
  return (
    <div className={styles.handin}>
      <div className={styles.picks}>
        <label className={styles.pick}>
          📷 Take a photo
          <input type="file" accept="image/*" capture="environment" hidden onChange={add} disabled={busy} />
        </label>
        <label className={styles.pick}>
          📎 Choose files
          <input
            ref={picker}
            type="file"
            accept="image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            hidden
            onChange={add}
            disabled={busy}
          />
        </label>
      </div>

      {files.length > 0 && (
        <ol className={styles.list}>
          {files.map((f, i) => (
            <li key={`${i}-${f.name}-${f.lastModified}`}>
              <span>{f.type.startsWith('image/') ? '🖼️' : isWord(f) ? '📝' : '📄'} {f.name}</span>
              <button type="button" className={styles.remove} disabled={busy} aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((current) => current.filter((_, j) => j !== i))}>✕</button>
            </li>
          ))}
        </ol>
      )}
      {files.length > 0 && (
        <p className={styles.chosen}>Add as many pages as you need. They are sent together as one PDF.</p>
      )}

      {/* Always clickable: with nothing chosen yet, it opens the file picker instead. */}
      <button type="button" className={styles.send} disabled={busy}
        onClick={() => (files.length === 0 ? picker.current?.click() : naming.current?.showModal())}>
        {busy ? status.text : files.length > 0 ? `${label} (${files.length} page${files.length === 1 ? '' : 's'})` : label}
      </button>
      {/* Asked when Hand in is pressed: the name the PDF is saved under. */}
      <dialog ref={naming} className={styles.naming} aria-label="Name your file">
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); naming.current?.close(); send(); }}>
          <label className={styles.nameLabel}>
            Name your file
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required
              placeholder="e.g. Fractions homework" className={styles.nameInput} autoFocus />
          </label>
          <p className={styles.chosen}>Saved as a PDF{files.length > 1 ? ` with all ${files.length} pages` : ''}.</p>
          <div className={styles.nameButtons}>
            <button type="submit" className={styles.send}>{label}</button>
            <button type="button" className={styles.cancel} onClick={() => naming.current?.close()}>Cancel</button>
          </div>
        </form>
      </dialog>
      {status.kind === 'done' && <FocusMessage className={styles.ok} role="status" signal={status}>✅ {status.text}</FocusMessage>}
      {status.kind === 'error' && <FocusMessage className={styles.error} role="alert" signal={status}>{status.text}</FocusMessage>}
    </div>
  );
}
