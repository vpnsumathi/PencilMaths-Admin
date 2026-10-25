'use client';

import { useRef } from 'react';
import { useFormStatus } from 'react-dom';
import ui from '@/components/ui.module.css';
import { formatDate } from '@/lib/format';
import { giveHomework } from './actions';

export type PastHomework = { id: string; title: string; set_on: string };

function GiveButton() {
  const { pending } = useFormStatus();
  return <button className={ui.primaryButton} disabled={pending}>{pending ? 'Giving…' : 'Give ticked homework'}</button>;
}

// "Give past homework (3)" next to a student who joined after some homework was set:
// a pop-up listing that homework, all ticked; untick any they shouldn't do.
export function GivePastHomework({ batchId, student, homework }: {
  batchId: string; student: { id: string; name: string }; homework: PastHomework[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={ui.button} onClick={() => dialog.current?.showModal()}>
        Give past homework ({homework.length})
      </button>
      <dialog ref={dialog} className={ui.dialog} aria-label={`Give past homework to ${student.name}`}>
        <form action={giveHomework}>
          <input type="hidden" name="batch_id" value={batchId} />
          <input type="hidden" name="student_id" value={student.id} />
          <h2 style={{ margin: '0 0 8px' }}>Give past homework to {student.name}</h2>
          <p className={ui.muted} style={{ marginTop: 0 }}>
            This homework was set before {student.name} joined the class. Tick the ones they should do.
            They appear under To hand in straight away.
          </p>
          {homework.map((h) => (
            <label key={h.id} className={ui.check} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
              <input type="checkbox" name="sheet_id" value={h.id} defaultChecked />
              <span>{h.title} <span className={ui.muted}>· set {formatDate(h.set_on)}</span></span>
            </label>
          ))}
          <div className={ui.formActions} style={{ marginTop: 12 }}>
            <GiveButton />
            <button type="button" className={ui.button} onClick={() => dialog.current?.close()}>Cancel</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
