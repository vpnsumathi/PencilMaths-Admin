import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import { Field } from '@/components/Field';
import ui from '@/components/ui.module.css';
import { requireAdmin } from '@/lib/auth';
import { YEARS } from '@/lib/options';
import { importLessonPlan } from './actions';
import { WorksheetUpload } from './WorksheetUpload';

export const metadata = { title: 'Lesson library' };

type Props = { searchParams: Promise<{ ok?: string; error?: string; subject?: string; year?: string; term?: string }> };
type Homework = { slot: number; code: string; url: string | null; file_name: string | null };
type Lesson = { id: string; module: string; code: string; name: string; position: number; lesson_homework: Homework[] };

// Admin only: import each year's lesson plan (terms, modules, lessons, Hw-1/2/3 codes) and upload the worksheets.
export default async function LessonLibraryPage({ searchParams }: Props) {
  const { ok, error: problem, ...pick } = await searchParams;
  const { supabase } = await requireAdmin();

  const [{ data: subjects }, { data: plans }] = await Promise.all([
    supabase.from('subjects').select('id, name').eq('active', true).order('sort'),
    supabase.from('lessons').select('subject_id, year_group, term'),
  ]);
  // The subject + year combinations already imported, e.g. Maths Year 5.
  const imported = [...new Map((plans ?? []).map((p) => [`${p.subject_id}|${p.year_group}`, p])).values()]
    .sort((a, b) => a.subject_id.localeCompare(b.subject_id) || a.year_group - b.year_group);
  const subject = pick.subject ?? imported[0]?.subject_id ?? 'maths';
  const year = Number(pick.year) || imported[0]?.year_group || 5;
  const term = Number(pick.term) || 1;
  const terms = [...new Set((plans ?? []).filter((p) => p.subject_id === subject && p.year_group === year).map((p) => p.term))].sort();

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, module, code, name, position, lesson_homework(slot, code, url, file_name)')
    .eq('subject_id', subject).eq('year_group', year).eq('term', term)
    .order('position');
  const rows = (lessons ?? []) as Lesson[];
  const allHw = rows.flatMap((l) => l.lesson_homework);
  const ready = allHw.filter((h) => h.url).length;
  const subjectName = (subjects ?? []).find((s) => s.id === subject)?.name ?? subject;
  const link = (p: Record<string, string | number>) =>
    `/lesson-library?${new URLSearchParams({ subject, year: String(year), term: String(term), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Lesson library</h1>
          <p className={ui.subtitle}>Each year&apos;s terms, modules and lessons, with the three homework worksheets for every lesson.</p>
        </div>
      </div>
      <Alerts ok={ok} problem={problem} />

      <div className={ui.columns}>
        <section className={ui.card}>
          <h2>1. Import a lesson plan</h2>
          <p className={ui.muted}>
            The &quot;Term Lesson Plan - Year N&quot; spreadsheet: sheets <strong>Term 1</strong>, <strong>Term 2</strong>, <strong>Term 3</strong> with
            columns Module, Lesson Code, Lesson, Hw - 1, Hw - 2, Hw - 3. Importing again updates it; nothing is deleted.
          </p>
          <form action={importLessonPlan} className={ui.fieldGrid}>
            <Field label="Subject">
              <select name="subject_id" defaultValue={subject} className={ui.input}>
                {(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Year group">
              <select name="year_group" defaultValue={year} className={ui.input}>
                {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </Field>
            <Field label="Spreadsheet (.xlsx)" full>
              <input name="plan" type="file" required accept=".xlsx" className={ui.input} />
            </Field>
            <div className={`${ui.formActions} ${ui.full}`}>
              <button className={ui.primaryButton}>Import</button>
            </div>
          </form>
        </section>

        <section className={ui.card}>
          <h2>2. Upload worksheets</h2>
          <p className={ui.muted}>
            Choose all the PDFs at once. Each file name must be its homework code, e.g. <strong>Y5 - A001.pdf</strong>.
            They go to Google Drive › PencilMaths › Homework library. Uploading a file again replaces it.
          </p>
          <WorksheetUpload />
        </section>
      </div>

      <section className={ui.card} style={{ marginTop: 16 }}>
        <h2>{subjectName} · Year {year}</h2>
        {imported.length > 1 && (
          <p className={ui.formActions}>
            {imported.map((p) => (
              <Link key={`${p.subject_id}${p.year_group}`} className={ui.link}
                href={`/lesson-library?subject=${p.subject_id}&year=${p.year_group}&term=1`}>
                {(subjects ?? []).find((s) => s.id === p.subject_id)?.name ?? p.subject_id} Year {p.year_group}
              </Link>
            ))}
          </p>
        )}
        {terms.length === 0 ? (
          <p className={ui.empty}>Nothing imported for {subjectName} Year {year} yet.</p>
        ) : (
          <>
            <div className={ui.formActions} style={{ marginBottom: 12 }}>
              {terms.map((t) => (
                <Link key={t} href={link({ term: t })} className={t === term ? ui.primaryButton : ui.button}>Term {t}</Link>
              ))}
              <span className={ui.muted}>{rows.length} lessons · {ready} of {allHw.length} worksheets uploaded</span>
            </div>
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead><tr><th>Module</th><th>Code</th><th>Lesson</th><th>Hw-1</th><th>Hw-2</th><th>Hw-3</th></tr></thead>
                <tbody>
                  {rows.map((l, i) => (
                    <tr key={l.id}>
                      <td>{i === 0 || rows[i - 1].module !== l.module ? <strong>{l.module}</strong> : ''}</td>
                      <td>{l.code}</td>
                      <td>{l.name}</td>
                      {[1, 2, 3].map((slot) => {
                        const h = l.lesson_homework.find((x) => x.slot === slot);
                        if (!h) return <td key={slot}>—</td>;
                        return (
                          <td key={slot}>
                            {h.url
                              ? <a href={h.url} target="_blank" rel="noreferrer" className={ui.link} title={h.file_name ?? ''}>✅ {h.code}</a>
                              : <span className={ui.muted} title="No worksheet uploaded yet">⚠️ {h.code}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
