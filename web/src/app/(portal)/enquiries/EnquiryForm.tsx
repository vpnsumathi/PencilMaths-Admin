import Link from 'next/link';
import { Field } from '@/components/Field';
import ui from '@/components/ui.module.css';
import { YEARS } from '@/lib/options';
import { saveEnquiry } from './actions';

export type Enquiry = {
  id: string;
  child_first_name: string;
  child_last_name: string;
  year_group: number;
  school: string | null;
  source: string | null;
  parent_name: string;
  parent_relationship: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  assessment_score: number | null;
  assessment_comments: string | null;
  subject_ids: string[];
};
type Subject = { id: string; name: string };

// Used by "Add enquiry" (no enquiry) and the enquiry page.
export function EnquiryForm({ enquiry, subjects }: { enquiry?: Enquiry; subjects: Subject[] }) {
  return (
    <form action={saveEnquiry} className={ui.form}>
      {enquiry && <input type="hidden" name="id" value={enquiry.id} />}

      <section className={ui.card}>
        <h2>Child</h2>
        <div className={ui.fieldGrid}>
          <Field label="First name">
            <input name="child_first_name" required defaultValue={enquiry?.child_first_name} className={ui.input} />
          </Field>
          <Field label="Last name">
            <input name="child_last_name" required defaultValue={enquiry?.child_last_name} className={ui.input} />
          </Field>
          <Field label="Year group">
            <select name="year_group" required defaultValue={enquiry?.year_group ?? ''} className={ui.select}>
              <option value="" disabled>Choose…</option>
              {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </Field>
          <Field label="School">
            <input name="school" defaultValue={enquiry?.school ?? ''} className={ui.input} />
          </Field>
          <Field label="How did they hear about us?">
            <input name="source" placeholder="e.g. Google, friend" defaultValue={enquiry?.source ?? ''} className={ui.input} />
          </Field>
        </div>
      </section>

      <section className={ui.card}>
        <h2>Parent or guardian</h2>
        <div className={ui.fieldGrid}>
          <Field label="Full name">
            <input name="parent_name" required defaultValue={enquiry?.parent_name} className={ui.input} />
          </Field>
          <Field label="Relationship">
            <input name="parent_relationship" placeholder="e.g. Mother" defaultValue={enquiry?.parent_relationship ?? ''} className={ui.input} />
          </Field>
          <Field label="Phone">
            <input name="parent_phone" type="tel" defaultValue={enquiry?.parent_phone ?? ''} className={ui.input} />
          </Field>
          <Field label="Email">
            <input name="parent_email" type="email" defaultValue={enquiry?.parent_email ?? ''} className={ui.input} />
          </Field>
        </div>
      </section>

      <section className={ui.card}>
        <h2>Subjects wanted</h2>
        {subjects.map((s) => (
          <label key={s.id} className={ui.check} style={{ marginBottom: 8 }}>
            <input type="checkbox" name="subjects" value={s.id} defaultChecked={enquiry?.subject_ids.includes(s.id)} /> {s.name}
          </label>
        ))}
      </section>

      <section className={ui.card}>
        <h2>Assessment</h2>
        <div className={ui.fieldGrid}>
          <Field label="Score (%)">
            <input name="assessment_score" type="number" min={0} max={100} step="0.5" defaultValue={enquiry?.assessment_score ?? ''} className={ui.input} />
          </Field>
          <Field label="Comments" full>
            <textarea name="assessment_comments" defaultValue={enquiry?.assessment_comments ?? ''} className={ui.textarea} />
          </Field>
        </div>
      </section>

      <div className={ui.formActions}>
        <button className={ui.primaryButton}>{enquiry ? 'Save changes' : 'Add enquiry'}</button>
        <Link href="/enquiries" className={ui.button}>Cancel</Link>
      </div>
    </form>
  );
}