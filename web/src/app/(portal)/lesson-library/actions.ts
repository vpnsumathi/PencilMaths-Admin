'use server';

import { revalidatePath } from 'next/cache';
import { redirectWith, text } from '@/lib/form';
import { findOrCreateFolder, trashFiles, uploadFile } from '@/lib/google/drive';
import { fileKind, MAX_BYTES } from '@/lib/homework/handin';
import { binNote, importCodesNote, usageReasons, type LessonUsage } from '@/lib/lessons/library';
import { cleanCode, readTermPlan } from '@/lib/lessons/plan';
import { readXlsx } from '@/lib/lessons/xlsx';
import { requireAdmin } from '@/lib/auth';
import { lessonCodePrefix, UUID, yearLabel, YEARS } from '@/lib/options';

const PATH = '/lesson-library';
const DELETE_SCRIPT = '20261125000001_lesson_library_delete.sql';
const lessonPath = (id: string) => `/lesson-library/${id}`;
const planPath = (subject: string, year: number, term = 1) =>
  `${PATH}?${new URLSearchParams({ subject, year: String(year), term: String(term) })}`;
// A database error, in words: "not set up yet" when the delete script hasn't been run on this database.
const notReady = (error: { code?: string }, fallback: string) =>
  error.code === 'PGRST202' ? `Not set up yet: run ${DELETE_SCRIPT} in Supabase first.` : fallback;

// Reads a "Term Lesson Plan - Year N" (or GCSE - H / GCSE - F) spreadsheet and saves its lessons and homework codes.
// Running it again with an updated spreadsheet updates the lessons. Lessons no longer in the spreadsheet are
// marked inactive (kept for their history, but no longer planned or shown in the plan); no lesson is deleted.
// An emptied Hw cell removes that homework code if it was never sent; a sent code is kept, and so is a sent code
// whose cell now says another code (guide 14, section 13). Their worksheets go to the Drive bin when nothing uses them.
// The optional "Class No." column is saved for the Lesson Tracker.
export async function importLessonPlan(form: FormData) {
  const subject = text(form, 'subject_id');
  const year = Number(text(form, 'year_group'));
  const file = form.get('plan');
  if (!subject) redirectWith(PATH, 'error', 'Choose a subject.');
  if (!YEARS.includes(year)) redirectWith(PATH, 'error', 'Choose a year group.');
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
  const prefix = lessonCodePrefix(year); // Y5-, or GH- / GF- for GCSE - H / GCSE - F
  const wrongYear = plan.lessons.find((l) => !l.code.startsWith(prefix));
  if (wrongYear) redirectWith(PATH, 'error', `Nothing imported. Lesson ${wrongYear.code} isn't a ${yearLabel(year)} code (${prefix}…).`);

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('import_lessons', { p_subject: subject, p_year: year, p_lessons: plan.lessons });
  if (error) {
    console.error('importLessonPlan failed:', error.message);
    redirectWith(PATH, 'error', error.code === '23505'
      ? 'Nothing imported: a homework code is already used by another lesson.'
      : 'Could not import the lesson plan.');
  }
  // dropped / kept / bin come from 20261125000001_lesson_library_delete.sql; before it, they are missing.
  const r = data as { added: number; updated: number; sheets: number; removed?: number; dropped?: number; kept?: string[]; bin?: string[] };
  const bin = r.bin?.length ? await trashFiles(r.bin) : null;
  const modules = new Set(plan.lessons.map((l) => l.module)).size;
  const terms = new Set(plan.lessons.map((l) => l.term)).size;
  const withClass = plan.lessons.filter((l) => l.class_no != null).length;
  const extra = [
    withClass ? `${withClass} lessons have a Class No.` : '',
    r.removed ? `${r.removed} lesson(s) no longer in the spreadsheet are now marked "Removed from the plan".` : '',
    importCodesNote(r.dropped ?? 0, r.kept ?? []),
    binNote(bin),
    plan.warnings.length ? `Check: ${plan.warnings.slice(0, 3).join(' ')}` : '',
  ].filter(Boolean).join(' ');

  revalidatePath(PATH);
  redirectWith(`${back}&term=1`, 'ok',
    `Imported ${yearLabel(year)}: ${terms} term(s), ${modules} modules, ${plan.lessons.length} lessons ` +
    `(${r.added} new, ${r.updated} updated) and ${r.sheets} homework codes. ${extra ? `${extra} ` : ''}Now upload the worksheets.`);
}

export type UploadResult = { ok: true; code: string } | { ok: false; error: string };

