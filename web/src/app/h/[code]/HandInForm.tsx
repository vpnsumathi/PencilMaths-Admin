'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { handInFile } from './actions';
import styles from './handin.module.css';

// Shrinks a phone photo to at most 2000px as a JPEG (usually 300–800 KB) so it uploads fast and stays
// under the size limit. PDFs, and images the browser can't read, are sent unchanged.
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

type Status = { kind: 'idle' | 'busy' | 'done' | 'error'; text: string };

export function HandInForm({ code, sheetId, label = 'Hand in' }: { code: string; sheetId: string; label?: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });
  const picker = useRef<HTMLInputElement>(null);

  // Sends the chosen files one by one, stopping at the first problem.
  async function send() {
    for (const [i, original] of files.entries()) {
      setStatus({ kind: 'busy', text: `Sending ${i + 1} of ${files.length}…` });
      const form = new FormData();
      form.set('code', code);
      form.set('sheet_id', sheetId);
      form.set('part', String(i + 1));
      form.set('file', await shrink(original));
      const result = await handInFile(form);
      if (!result.ok) {
        setStatus({ kind: 'error', text: result.error });
        return;
      }
    }
    setFiles([]);
    setStatus({ kind: 'done', text: 'Received. Thank you!' });
    router.refresh(); // reload the list so this homework moves to "Handed in"
  }

  return (
    <div className={styles.handin}>
      <label className={styles.pick}>
        📷 Take a photo or choose a file
        <input
          ref={picker}
          type="file"
          accept="image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          hidden
          onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setStatus({ kind: 'idle', text: '' }); }}
        />
      </label>
      {files.length > 0 && <p className={styles.chosen}>{files.length} file{files.length === 1 ? '' : 's'} chosen</p>}
      {/* Always clickable: with no files chosen yet, it opens the camera / file picker instead. */}
      <button type="button" className={styles.send} disabled={status.kind === 'busy'}
        onClick={() => (files.length === 0 ? picker.current?.click() : send())}>
        {status.kind === 'busy' ? status.text : label}
      </button>
      {status.kind === 'done' && <p className={styles.ok} role="status">✅ {status.text}</p>}
      {status.kind === 'error' && <p className={styles.error} role="alert">{status.text}</p>}
    </div>
  );
}
