'use client';

import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Field } from '@/components/Field';
import ui from '@/components/ui.module.css';
import { completeTopic } from './actions';

// "2026-10-20" plus some days, as "YYYY-MM-DD".
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function OkButton() {
  const { pending } = useFormStatus();
  return <button className={ui.primaryButton} disabled={pending}>{pending ? 'Sending…' : 'OK, send homework'}</button>;
}

// "Mark completed" opens a pop-up with the homework to send, filled in with defaults.
// OK marks the topic completed and sends the homework to every student in the batch.
export function CompleteTopic({ batchId, topicId, topicName, students, today, alreadySent }: {
  batchId: string; topicId: string; topicName: string; students: number; today: string; alreadySent: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [setOn, setSetOn] = useState(today);
  const [dueOn, setDueOn] = useState(addDays(today, 5));

  return (
    <>
      <button type="button" className={ui.primaryButton} onClick={() => dialog.current?.showModal()}>Mark completed</button>
      <dialog ref={dialog} className={ui.dialog} aria-label={`Complete ${topicName}`}>
        <form action={completeTopic} className={ui.fieldGrid}>
          <input type="hidden" name="batch_id" value={batchId} />
          <input type="hidden" name="topic_id" value={topicId} />
          <h2 className={ui.full} style={{ margin: 0 }}>Complete “{topicName}”</h2>
          {alreadySent ? (
            <p className={ui.full} style={{ margin: 0 }}>
              Homework “{alreadySent}” was already sent for this topic, so it won&apos;t be sent again.
            </p>
          ) : (
            <>
              <p className={`${ui.full} ${ui.muted}`} style={{ margin: 0 }}>
                This homework goes to {students} student{students === 1 ? '' : 's'} in this batch.
              </p>
              <Field label="Title" full>
                <input name="title" required defaultValue={topicName} className={ui.input} />
              </Field>
              <Field label="Set on">
                <input name="set_on" type="date" required value={setOn} className={ui.input}
                  onChange={(e) => { setSetOn(e.target.value); if (e.target.value) setDueOn(addDays(e.target.value, 5)); }} />
              </Field>
              <Field label="Due on">
                <input name="due_on" type="date" value={dueOn} min={setOn} className={ui.input}
                  onChange={(e) => setDueOn(e.target.value)} />
              </Field>
              <Field label="Maximum mark">
                <input name="max_mark" type="number" min={1} step="0.5" defaultValue={10} className={ui.input} />
              </Field>
              <Field label="Homework file (blank page if empty)">
                <input name="sheet_file" type="file" accept=".pdf,.doc,.docx,image/*" className={ui.input} />
              </Field>
              <Field label="Link (optional)" full>
                <input name="sheet_url" type="url" placeholder="https://…" className={ui.input} />
              </Field>
            </>
          )}
          <div className={`${ui.formActions} ${ui.full}`}>
            <OkButton />
            <button type="button" className={ui.button} onClick={() => dialog.current?.close()}>Cancel</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
