'use server';

import { revalidatePath } from 'next/cache';
import { redirectWith, text } from '@/lib/form';
import { findOrCreateFolder, uploadFile } from '@/lib/google/drive';
import { fileKind, MAX_BYTES } from '@/lib/homework/handin';
import { cleanCode, readTermPlan } from '@/lib/lessons/plan';
import { readXlsx } from '@/lib/lessons/xlsx';
import { requireAdmin } from '@/lib/auth';

const PATH = '/lesson-library';

// Reads a "Term Lesson Plan - Year N" spreadsheet and saves its lessons and homework codes.
// Running it again with an updated spreadsheet updates the lessons; nothing is deleted.
export async function importLessonPlan(form: FormData) {
  const subject = text(form, 'subject_id');
  const year = Number(text(form, 'year_group'));
  const file = form.get('plan');
  if (!subject) redirectWith(PATH, 'error', 'Choose a subject.');
  if (!(year >= 1 && year <= 13)) redirectWith(PATH, 'error', 'Choose a year group.');
  if (!(file instanceof File) || file.size === 0 || !/\.xlsx$/i.test(file.name)) {
    redirectWith(PATH, 'error', 'Choose the lesson plan spreadsheet (.xlsx).');
  }
  const back = `${PATH}?subject=${encodeURIComponent(subject)}&year=${year}`;

  let plan: ReturnType<typeof readTermPlan>;
  try {
    plan = readTermPlan(readXlsx(await file.arrayBuffer()));
  } catch (e) {
    console.error('importLessonPlan read failed:', e);
    redirectWith(PATH, 'error', 'Could not read that file. Save it from Excel as .xlsx and try again.');
  }
  if (plan.problems.length) redirectWith(PATH, 'error', `Nothing imported. ${plan.problems.slice(0, 5).join(' ')}`);
  const prefix = `Y${year}-`;
  const wrongYear = plan.lessons.find((l) => !l.code.startsWith(prefix));
  if (wrongYear) redirectWith(PATH, 'error', `Nothing imported. Lesson ${wrongYear.code} isn't a Year ${year} code (${prefix}…).`);

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('import_lessons', { p_subject: subject, p_year: year, p_lessons: plan.lessons });
  if (error) {
    console.error('importLessonPlan failed:', error.message);
    redirectWith(PATH, 'error', error.code === '23505'
      ? 'Nothing imported: a homework code is already used by another lesson.'
      : 'Could not import the lesson plan.');
  }
  const r = data as { added: number; updated: number; sheets: number };
  const modules = new Set(plan.lessons.map((l) => l.module)).size;
  const terms = new Set(plan.lessons.map((l) => l.term)).size;

  revalidatePath(PATH);
  redirectWith(`${back}&term=1`, 'ok',
    `Imported Year ${year}: ${terms} term(s), ${modules} modules, ${plan.lessons.length} lessons ` +
    `(${r.added} new, ${r.updated} updated) and ${r.sheets} homework codes. Now upload the worksheets.`);
}

export type UploadResult = { ok: true; code: string } | { ok: false; error: string };

// Uploads one worksheet. Its file name gives its homework code: "Y5 - A001.pdf" is Y5-A001.
// Called once per file from the page, so each request stays small.
export async function uploadWorksheet(form: FormData): Promise<UploadResult> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No file.' };
  const code = cleanCode(file.name.replace(/\.[^.]+$/, ''));
  const kind = fileKind(file);
  if (!kind) return { ok: false, error: 'Only PDF, Word files and photos.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'Too big (4 MB max).' };

  const { supabase } = await requireAdmin();
  const { data: hw } = await supabase
    .from('lesson_homework')
    .select('id, lessons(year_group, subjects(name))')
    .eq('code', code)
    .maybeSingle();
  if (!hw) return { ok: false, error: `No homework with code ${code}. Import the lesson plan first.` };
  const lesson = hw.lessons as unknown as { year_group: number; subjects: { name: string } };

  try {
    // PencilMaths / Homework library / Maths Year 5
    const root = await findOrCreateFolder('PencilMaths');
    const library = await findOrCreateFolder('Homework library', root.id);
    const folder = await findOrCreateFolder(`${lesson.subjects.name} Year ${lesson.year_group}`, library.id);
    const uploaded = await uploadFile(folder.id, `${code}.${kind.ext}`, kind.type, await file.arrayBuffer());
    const { error } = await supabase
      .from('lesson_homework')
      .update({ drive_file_id: uploaded.id, url: uploaded.webViewLink, file_name: `${code}.${kind.ext}`, uploaded_at: new Date().toISOString() })
      .eq('id', hw.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error('uploadWorksheet failed:', e);
    return { ok: false, error: 'Could not upload to Google Drive.' };
  }
  revalidatePath(PATH);
  return { ok: true, code };
}
