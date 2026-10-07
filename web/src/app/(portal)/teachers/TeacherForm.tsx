import Link from 'next/link';
import { Field } from '@/components/Field';
import ui from '@/components/ui.module.css';
import { TEACHER_STATUSES, YEARS } from '@/lib/options';
import { saveTeacher } from './actions';

export type Teacher = {
  id: string;
  first_name: string;
  last_name: string;
  personal_email: string | null;
  phone: string | null;
  subject_id: string | null;
  year_min: number | null;
  year_max: number | null;
  status: string;
  joined_on: string | null;
  notes: string | null;
};
type Subject = { id: string; name: string };

// Used by both "Add teacher" (no teacher) and "Edit teacher".
export function TeacherForm({ teacher, subjects }: { teacher?: Teacher; subjects: Subject[] }) {
  return (
    <form action={saveTeacher} className={ui.form}>
      {teacher && <input type="hidden" name="id" value={teacher.id} />}

      <section className={ui.card}>
        <h2>Details</h2>
        <div className={ui.fieldGrid}>
          <Field label="First name">
            <input name="first_name" required defaultValue={teacher?.first_name} className={ui.input} />
          </Field>
          <Field label="Last name">
            <input name="last_name" required defaultValue={teacher?.last_name} className={ui.input} />
          </Field>
          <Field label="Email">
            <input name="personal_email" type="email" defaultValue={teacher?.personal_email ?? ''} className={ui.input} />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" defaultValue={teacher?.phone ?? ''} className={ui.input} />
          </Field>
        </div>
      </section>

      <section className={ui.card}>
        <h2>Teaching</h2>
        <div className={ui.fieldGrid}>
          <Field label="Subject">
            <select name="subject_id" defaultValue={teacher?.subject_id ?? ''} className={ui.select}>
              <option value="">Not set</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={teacher?.status ?? 'active'} className={ui.select}>
              {Object.entries(TEACHER_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Lowest year group">
            <select name="year_min" defaultValue={teacher?.year_min ?? ''} className={ui.select}>
              <option value="">Any</option>
              {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </Field>
          <Field label="Highest year group">
            <select name="year_max" defaultValue={teacher?.year_max ?? ''} className={ui.select}>
              <option value="">Any</option>
              {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </Field>
          <Field label="Joined on">
            <input name="joined_on" type="date" defaultValue={teacher?.joined_on ?? ''} className={ui.input} />
          </Field>
          <Field label="Notes" full>
            <textarea name="notes" defaultValue={teacher?.notes ?? ''} className={ui.textarea} />
          </Field>
        </div>
      </section>

      <div className={ui.formActions}>
        <button className={ui.primaryButton}>{teacher ? 'Save changes' : 'Add teacher'}</button>
        <Link href="/teachers" className={ui.button}>Cancel</Link>
      </div>
    </form>
  );
}
