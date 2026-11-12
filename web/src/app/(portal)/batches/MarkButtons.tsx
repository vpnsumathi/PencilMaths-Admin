'use client';

import { useFormStatus } from 'react-dom';
import ui from '@/components/ui.module.css';

// Save and Excuse for one student's homework. Both are disabled while saving,
// so a second click during a slow Drive upload can't save the corrected sheet twice.
export function MarkButtons() {
  const { pending } = useFormStatus();
  return (
    <>
      <button className={ui.button} disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
      <button name="excuse" value="true" className={ui.button} disabled={pending}>Excuse</button>
    </>
  );
}
