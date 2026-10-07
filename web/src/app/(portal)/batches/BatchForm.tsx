import Link from 'next/link';
import { Field } from '@/components/Field';
import ui from '@/components/ui.module.css';
import { formatTime } from '@/lib/format';
import { todayInUk, WEEKDAYS, YEARS } from '@/lib/options';
import { createBatch, updateBatch } from './actions';

export type Batch = {
  id: string;
  subject_id: string;
  year_group: number;
  teacher_id: string;
  capacity: number;
  started_on: string;
  slots: { weekday: number; start_time: string }[];
};
type Subject = { id: string; name: string };
type Teacher = { id: string; first_name: string; last_name: string; subject_id: string | null };

// Used by "New batch" (no batch) and the batch page. Subject and year group are fixed once created,
// because the lesson plan and enrolments depend on them.
export function BatchForm({ batch, subjects, teachers }: { batch?: Batch; subjects: Subject[]; teachers: Teacher[] }) {
  // Show the existing times plus blank rows, so there are always at least 3 rows and 1 spare.
  const rows = [...(batch?.slots ?? [])];
  while (rows.length < 3 || rows.length === batch?.slots.length) rows.push({ weekday: 0, start_time: '' });

  return (
    <form action={batch ? updateBatch : createBatch} className={ui.form}>
      {batch && <input type="hidden" name="id" value={batch.id} />}
      <input type="hidden" name="slot_count" value={rows.length} />

      <section className={ui.card}>
        <h2>Batch</h2>
        <div className={ui.fieldGrid}>
          {!batch && (
            <>
              <Field label="Subject">
                <select name="subject_id" required defaultValue="" className={ui.select}>
                  <option value="" disabled>Choose…</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Year group">
                <select name="year_group" required defaultValue="" className={ui.select}>
                  <option value="" disabled>Choose…</option>
                  {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </Field>
            </>
          )}
          <Field label="Teacher">
            <select name="teacher_id" required defaultValue={batch?.teacher_id ?? ''} className={ui.select}>
              <option value="" disabled>Choose…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name}{t.subject_id ? ` · ${subjects.find((s) => s.id === t.subject_id)?.name ?? t.subject_id}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Places (capacity)">
            <input name="capacity" type="number" min={1} max={12} required defaultValue={batch?.capacity ?? 3} className={ui.input} />
          </Field>
          <Field label="Started on">
            <input name="started_on" type="date" defaultValue={batch?.started_on ?? todayInUk()} className={ui.input} />
          </Field>
        </div>
      </section>

      <section className={ui.card}>
        <h2>Weekly class times (UK time)</h2>
        <p className={ui.hint}>Leave a row blank to skip it.</p>
        {rows.map((slot, i) => (
          <div key={i} className={ui.slotRow}>
            <select name={`slot_day_${i}`} defaultValue={slot.weekday || ''} className={ui.select} aria-label={`Class ${i + 1} day`}>
              <option value="">Day…</option>
              {Object.entries(WEEKDAYS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input name={`slot_time_${i}`} type="time" defaultValue={formatTime(slot.start_time)} className={ui.input} aria-label={`Class ${i + 1} time`} />
          </div>
        ))}
      </section>

      <div className={ui.formActions}>
        <button className={ui.primaryButton}>{batch ? 'Save changes' : 'Create batch'}</button>
        <Link href="/batches" className={ui.button}>Cancel</Link>
      </div>
    </form>
  );
}