// Uploads one worksheet. Its file name gives its homework code: "Y5 - A001.pdf" is Y5-A001 (GCSE: "GH - A001.pdf").
// Called once per file from the page, so each request stays small. A worksheet it replaces goes to the Drive bin,
// unless homework already sent still uses that file.
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
    .select('id, drive_file_id, lessons(year_group, subjects(name))')
    .eq('code', code)
    .maybeSingle();
  if (!hw) return { ok: false, error: `No homework with code ${code}. Import the lesson plan first.` };
  const lesson = hw.lessons as unknown as { year_group: number; subjects: { name: string } };

  let replaced: string | null = null;
  try {
    // PencilMaths / Homework library / Maths Year 5 (or Maths GCSE - H)
    const root = await findOrCreateFolder('PencilMaths');
    const library = await findOrCreateFolder('Homework library', root.id);
    const folder = await findOrCreateFolder(`${lesson.subjects.name} ${yearLabel(lesson.year_group)}`, library.id);
    const uploaded = await uploadFile(folder.id, `${code}.${kind.ext}`, kind.type, await file.arrayBuffer());
    const { error } = await supabase
      .from('lesson_homework')
      .update({ drive_file_id: uploaded.id, url: uploaded.webViewLink, file_name: `${code}.${kind.ext}`, uploaded_at: new Date().toISOString() })
      .eq('id', hw.id);
    if (error) throw new Error(error.message);
    if (hw.drive_file_id && hw.drive_file_id !== uploaded.id) replaced = hw.drive_file_id;
  } catch (e) {
    console.error('uploadWorksheet failed:', e);
    return { ok: false, error: 'Could not upload to Google Drive.' };
  }
  if (replaced) await binReplaced(supabase, replaced);
  revalidatePath(PATH);
  return { ok: true, code };
}

// The old file of a replaced worksheet goes to the Drive bin if nothing points at it any more. Best effort: the new
// worksheet is saved whatever happens here (before the delete script has run, the old file just stays in Drive).
async function binReplaced(supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase'], fileId: string) {
  const { data, error } = await supabase.rpc('lesson_files_unused', { p_files: [fileId] });
  if (error) {
    if (error.code !== 'PGRST202') console.error('uploadWorksheet: could not check the old file:', error.message);
    return;
  }
  if ((data as string[] | null)?.length) await trashFiles(data as string[]);
}

/* ---------- Deleting (guide 14, section 13) ----------
   Only admins. The database decides what may go: anything a class has used stays (progress, sent homework, class
   notes, Lesson Tracker dates, question bank work), and each function checks again at the moment of the delete,
   so a page left open can't delete something that has just been used. The page only shows the buttons that apply. */

type DeleteLessonResult = {
  deleted: boolean; missing?: boolean; code?: string; name?: string; usage?: LessonUsage;
  subject_id?: string; year_group?: number; term?: number; bin?: string[];
};

// Deletes one lesson with its homework codes; its worksheets go to the Drive bin when nothing else uses them.
export async function deleteLesson(form: FormData) {
  const id = text(form, 'lesson_id');
  if (!UUID.test(id)) redirectWith(PATH, 'error', 'Lesson not found.');
  const { supabase, viewer } = await requireAdmin();
  const { data, error } = await supabase.rpc('delete_lesson', { p_lesson: id });
  if (error) {
    console.error('deleteLesson failed:', error.message);
    redirectWith(lessonPath(id), 'error', notReady(error, 'Could not delete the lesson. Nothing was changed.'));
  }
  const r = data as DeleteLessonResult;
  if (r.missing) redirectWith(PATH, 'error', 'That lesson is no longer in the library (it may have just been deleted).');
  if (!r.deleted) {
    const why = r.usage ? usageReasons(r.usage).join('; ') : 'a class has used it';
    redirectWith(lessonPath(id), 'error', `${r.code} can't be deleted: ${why}. Nothing was changed.`);
  }
  console.info(`Lesson library: ${viewer.fullName} deleted lesson ${r.code}.`);
  const bin = r.bin?.length ? await trashFiles(r.bin) : null;
  revalidatePath(PATH);
  redirectWith(planPath(r.subject_id ?? '', r.year_group ?? 0, r.term ?? 1), 'ok',
    `Deleted ${r.code} ${r.name} and its homework codes. ${binNote(bin)} ` +
    'If it is still in the spreadsheet, the next import adds it back.');
}

