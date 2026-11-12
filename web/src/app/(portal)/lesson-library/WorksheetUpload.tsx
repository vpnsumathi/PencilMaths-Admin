'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ui from '@/components/ui.module.css';
import { uploadWorksheet } from './actions';

type Row = { name: string; state: 'waiting' | 'sending' | 'done' | 'failed'; message?: string };

// Choose many worksheets at once; they are sent one at a time and each is matched to its
// homework code by its file name ("Y5 - A001.pdf" → Y5-A001). A file uploaded again replaces the old one.
export function WorksheetUpload() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const next: Row[] = files.map((f) => ({ name: f.name, state: 'waiting' }));
    setRows([...next]);
    for (let i = 0; i < files.length; i++) {
      next[i] = { ...next[i], state: 'sending' };
      setRows([...next]);
      const form = new FormData();
      form.set('file', files[i]);
      try {
        const r = await uploadWorksheet(form);
        next[i] = r.ok ? { ...next[i], state: 'done', message: r.code } : { ...next[i], state: 'failed', message: r.error };
      } catch {
        next[i] = { ...next[i], state: 'failed', message: 'Could not upload.' };
      }
      setRows([...next]);
    }
    setBusy(false);
    setFiles([]);
    router.refresh();
  }

  const done = rows.filter((r) => r.state === 'done').length;
  const failed = rows.filter((r) => r.state === 'failed').length;

  return (
    <div>
      <div className={ui.formActions}>
        <input type="file" multiple accept=".pdf,.doc,.docx,image/*" className={ui.input} disabled={busy}
          aria-label="Worksheets" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setRows([]); }} />
        <button type="button" className={ui.primaryButton} disabled={busy || files.length === 0} onClick={send}>
          {busy ? 'Uploading…' : `Upload ${files.length || ''} worksheet${files.length === 1 ? '' : 's'}`}
        </button>
      </div>
      {rows.length > 0 && (
        <>
          <p className={ui.muted}>{done} uploaded{failed ? `, ${failed} not uploaded` : ''}{busy ? ` of ${rows.length}…` : '.'}</p>
          <ul className={ui.list}>
            {rows.map((r, i) => (
              <li key={`${r.name}-${i}`}>
                <span>{r.name}</span>
                <span className={ui.muted}>
                  {r.state === 'waiting' && 'Waiting'}
                  {r.state === 'sending' && 'Uploading…'}
                  {r.state === 'done' && `✅ ${r.message}`}
                  {r.state === 'failed' && `⚠️ ${r.message}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
