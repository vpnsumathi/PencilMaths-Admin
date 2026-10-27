'use client';

import { useState } from 'react';
import ui from '@/components/ui.module.css';

// A compact "Corrected sheet" button in place of the browser's wide file box, so the marking row stays
// on one line on a laptop. Shows the chosen file's name (shortened) once picked.
export function CorrectionPicker({ accept, label }: { accept: string; label: string }) {
  const [name, setName] = useState<string | null>(null);
  return (
    <label className={`${ui.button} ${ui.filePick}`} title={name ?? 'Corrected sheet (optional)'}>
      <input name="correction" type="file" accept={accept} className={ui.srOnly} aria-label={label}
        onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
      📎 <span className={ui.fileName}>{name ?? 'Corrected sheet'}</span>
    </label>
  );
}
