'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Field } from '@/components/Field';
import ui from '@/components/ui.module.css';
import { formatTrackerDate, ISO_DATE, planClasses, WEEKDAY_SHORT, type Scope, type TrackerLesson } from '@/lib/lessons/tracker';
import { clearLessonTracker, setLessonTracker } from './trackerActions';

function SaveButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className={ui.primaryButton} disabled={pending || disabled}>{pending ? 'Saving…' : label}</button>;
}

// "2026-12-21" → "21 Dec"
const shortDate = (d: string) => formatTrackerDate(d).slice(0, 6).replace('-', ' ');

// Set (or Reset) Lesson Tracker, admins only. The preview is worked out here with the same code the server uses,
// so nothing is sent until Save; the server then works it out again and the database checks it.
export function SetLessonTracker({ batchId, lessons, noClassCodes, batchStart, slotWeekdays, current, today, openNow = false }: {
  batchId: string;
  lessons: TrackerLesson[];            // active lessons: term, Class No. and whether completed
  noClassCodes: string[];              // active lessons without a Class No.
  batchStart: string;                  // the batch's start date, suggested as the start
  slotWeekdays: number[];              // the batch's weekly class days, ticked to begin with
  current: { startOn: string; weekdays: number[]; scope: Scope } | null;
  today: string;
  openNow?: boolean;                   // open straight away (after "Create batch and set Lesson Tracker")
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (openNow && !dialog.current?.open) dialog.current?.showModal(); }, [openNow]);
  const [start, setStart] = useState(current?.startOn ?? batchStart);
  const [days, setDays] = useState<number[]>(current?.weekdays ?? slotWeekdays);
  const [scope, setScope] = useState<Scope>(current?.scope ?? 'whole_year');
  const [anyway, setAnyway] = useState(false);
  const someDone = lessons.some((l) => l.classNo != null && l.done);

  const plan = useMemo(() => {
    if (!ISO_DATE.test(start) || days.length === 0) return null;
    try { return planClasses(lessons, start, days, someDone ? scope : 'whole_year'); } catch { return null; }
  }, [lessons, start, days, scope, someDone]);
  const planned = plan?.classes.filter((c) => c.state === 'planned') ?? [];
  const unplaced = plan?.classes.filter((c) => c.state === 'unplaced') ?? [];
  const doneBefore = plan?.classes.filter((c) => c.state === 'done_before') ?? [];
  const doneAlready = plan && scope === 'whole_year' ? plan.classes.filter((c) => lessons.some((l) => l.term === c.term && l.classNo === c.classNo && l.done)) : [];
  if (slotWeekdays.length === 0) {
    return (
      <button type="button" className={ui.primaryButton} disabled title="Add the batch's weekly class times first (Batch settings)">
        {current ? 'Reset Lesson Tracker' : 'Set Lesson Tracker'}
      </button>
    );
  }
  const blocked = !plan || planned.length + doneBefore.length === 0 || (unplaced.length > 0 && !anyway);

  return (
    <>
      <button type="button" className={ui.primaryButton} onClick={() => dialog.current?.showModal()}>
        {current ? 'Reset Lesson Tracker' : 'Set Lesson Tracker'}
      </button>
      <dialog ref={dialog} className={ui.dialog} aria-label="Set Lesson Tracker">
        <form action={setLessonTracker} className={ui.fieldGrid}>
          <input type="hidden" name="batch_id" value={batchId} />
          <h2 style={{ margin: 0 }}>{current ? 'Reset Lesson Tracker' : 'Set Lesson Tracker'}</h2>
          <p className={ui.muted} style={{ margin: 0 }}>
            Gives every class of the lesson plan a date: lessons with the same Class No. share one date. Skips Christmas
            (21 Dec–1 Jan) and Easter (Thursday to Sunday), and nothing is planned from 21 July.
          </p>
          {current && (
            <p className={ui.alertWarn} style={{ margin: 0, padding: '8px 12px', borderRadius: 12, border: '1px solid' }}>
              This replaces every planned date. Lessons already completed stay completed; their Early, On time and Late
              labels are worked out again against the new dates.
            </p>
          )}

          <Field label="Start date">
            <input name="start_on" type="date" required value={start} className={ui.input} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <p className={ui.muted} style={{ margin: '-6px 0 0', fontSize: 13 }}>
            The batch started on {formatTrackerDate(batchStart)}.
            {start !== batchStart && <> <button type="button" className={ui.link} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
              onClick={() => setStart(batchStart)}>Use that</button></>}
            {start !== today && <> <button type="button" className={ui.link} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
              onClick={() => setStart(today)}>Use today</button></>}
          </p>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className={ui.label} style={{ marginBottom: 6 }}>Teaching days</legend>
            <div className={ui.formActions}>
              {WEEKDAY_SHORT.map((name, i) => (
                <label key={name} className={ui.check} style={{ fontWeight: 500, opacity: slotWeekdays.includes(i + 1) ? 1 : 0.45 }}>
                  <input type="checkbox" name="weekday" value={i + 1} checked={days.includes(i + 1)} disabled={!slotWeekdays.includes(i + 1)}
                    onChange={(e) => setDays(e.target.checked ? [...days, i + 1].sort((a, b) => a - b) : days.filter((d) => d !== i + 1))} />
                  {name}
                </label>
              ))}
            </div>
            <p className={ui.muted} style={{ margin: '6px 0 0', fontSize: 13 }}>Only the days of the batch&apos;s weekly class times can be ticked.</p>
          </fieldset>

          {someDone ? (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className={ui.label} style={{ marginBottom: 6 }}>The class has already completed some lessons. Plan:</legend>
              <label className={ui.check} style={{ fontWeight: 500 }}>
                <input type="radio" name="scope" value="whole_year" checked={scope === 'whole_year'} onChange={() => setScope('whole_year')} />
                The whole year from the start date (completed lessons are compared with their dates)
              </label>
              <label className={ui.check} style={{ fontWeight: 500 }}>
                <input type="radio" name="scope" value="remaining" checked={scope === 'remaining'} onChange={() => setScope('remaining')} />
                Only the classes not yet done, from the start date
              </label>
            </fieldset>
          ) : <input type="hidden" name="scope" value="whole_year" />}

          <div className={ui.card} style={{ padding: 12, fontSize: 14 }} aria-live="polite">
            <strong>Preview</strong>
            {!plan ? (
              <p className={ui.muted} style={{ margin: '6px 0 0' }}>Choose a start date and at least one teaching day.</p>
            ) : (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>
                  {planned.length > 0
                    ? <>{planned.length} class{planned.length === 1 ? '' : 'es'} planned: {formatTrackerDate(planned[0].plannedOn!)} to {formatTrackerDate(planned.at(-1)!.plannedOn!)}.</>
                    : <>No class can be planned before 21 July.</>}
                  {plan.holidays.length > 0 && <> Skips {plan.holidays.map((h) => `${h.name} (${shortDate(h.from)}–${shortDate(h.to)})`).join(' and ')}.</>}
                </li>
                {doneBefore.length > 0 && <li>{doneBefore.length} class{doneBefore.length === 1 ? ' is' : 'es are'} already done and left out.</li>}
                {doneAlready.length > 0 && <li>{doneAlready.length} class{doneAlready.length === 1 ? ' is' : 'es are'} already done; they are compared with their planned dates.</li>}
                {noClassCodes.length > 0 && (
                  <li>{noClassCodes.length} lesson{noClassCodes.length === 1 ? ' has' : 's have'} no Class No. and get{noClassCodes.length === 1 ? 's' : ''} no date
                    ({noClassCodes.slice(0, 6).join(', ')}{noClassCodes.length > 6 ? ' …' : ''}).</li>
                )}
                {unplaced.length > 0 && (
                  <li style={{ color: 'var(--danger)' }}>
                    ⚠️ {unplaced.length} class{unplaced.length === 1 ? " doesn't" : "es don't"} fit before 21 July
                    (Term {unplaced[0].term} Class {unplaced[0].classNo}{unplaced.length > 1 ? ` to Term ${unplaced.at(-1)!.term} Class ${unplaced.at(-1)!.classNo}` : ''}).
                    Add a teaching day or start earlier, or save anyway.
                  </li>
                )}
              </ul>
            )}
          </div>
          {unplaced.length > 0 && (
            <label className={ui.check} style={{ fontWeight: 500 }}>
              <input type="checkbox" name="save_anyway" value="yes" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} />
              Save anyway: {unplaced.length} class{unplaced.length === 1 ? ' stays' : 'es stay'} without a date
            </label>
          )}

          <div className={ui.formActions}>
            <SaveButton label={current ? 'Reset Lesson Tracker' : 'Set Lesson Tracker'} disabled={blocked} />
            <button type="button" className={ui.button} onClick={() => dialog.current?.close()}>Cancel</button>
          </div>
        </form>
        {current && (
          <form action={clearLessonTracker} className={ui.dangerZone} style={{ marginTop: 16 }}>
            <input type="hidden" name="batch_id" value={batchId} />
            <p>Remove the tracker: deletes the planned dates only.</p>
            <ConfirmButton className={ui.dangerButton} message="Remove this batch's Lesson Tracker? The planned dates are deleted; lessons and homework stay as they are.">
              Remove tracker
            </ConfirmButton>
          </form>
        )}
      </dialog>
    </>
  );
}
