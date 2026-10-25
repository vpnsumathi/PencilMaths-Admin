'use client';

import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Field } from '@/components/Field';
import ui from '@/components/ui.module.css';
import { completeLesson } from './actions';

export type LessonSheet = { id: string; slot: number; code: string; url: string | null; sent: boolean };

// "2026-10-20" plus some days, as "YYYY-MM-DD".
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function SendButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button className={ui.primaryButton} disabled={pending}>
      {pending ? 'Sending…' : count ? `Complete and send ${count} homework` : 'Complete without homework'}
    </button>
  );
}

// "Mark completed" for a library lesson: pick which of Hw-1, Hw-2 and Hw-3 to send (Hw-1 ticked),
// set the dates and mark, then Send. Each ticked sheet becomes one homework for the class, with its worksheet.
export function CompleteLesson({ batchId, lesson, sheets, students, today, term, moduleName }: {
  batchId: string; lesson: { id: string; code: string; name: string }; sheets: LessonSheet[];
  students: number; today: string; term: number; moduleName: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [setOn, setSetOn] = useState(today);
  const [dueOn, setDueOn] = useState(addDays(today, 5));
  const firstReady = sheets.find((s) => s.url && !s.sent)?.id;
  const [ticked, setTicked] = useState<string[]>(firstReady ? [firstReady] : []);

  return (
    <>
      <button type="button" className={ui.primaryButton} onClick={() => dialog.current?.showModal()}>Mark completed</button>
      <dialog ref={dialog} className={ui.dialog} aria-label={`Complete ${lesson.name}`}>
        <form action={completeLesson} className={ui.fieldGrid}>
          <input type="hidden" name="batch_id" value={batchId} />
          <input type="hidden" name="lesson_id" value={lesson.id} />
          <input type="hidden" name="term" value={term} />
          <input type="hidden" name="module" value={moduleName} />
          <h2 className={ui.full} style={{ margin: 0 }}>Complete {lesson.code} “{lesson.name}”</h2>
          <p className={`${ui.full} ${ui.muted}`} style={{ margin: 0 }}>
            Tick the homework to send to the {students} student{students === 1 ? '' : 's'} in this class.
          </p>

          <div className={ui.full}>
            {sheets.map((s) => (
              <label key={s.id} className={ui.check} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' }}>
                <input type="checkbox" name="hw" value={s.id} disabled={!s.url || s.sent} checked={ticked.includes(s.id)}
                  onChange={(e) => setTicked(e.target.checked ? [...ticked, s.id] : ticked.filter((x) => x !== s.id))} />
                <strong>Hw-{s.slot}</strong> {s.code}
                {s.sent ? <span className={ui.muted}>already sent</span>
                  : s.url ? <a href={s.url} target="_blank" rel="noreferrer" className={ui.link}>View</a>
                  : <span className={ui.muted}>⚠️ no worksheet yet (upload it in the Lesson library)</span>}
              </label>
            ))}
            {sheets.length === 0 && <p className={ui.muted}>This lesson has no homework sheets.</p>}
          </div>

          {ticked.length > 0 && (
            <>
              <Field label="Set on">
                <input name="set_on" type="date" required value={setOn} className={ui.input}
                  onChange={(e) => { setSetOn(e.target.value); if (e.target.value) setDueOn(addDays(e.target.value, 5)); }} />
              </Field>
              <Field label="Due on">
                <input name="due_on" type="date" value={dueOn} min={setOn} className={ui.input} onChange={(e) => setDueOn(e.target.value)} />
              </Field>
              <Field label="Maximum mark">
                <input name="max_mark" type="number" min={1} step="0.5" defaultValue={10} className={ui.input} />
              </Field>
            </>
          )}
          <div className={`${ui.formActions} ${ui.full}`}>
            <SendButton count={ticked.length} />
            <button type="button" className={ui.button} onClick={() => dialog.current?.close()}>Cancel</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