// Deletes one homework code (Hw-1, Hw-2 or Hw-3) from a lesson, if it was never sent.
export async function deleteLessonHomework(form: FormData) {
  const id = text(form, 'homework_id');
  const lessonId = text(form, 'lesson_id');
  if (!UUID.test(id) || !UUID.test(lessonId)) redirectWith(PATH, 'error', 'Homework code not found.');
  const { supabase, viewer } = await requireAdmin();
  const { data, error } = await supabase.rpc('delete_lesson_homework', { p_homework: id });
  if (error) {
    console.error('deleteLessonHomework failed:', error.message);
    redirectWith(lessonPath(lessonId), 'error', notReady(error, 'Could not delete the homework code. Nothing was changed.'));
  }
  const r = data as { deleted: boolean; missing?: boolean; code?: string; slot?: number; sent?: string[]; question_bank?: number; bin?: string[] };
  if (r.missing) redirectWith(lessonPath(lessonId), 'error', 'That homework code is no longer in the library.');
  if (!r.deleted) {
    const why = r.sent?.length ? `it has been sent to ${r.sent.join(', ')}` : 'the question bank has work on it';
    redirectWith(lessonPath(lessonId), 'error', `${r.code} can't be deleted: ${why}. Nothing was changed.`);
  }
  console.info(`Lesson library: ${viewer.fullName} deleted homework code ${r.code}.`);
  const bin = r.bin?.length ? await trashFiles(r.bin) : null;
  revalidatePath(PATH);
  revalidatePath(lessonPath(lessonId));
  redirectWith(lessonPath(lessonId), 'ok',
    `Deleted homework code ${r.code} (Hw-${r.slot}). ${binNote(bin)} If it is still in the spreadsheet, the next import adds it back.`);
}

// Takes the worksheet off a homework code. Homework already sent keeps its link to the file, so then the file stays
// in Drive; otherwise it goes to the Drive bin.
export async function removeWorksheet(form: FormData) {
  const id = text(form, 'homework_id');
  const lessonId = text(form, 'lesson_id');
  if (!UUID.test(id) || !UUID.test(lessonId)) redirectWith(PATH, 'error', 'Homework code not found.');
  const { supabase, viewer } = await requireAdmin();
  const { data, error } = await supabase.rpc('remove_lesson_worksheet', { p_homework: id });
  if (error) {
    console.error('removeWorksheet failed:', error.message);
    redirectWith(lessonPath(lessonId), 'error', notReady(error, 'Could not remove the worksheet. Nothing was changed.'));
  }
  const r = data as { removed: boolean; missing?: boolean; none?: boolean; code?: string; bin?: string[]; kept_in_drive?: boolean };
  if (r.missing) redirectWith(lessonPath(lessonId), 'error', 'That homework code is no longer in the library.');
  if (!r.removed) redirectWith(lessonPath(lessonId), 'ok', `${r.code} has no worksheet now.`);
  console.info(`Lesson library: ${viewer.fullName} removed the worksheet of ${r.code}.`);
  const bin = r.bin?.length ? await trashFiles(r.bin) : null;
  revalidatePath(PATH);
  revalidatePath(lessonPath(lessonId));
  redirectWith(lessonPath(lessonId), 'ok',
    `Removed the worksheet of ${r.code}. ` +
    (r.kept_in_drive ? 'The file stays in Google Drive because homework already sent uses it. ' : binNote(bin)) +
    ' Upload a new one before sending it again.');
}

// Deletes a whole subject + year plan (every term), only when no lesson in it has been used.
export async function deleteLessonPlan(form: FormData) {
  const subject = text(form, 'subject_id');
  const year = Number(text(form, 'year_group'));
  if (!subject || !YEARS.includes(year)) redirectWith(PATH, 'error', 'Plan not found.');
  const back = planPath(subject, year);
  if (form.get('sure') !== 'yes') redirectWith(back, 'error', 'Tick the box to confirm, then press Delete plan.');
  const { supabase, viewer } = await requireAdmin();
  const [{ data, error }, { data: subjectRow }] = await Promise.all([
    supabase.rpc('delete_lesson_plan', { p_subject: subject, p_year: year }),
    supabase.from('subjects').select('name').eq('id', subject).maybeSingle(),
  ]);
  if (error) {
    console.error('deleteLessonPlan failed:', error.message);
    redirectWith(back, 'error', notReady(error, 'Could not delete the plan. Nothing was changed.'));
  }
  const r = data as { deleted: boolean; missing?: boolean; lessons?: number; used?: number; batches?: string[]; homework?: number; bin?: string[] };
  const name = `${subjectRow?.name ?? subject} ${yearLabel(year)}`;
  if (r.missing) redirectWith(PATH, 'error', `There is no ${name} plan to delete.`);
  if (!r.deleted) {
    redirectWith(back, 'error',
      `The ${name} plan can't be deleted: ${r.used} of ${r.lessons} lessons have been used` +
      `${r.batches?.length ? ` by ${r.batches.join(', ')}` : ''}. Nothing was changed.`);
  }
  console.info(`Lesson library: ${viewer.fullName} deleted the ${name} plan (${r.lessons} lessons).`);
  const bin = r.bin?.length ? await trashFiles(r.bin) : null;
  revalidatePath(PATH);
  redirectWith(PATH, 'ok', `Deleted the ${name} plan: ${r.lessons} lessons and ${r.homework} homework codes. ${binNote(bin)}`);
}
