import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Field } from '@/components/Field';
import ui from '@/components/ui.module.css';
import { requireAdmin } from '@/lib/auth';
import { usedByClasses, type LessonUsage } from '@/lib/lessons/library';
import { yearLabel, YEARS } from '@/lib/options';
import { deleteLessonPlan, importLessonPlan } from './actions';
import { WorksheetUpload } from './WorksheetUpload';

export const metadata = { title: 'Lesson library' };
// Importing, replacing a worksheet or deleting a plan can move worksheets to the Google Drive bin, a moment per file.
export const maxDuration = 60;

type Props = { searchParams: Promise<{ ok?: string; error?: string; subject?: string; year?: string; term?: string }> };
type Homework = { slot: number; code: string; url: string | null; file_name: string | null };
type Lesson = {
  id: string; module: string; code: string; name: string; position: number; lesson_homework: Homework[];
  class_no?: number | null; active?: boolean;
};

// Admin only: import each year's lesson plan (terms, modules, lessons, Hw-1/2/3 codes) and upload the worksheets.
// Each lesson's code opens its own page (lesson-library/[id]) with where it is used and its deletes; a whole
// subject + year plan can be deleted at the bottom while no class has used any of it (guide 14, section 13).
export default async function LessonLibraryPage({ searchParams }: Props) {
  const { ok, error: problem, ...pick } = await searchParams;
  const { supabase } = await requireAdmin();

  const [{ data: subjects }, { data: plans }] = await Promise.all([
    supabase.from('subjects').select('id, name').eq('active', true).order('sort'),
    supabase.from('lessons').select('id, subject_id, year_group, term'),
  ]);
  // The subject + year combinations already imported, e.g. Maths Year 5.
  const imported = [...new Map((plans ?? []).map((p) => [`${p.subject_id}|${p.year_group}`, p])).values()]
    .sort((a, b) => a.subject_id.localeCompare(b.subject_id) || a.year_group - b.year_group);
  const subject = pick.subject ?? imported[0]?.subject_id ?? 'maths';
  const year = Number(pick.year) || imported[0]?.year_group || 5;
  const term = Number(pick.term) || 1;
  const terms = [...new Set((plans ?? []).filter((p) => p.subject_id === subject && p.year_group === year).map((p) => p.term))].sort();

  // Class No. and Removed come from 20261119000001_lesson_tracker.sql; before it has run, the page shows the
  // lessons without them.
  const lessonQuery = (columns: string) => supabase
    .from('lessons')
    .select(`id, module, code, name, position, ${columns}lesson_homework(slot, code, url, file_name)`)
    .eq('subject_id', subject).eq('year_group', year).eq('term', term)
    .order('position');
  const first = await lessonQuery('class_no, active, ');
  const trackerReady = !first.error;
  const lessons = trackerReady ? first.data : (await lessonQuery('')).data;
  const rows = (lessons ?? []) as unknown as Lesson[];
  const hasClassNo = rows.some((l) => l.class_no != null);
  const removedCount = rows.filter((l) => l.active === false).length;
  const allHw = rows.flatMap((l) => l.lesson_homework);
  const ready = allHw.filter((h) => h.url).length;
  const subjectName = (subjects ?? []).find((s) => s.id === subject)?.name ?? subject;
  // Every lesson of this subject + year (all terms), and which of them classes have used, for Delete plan.
  // Before 20261125000001_lesson_library_delete.sql has run, there is no usage and no Delete plan.
  const planIds = (plans ?? []).filter((p) => p.subject_id === subject && p.year_group === year).map((p) => p.id);
  const usageRes = planIds.length ? await supabase.rpc('lesson_usage', { p_lessons: planIds }) : null;
  const usage = usageRes && !usageRes.error ? (usageRes.data ?? []) as LessonUsage[] : null;
  const usedCount = usage?.filter((u) => u.used).length ?? 0;
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
            columns Module, Lesson Code, Lesson, Hw - 1, Hw - 2, Hw - 3, and <strong>Class No.</strong> (<code>Class 1</code>, <code>Class 2</code> …,
            used by the Lesson Tracker; lessons with the same Class No. are taught in the same class, and an empty cell means no class date).
            Lesson codes start with the year: <code>Y5-</code>, or <code>GH-</code> for GCSE - H and <code>GF-</code> for GCSE - F.
            Importing again updates it. Lessons no longer in the spreadsheet are marked &quot;Removed from the plan&quot; and keep their history.
            An emptied Hw cell removes that homework code if it was never sent; a sent code always stays.
          </p>
          <form action={importLessonPlan} className={ui.fieldGrid}>
            <Field label="Subject">
              <select name="subject_id" defaultValue={subject} className={ui.input}>
                {(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Year group">
              <select name="year_group" defaultValue={year} className={ui.input}>
                {YEARS.map((y) => <option key={y} value={y}>{yearLabel(y)}</option>)}
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
        <h2>{subjectName} · {yearLabel(year)}</h2>
        {imported.length > 1 && (
          <p className={ui.formActions}>
            {imported.map((p) => (
              <Link key={`${p.subject_id}${p.year_group}`} className={ui.link}
                href={`/lesson-library?subject=${p.subject_id}&year=${p.year_group}&term=1`}>
                {(subjects ?? []).find((s) => s.id === p.subject_id)?.name ?? p.subject_id} {yearLabel(p.year_group)}
              </Link>
            ))}
          </p>
        )}
        {terms.length === 0 ? (
          <p className={ui.empty}>Nothing imported for {subjectName} {yearLabel(year)} yet.</p>
        ) : (
          <>
            <div className={ui.formActions} style={{ marginBottom: 12 }}>
              {terms.map((t) => (
                <Link key={t} href={link({ term: t })} className={t === term ? ui.primaryButton : ui.button}>Term {t}</Link>
              ))}
              <span className={ui.muted}>
                {rows.length - removedCount} lessons · {ready} of {allHw.length} worksheets uploaded
                {removedCount > 0 && <> · {removedCount} removed from the plan</>}
              </span>
            </div>
            <p className={ui.muted}>Click a lesson&apos;s code to see where classes have used it, remove a worksheet or delete it.</p>
            {trackerReady && !hasClassNo && (
              <p className={ui.muted}>No lesson in this term has a Class No. Add a <strong>Class No.</strong> column to the spreadsheet
                and import it again to use the Lesson Tracker.</p>
            )}
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead><tr><th>Module</th><th>Code</th><th>Lesson</th><th>Hw-1</th><th>Hw-2</th><th>Hw-3</th>{trackerReady && <th>Class No.</th>}</tr></thead>
                <tbody>
                  {rows.map((l, i) => (
                    <tr key={l.id} className={l.active === false ? ui.muted : undefined}>
                      <td>{i === 0 || rows[i - 1].module !== l.module ? <strong>{l.module}</strong> : ''}</td>
                      <td><Link href={`/lesson-library/${l.id}`} className={ui.link}>{l.code}</Link></td>
                      <td>{l.name}{l.active === false && <> <em>(removed from the plan)</em></>}</td>
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
                      {trackerReady && <td>{l.class_no != null ? `Class ${l.class_no}` : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {usage && (usedCount > 0 ? (
              <div className={ui.dangerZone}>
                <p>
                  The {subjectName} {yearLabel(year)} plan can&apos;t be deleted: {usedCount} of {planIds.length} lessons have been used
                  by {usedByClasses(usage).join(', ') || 'the question bank'}. Lessons no class has used can still be deleted one by one from their own page.
                </p>
              </div>
            ) : (
              <form action={deleteLessonPlan} className={ui.dangerZone}>
                <input type="hidden" name="subject_id" value={subject} />
                <input type="hidden" name="year_group" value={year} />
                <label className={ui.check}>
                  <input type="checkbox" name="sure" value="yes" required />
                  {' '}Delete all {planIds.length} lessons of {subjectName} {yearLabel(year)} (every term) with their homework codes.
                  No class has used any of them. Worksheets go to the Google Drive bin.
                </label>
                <ConfirmButton className={ui.dangerButton} message={`Delete the whole ${subjectName} ${yearLabel(year)} plan (${planIds.length} lessons)? `
                  + 'You can import the spreadsheet again afterwards.'}>
                  Delete plan
                </ConfirmButton>
              </form>
            ))}
          </>
        )}
      </section>
    </>
  );
}
