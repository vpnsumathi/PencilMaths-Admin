'use client';

import { useFormStatus } from 'react-dom';
import ui from '@/components/ui.module.css';

// Save register, disabled while saving so a second click can't send it twice.
// restAbsent: "Save and mark the rest absent", which also saves everyone left unticked as Absent.
export function RegisterButton({ restAbsent = false }: { restAbsent?: boolean }) {
  const { pending } = useFormStatus();
  if (restAbsent) {
    return (
      <button name="rest_absent" value="true" className={ui.button} disabled={pending}
        title="Saves your ticks, and everyone left unticked as Absent. Use it once the class is over.">
        Save and mark the rest absent
      </button>
    );
  }
  return <button className={ui.primaryButton} disabled={pending}>{pending ? 'Saving…' : 'Save register'}</button>;
}
