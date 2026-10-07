import Link from 'next/link';
import { Field } from '@/components/Field';
import ui from '@/components/ui.module.css';
import { STUDENT_STATUSES, todayInUk, YEARS } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { saveStudent } from './actions';

export type Student = {
  id: string;
  first_name: string;
  last_name: string;
  year_group: number;
  school: string | null;
  date_of_birth: string | null;
  status: string;
  start_date: string;
};
export type Guardian = { full_name: string; relationship: string | null; phone: string | null; email: string | null };
export type Enrolment = { id: string; subject_id: string; teacher_id: string | null; batch_id: string | null };

type Options = Awaited<ReturnType<typeof loadStudentFormOptions>>;

// The choices the form needs: subjects, teachers (not left) and open batches.
export async function loadStudentFormOptions() {
  const supabase = await createClient();
  const [{ data: subjects }, { data: teachers }, { data: batches }] = await Promise.all([
    supabase.from('subjects').select('id, name, active').order('sort'),
    supabase.from('teachers').select('id, first_name, last_name, subject_id').neq('status', 'left').order('first_name'),
    supabase
      .from('batch_list')
      .select('id, code, subject_id, year_group, schedule, member_count, capacity')
      .is('closed_on', null)
      .order('code'),
  ]);
  return { subjects: subjects ?? [], teachers: teachers ?? [], batches: batches ?? [] };
}

type Props = {
  student?: Student;
  guardian?: Guardian | null;
  enrolments?: Enrolment[];
  folderUrl?: string | null;
  options: Options;
};

// Used by "Add student" (no student) and the student page.
export function StudentForm({ student, guardian, enrolments = [], folderUrl, options }: Props) {
  const bySubject = new Map(enrolments.map((e) => [e.subject_id, e]));
  // Active subjects, plus any switched-off subject this student still takes.
  const subjects = options.subjects.filter((s) => s.active || bySubject.has(s.id));

  return (
    <form action={saveStudent} className={ui.form}>
      {student && <input type="hidden" name="id" value={student.id} />}

      <section className={ui.card}>
        <h2>Student</h2>
        <div className={ui.fieldGrid}>
          <Field label="First name">
            <input name="first_name" required defaultValue={student?.first_name} className={ui.input} />
          </Field>
          <Field label="Last name">
            <input name="last_name" required defaultValue={student?.last_name} className={ui.input} />
          </Field>
          <Field label="Year group">
            <select name="year_group" required defaultValue={student?.year_group ?? ''} className={ui.select}>
              <option value="" disabled>Choose…</option>
              {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </Field>
          <Field label="School">
            <input name="school" defaultValue={student?.school ?? ''} className={ui.input} />
          </Field>
          <Field label="Date of birth">
            <input name="date_of_birth" type="date" defaultValue={student?.date_of_birth ?? ''} className={ui.input} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={student?.status ?? 'active'} className={ui.select}>
              {Object.entries(STUDENT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Start date">
            <input name="start_date" type="date" defaultValue={student?.start_date ?? todayInUk()} className={ui.input} />
          </Field>
        </div>
      </section>

      <section className={ui.card}>
        <h2>Main parent or guardian</h2>
        <div className={ui.fieldGrid}>
          <Field label="Full name">
            <input name="guardian_name" defaultValue={guardian?.full_name ?? ''} className={ui.input} />
          </Field>
          <Field label="Relationship">
            <input name="guardian_relationship" placeholder="e.g. Mother" defaultValue={guardian?.relationship ?? ''} className={ui.input} />
          </Field>
          <Field label="Phone">
            <input name="guardian_phone" type="tel" defaultValue={guardian?.phone ?? ''} className={ui.input} />
          </Field>
          <Field label="Email">
            <input name="guardian_email" type="email" defaultValue={guardian?.email ?? ''} className={ui.input} />
          </Field>
        </div>
      </section>

      <section className={ui.card}>
        <h2>Subjects</h2>
        <p className={ui.hint}>
          Tick each subject the student takes. Choosing a batch also sets the teacher. Unticking a subject ends it.
        </p>
        {subjects.map((s) => {
          const e = bySubject.get(s.id);
          return (
            <div key={s.id} className={ui.subjectRow}>
              <label className={ui.check}>
                <input type="checkbox" name="enrol" value={s.id} defaultChecked={!!e} /> {s.name}
              </label>
              {e && <input type="hidden" name={`enrolment_id_${s.id}`} value={e.id} />}
              <select name={`batch_${s.id}`} defaultValue={e?.batch_id ?? ''} className={ui.select} aria-label={`${s.name} batch`}>
                <option value="">No batch yet</option>
                {options.batches.filter((b) => b.subject_id === s.id).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · Year {b.year_group} · {b.schedule ?? 'no times'} ({b.member_count}/{b.capacity})
                  </option>
                ))}
              </select>
              <select name={`teacher_${s.id}`} defaultValue={e?.teacher_id ?? ''} className={ui.select} aria-label={`${s.name} teacher`}>
                <option value="">No teacher yet</option>
                {options.teachers.filter((t) => !t.subject_id || t.subject_id === s.id).map((t) => (
                  <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                ))}
              </select>
            </div>
          );
        })}
      </section>

      <section className={ui.card}>
        <h2>Student folder</h2>
        <Field label="Link to the student's folder (e.g. Google Drive)">
          <input name="folder_url" type="url" placeholder="https://…" defaultValue={folderUrl ?? ''} className={ui.input} />
        </Field>
      </section>

      <div className={ui.formActions}>
        <button className={ui.primaryButton}>{student ? 'Save changes' : 'Add student'}</button>
        <Link href="/students" className={ui.button}>Cancel</Link>
      </div>
    </form>
  );
}
