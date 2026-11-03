'use server';

import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth';
import { optional, optionalNumber, redirectWith, text } from '@/lib/form';
import { todayInUk, UUID, YEARS } from '@/lib/options';
import { uploadFile } from '@/lib/google/drive';
import { correctionName, recordCorrection, sendMarkedSheet, studentHomeworkFolder } from '@/lib/homework/corrections';
import { fileKind, MAX_BYTES } from '@/lib/homework/handin';
import { discardUploads, prepareSheetFiles } from '@/lib/homework/sheets';
import { createClient } from '@/lib/supabase/server';

// The message to show when a database function refused or failed.
// P0001 = a message raised on purpose (e.g. places lower than the students already in the batch): safe to show.
// PGRST202 = the function doesn't exist yet: the database script hasn't been run on this Supabase project.
function dbProblem(error: { code?: string; message: string }, fallback: string) {
  if (error.code === 'P0001') return error.message;
  if (error.code === 'PGRST202') return 'The database is not ready for this yet: run 20261103000001_atomic_saves.sql in Supabase first.';
  return fallback;
}

type Slot = { weekday: number; start_time: string };

// Reads the weekly time rows (slot_day_0 / slot_time_0, slot_day_1 …). Blank rows are skipped.
function readSlots(form: FormData): Slot[] | string {
  const count = Number(text(form, 'slot_count')) || 0;
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const day = text(form, `slot_day_${i}`);
    const time = text(form, `slot_time_${i}`);
    if (!day && !time) continue;
    if (!day || !time) return 'Each class time needs both a day and a time.';
    const weekday = Number(day);
    if (!(weekday >= 1 && weekday <= 7) || !/^\d{2}:\d{2}$/.test(time)) return 'Check the class times.';
    if (!slots.some((s) => s.weekday === weekday && s.start_time === time)) slots.push({ weekday, start_time: time });
  }
  return slots;
}

// Teacher, capacity and start date are shared by "create" and "update".
function readCommon(form: FormData) {
  return {
    teacher_id: text(form, 'teacher_id'),
    capacity: Number(text(form, 'capacity')),
    started_on: text(form, 'started_on') || todayInUk(),
    // Optional name such as "Batch 1"; Bulk import finds the batch again by its year and name.
    name: text(form, 'name').replace(/\s+/g, ' ') || null,
  };
}

function commonProblem(row: ReturnType<typeof readCommon>) {
  if (!UUID.test(row.teacher_id)) return 'Choose a teacher.';
  if (!(Number.isInteger(row.capacity) && row.capacity >= 1 && row.capacity <= 12)) return 'Capacity must be between 1 and 12.';
  return null;
}

export async function createBatch(form: FormData) {
  await requireStaff();
  const common = readCommon(form);
  const subjectId = text(form, 'subject_id');
  const yearGroup = Number(text(form, 'year_group'));
  const slots = readSlots(form);

  const problem = !subjectId ? 'Choose a subject.'
    : !YEARS.includes(yearGroup) ? 'Choose a year group.'
    : commonProblem(common) ?? (typeof slots === 'string' ? slots : null);
  if (problem) redirectWith('/batches/new', 'error', problem);

  const supabase = await createClient();
  // One database function saves the batch and its class times together: all of it, or nothing.
  // Creating the batch also copies the subject's curriculum into its lesson plan (a database trigger).
  const { data: batchId, error } = await supabase.rpc('save_batch', {
    p: { ...common, subject_id: subjectId, year_group: yearGroup, slots: typeof slots === 'string' ? [] : slots },
  });
  if (error || !batchId) {
    console.error('createBatch failed:', error?.message ?? 'no id returned');
    // 23505 = the name is taken by another open batch of the same subject and year.
    redirectWith('/batches/new', 'error', error?.code === '23505'
      ? `Another open batch of this subject and year is already called "${common.name}".`
      : error ? dbProblem(error, 'Could not create the batch.') : 'Could not create the batch.');
  }

  revalidatePath('/batches');
  revalidatePath('/');
  redirectWith(`/batches/${batchId}`, 'ok', 'Batch created.');
}

export async function updateBatch(form: FormData) {
  await requireStaff();
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/batches', 'error', 'Batch not found.');
  const path = `/batches/${id}`;
  const common = readCommon(form);
  const slots = readSlots(form);

  const problem = commonProblem(common) ?? (typeof slots === 'string' ? slots : null);
  if (problem) redirectWith(path, 'error', problem);

  const supabase = await createClient();
  // One database function saves the batch, moves its students to its teacher and replaces the weekly times
  // with the ones on the form, all together: if any part is refused, nothing changes.
  const { error } = await supabase.rpc('save_batch', {
    p: { ...common, id, slots: typeof slots === 'string' ? [] : slots },
  });
  if (error) {
    console.error('updateBatch failed:', error.message);
    redirectWith(path, 'error', error.code === '23505'
      ? `Another open batch of this subject and year is already called "${common.name}".`
      : dbProblem(error, 'Could not save the batch.'));
  }

  revalidatePath('/batches');
  revalidatePath(path);
  redirectWith(path, 'ok', 'Batch saved.');
}

export async function setBatchClosed(form: FormData) {
  await requireStaff();
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/batches', 'error', 'Batch not found.');
  const path = `/batches/${id}`;
  const close = form.get('close') === 'true';

  const supabase = await createClient();
  if (close) {
    // A batch can only close once it is empty, so no student is left in a closed class.
    const { count } = await supabase
      .from('enrolments').select('id', { count: 'exact', head: true }).eq('batch_id', id).is('ended_on', null);
    if (count) redirectWith(path, 'error', 'Move its students to another batch before closing it.');
  }

  const { data, error } = await supabase
    .from('batches').update({ closed_on: close ? todayInUk() : null }).eq('id', id).select('id');
  if (error || data.length === 0) {
    console.error('setBatchClosed failed:', error?.message ?? 'no rows updated');
    redirectWith(path, 'error', 'Could not update the batch.');
  }

  revalidatePath('/batches');
  revalidatePath(path);
  revalidatePath('/');
  redirectWith(path, 'ok', close ? 'Batch closed.' : 'Batch reopened.');
}

/* ---------- Homework (Phase 5) ---------- */

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Reads and checks the dates and maximum mark shared by "Set homework", "Mark completed" (topic) and
// "Complete lesson".
function readHomeworkDates(form: FormData, path: string) {
  const setOn = text(form, 'set_on') || todayInUk();
  const dueOn = optional(form, 'due_on');
  const maxMark = optionalNumber(form, 'max_mark');
  if (dueOn && dueOn < setOn) redirectWith(path, 'error', 'The due date cannot be before the date it is set.');
  if (maxMark !== null && !(maxMark > 0)) redirectWith(path, 'error', 'The maximum mark must be more than 0.');
  return { set_on: setOn, due_on: dueOn, max_mark: maxMark };
}

// The same, with the homework title typed on the form.
function readHomework(form: FormData, path: string) {
  const title = text(form, 'title');
  if (!title) redirectWith(path, 'error', 'Enter a homework title.');
  return { title, ...readHomeworkDates(form, path) };
}

// Sets homework for the whole batch, with a "not handed in" result for each current student.
// The worksheet file is uploaded to Google Drive first; then one database function (set_homework) saves the
// homework, gives it to the students and records the file together, so it is never saved halfway.
export async function createHomework(form: FormData) {
  const batchId = text(form, 'batch_id');
  if (!UUID.test(batchId)) redirectWith('/batches', 'error', 'Batch not found.');
  const path = `/batches/${batchId}`;
  const fields = readHomework(form, path);

  const supabase = await createClient();
  // Only staff and the batch's own teacher see the batch; checked before anything is uploaded to Drive.
  const { data: batch } = await supabase.from('batches').select('id').eq('id', batchId).maybeSingle();
  if (!batch) redirectWith('/batches', 'error', 'Batch not found.');

  const sheets = await prepareSheetFiles(form);
  const { data, error } = await supabase.rpc('set_homework', { p_batch: batchId, p: { ...fields, files: sheets.files } });
  if (error) {
    console.error('createHomework failed:', error.message);
    await discardUploads(sheets);
    redirectWith(path, 'error', dbProblem(error, 'Could not set the homework.'));
  }
  const students = Number(data?.students ?? 0);

  revalidatePath(path);
  revalidatePath('/');
  if (sheets.problem) redirectWith(path, 'error', `Homework set for ${students} student(s), but: ${sheets.problem}`);
  redirectWith(path, 'ok', `Homework set for ${students} student(s). It is now on their hand-in links.`);
}

/* ---------- Lesson plan ---------- */

// Start (Not started → In progress) and Undo (Completed → In progress, In progress → Not started).
// Undoing a completed topic keeps any homework it sent.
export async function setTopicStatus(form: FormData) {
  const batchId = text(form, 'batch_id');
  const topicId = text(form, 'topic_id');
  const status = text(form, 'status');
  if (!UUID.test(batchId) || !UUID.test(topicId)) redirectWith('/batches', 'error', 'Topic not found.');
  if (status !== 'not_started' && status !== 'in_progress') redirectWith(`/batches/${batchId}`, 'error', 'Unknown status.');
  const path = `/batches/${batchId}`;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('batch_topics').update({ status, completed_on: null }).eq('id', topicId).eq('batch_id', batchId).select('id');
  if (error || data.length === 0) {
    console.error('setTopicStatus failed:', error?.message ?? 'no rows updated');
    redirectWith(path, 'error', 'Could not change the topic.');
  }
  revalidatePath(path);
  revalidatePath('/batches');
  redirectWith(path, 'ok', status === 'in_progress' ? 'Topic is now in progress.' : 'Topic moved back to not started.');
}

// Marks a topic completed and sends its homework to everyone in the batch (from the pop-up).
// A topic that already sent homework (completed, undone, completed again) doesn't send it twice.
export async function completeTopic(form: FormData) {
  const batchId = text(form, 'batch_id');
  const topicId = text(form, 'topic_id');
  if (!UUID.test(batchId) || !UUID.test(topicId)) redirectWith('/batches', 'error', 'Topic not found.');
  const path = `/batches/${batchId}`;

  const supabase = await createClient();
  const [{ data: topic }, { data: sent }] = await Promise.all([
    supabase.from('batch_topics').select('id, status').eq('id', topicId).eq('batch_id', batchId).maybeSingle(),
    supabase.from('homework_sheets').select('title').eq('topic_id', topicId).maybeSingle(),
  ]);
  if (!topic) redirectWith(path, 'error', 'Topic not found.');
  if (topic.status === 'complete') redirectWith(path, 'error', 'This topic is already completed.');

  // The homework file is only needed (and uploaded to Drive) when the topic hasn't sent its homework yet.
  const fields = sent ? null : readHomework(form, path);
  const sheets = fields ? await prepareSheetFiles(form, fields.title) : null;

  // One database function sends the homework (once) and marks the topic completed, together.
  const { data, error } = await supabase.rpc('complete_topic', {
    p_batch: batchId, p_topic: topicId, p: fields ? { ...fields, files: sheets!.files } : {},
  });
  if (error) {
    console.error('completeTopic failed:', error.message);
    if (sheets) await discardUploads(sheets);
    redirectWith(path, 'error', dbProblem(error, 'Could not complete the topic. Nothing was sent.'));
  }
  if (data?.already_sent && sheets) await discardUploads(sheets); // sent from another tab in the meantime

  const message = data?.already_sent
    ? `Topic completed. Its homework "${data.already_sent}" was already sent, so it was not sent again.`
    : `Topic completed. Homework "${fields!.title}" sent to ${Number(data?.students ?? 0)} student(s).`;

  revalidatePath(path);
  revalidatePath('/batches');
  revalidatePath('/');
  if (sheets?.problem && !data?.already_sent) redirectWith(path, 'error', `${message} But: ${sheets.problem}`);
  redirectWith(path, 'ok', message);
}

// Gives one or more older homework to one student who joined the batch after they were set
// (from "Not given to" under a homework, or "Give past homework" next to the student).
// New students only get homework set after they join; this adds the "not handed in" results by hand.
export async function giveHomework(form: FormData) {
  const batchId = text(form, 'batch_id');
  const studentId = text(form, 'student_id');
  const sheetIds = [...new Set(form.getAll('sheet_id').map(String))];
  if (!UUID.test(batchId) || !UUID.test(studentId)) redirectWith('/batches', 'error', 'Homework not found.');
  const path = `/batches/${batchId}`;
  if (sheetIds.length === 0) redirectWith(path, 'error', 'Tick at least one homework to give.');
  if (!sheetIds.every((v) => UUID.test(v))) redirectWith(path, 'error', 'Homework not found.');

  const supabase = await createClient();
  const [{ data: sheets }, { data: member }] = await Promise.all([
    supabase.from('homework_sheets').select('id, title').in('id', sheetIds).eq('batch_id', batchId),
    supabase.from('enrolments').select('students(first_name)').eq('student_id', studentId).eq('batch_id', batchId).is('ended_on', null).maybeSingle(),
  ]);
  if (!sheets || sheets.length !== sheetIds.length) redirectWith(path, 'error', 'Homework not found.');
  if (!member) redirectWith(path, 'error', 'That student is not in this class.');

  // ignoreDuplicates: pressing twice, or a student who already has it, changes nothing.
  const { error } = await supabase
    .from('homework_results')
    .upsert(sheets.map((s) => ({ sheet_id: s.id, student_id: studentId })), { onConflict: 'sheet_id,student_id', ignoreDuplicates: true });
  if (error) {
    console.error('giveHomework failed:', error.message);
    redirectWith(path, 'error', 'Could not give the homework.');
  }

  const name = (member.students as unknown as { first_name: string } | null)?.first_name ?? 'The student';
  revalidatePath(path);
  revalidatePath('/');
  redirectWith(path, 'ok', sheets.length === 1
    ? `"${sheets[0].title}" given. ${name} can now see it and hand it in.`
    : `${sheets.length} homework given. ${name} can now see them under To hand in.`);
}

/* ---------- Lesson planner (lessons from the Lesson library) ---------- */

// Start (Not started → In progress) and Undo (Completed → In progress, In progress → Not started).
// Undoing a completed lesson keeps any homework it sent.
export async function setLessonStatus(form: FormData) {
  const batchId = text(form, 'batch_id');
  const lessonId = text(form, 'lesson_id');
  const status = text(form, 'status');
  if (!UUID.test(batchId) || !UUID.test(lessonId)) redirectWith('/batches', 'error', 'Lesson not found.');
  const path = `/batches/${batchId}`;
  if (status !== 'not_started' && status !== 'in_progress') redirectWith(path, 'error', 'Unknown status.');

  const supabase = await createClient();
  const { error } = await supabase.from('batch_lessons').upsert({
    batch_id: batchId, lesson_id: lessonId, status, completed_on: null,
    ...(status === 'in_progress' ? { started_on: todayInUk() } : { started_on: null }),
  }, { onConflict: 'batch_id,lesson_id' });
  if (error) {
    console.error('setLessonStatus failed:', error.message);
    redirectWith(path, 'error', 'Could not change the lesson.');
  }
  revalidatePath(path);
  redirectWith(lessonView(form, path), 'ok', status === 'in_progress' ? 'Lesson is now in progress.' : 'Lesson moved back to not started.');
}

// The batch page showing the term and module the action was on ("/batches/<id>?term=1&module=Geometry").
function lessonView(form: FormData, path: string) {
  const term = text(form, 'term');
  const moduleName = text(form, 'module');
  return term && moduleName ? `${path}?${new URLSearchParams({ term, module: moduleName })}` : path;
}

// Marks a lesson completed and sends the ticked homework sheets (Hw-1, Hw-2, Hw-3) to everyone in the batch,
// each with its worksheet from the Lesson library. A sheet already sent to this batch is not sent again.
export async function completeLesson(form: FormData) {
  const batchId = text(form, 'batch_id');
  const lessonId = text(form, 'lesson_id');
  if (!UUID.test(batchId) || !UUID.test(lessonId)) redirectWith('/batches', 'error', 'Lesson not found.');
  const path = `/batches/${batchId}`;
  const view = lessonView(form, path);
  const picked = form.getAll('hw').map(String).filter((v) => UUID.test(v));

  const fields = readHomeworkDates(form, view);

  // One database function checks the lesson is in this class's plan, sends each ticked sheet that this class
  // hasn't had yet (with its Lesson library worksheet, no copy is made) and marks the lesson completed, together.
  // A ticked sheet with no worksheet yet stops it all, with a message, and nothing is sent.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('complete_lesson', {
    p_batch: batchId, p_lesson: lessonId, p: { ...fields, hw: picked },
  });
  if (error) {
    console.error('completeLesson failed:', error.message);
    redirectWith(view, 'error', dbProblem(error, 'Could not complete the lesson. Nothing was sent.'));
  }
  const codes = (data?.codes ?? []) as string[];

  revalidatePath(path);
  revalidatePath('/');
  redirectWith(view, 'ok', codes.length
    ? `Lesson completed. Homework ${codes.join(', ')} sent to ${Number(data?.students ?? 0)} student(s).`
    : 'Lesson completed. No homework was sent.');
}

// Uploads the teacher's corrected sheet for one student's homework into the student's Drive Homework folder
// and records it, so the student sees it with the mark. Returns a message if it failed, otherwise null.
async function saveCorrection(supabase: Supabase, sheet: { id: string; title: string }, studentId: string, file: File) {
  const kind = fileKind(file);
  if (!kind) return 'The corrected sheet must be a PDF, Word file or photo.';
  if (file.size > MAX_BYTES) return `${file.name} is too big (4 MB max).`;
  try {
    const homework = await studentHomeworkFolder(supabase, studentId);
    const name = correctionName(sheet.title, kind.ext);
    const uploaded = await uploadFile(homework.id, name, kind.type, await file.arrayBuffer());
    await recordCorrection(supabase, sheet.id, studentId, uploaded, name);
    return null;
  } catch (e) {
    console.error('saveCorrection failed:', e);
    return 'Could not upload the corrected sheet to Google Drive.';
  }
}

// Records a mark, or "excused", for one student's homework, together with the corrected sheet if one is chosen.
// Marked homework shows on the student's dashboard under Recently marked for 14 days.
// A homework that is already marked can get a corrected sheet without typing the mark again.
export async function markHomework(form: FormData) {
  const batchId = text(form, 'batch_id');
  const sheetId = text(form, 'sheet_id');
  const studentId = text(form, 'student_id');
  if (![batchId, sheetId, studentId].every((v) => UUID.test(v))) redirectWith('/batches', 'error', 'Homework not found.');
  const path = `/batches/${batchId}`;
  const excuse = form.get('excuse') === 'true';
  const mark = optionalNumber(form, 'mark');
  const upload = form.get('correction');
  const file = !excuse && upload instanceof File && upload.size > 0 ? upload : null;

  const supabase = await createClient();
  // The maximum mark comes from the database, not the form, so it can't be tampered with.
  const [{ data: sheet }, { data: result }] = await Promise.all([
    supabase.from('homework_sheets').select('id, title, max_mark').eq('id', sheetId).eq('batch_id', batchId).maybeSingle(),
    supabase.from('homework_results').select('status').eq('sheet_id', sheetId).eq('student_id', studentId).maybeSingle(),
  ]);
  if (!sheet) redirectWith(path, 'error', 'Homework not found.');
  const onlyFile = !excuse && mark === null && file !== null && result?.status === 'marked';
  if (!excuse && !onlyFile) {
    if (mark === null || !(mark >= 0)) redirectWith(path, 'error', 'Enter a mark of 0 or more, then Save.');
    if (sheet.max_mark !== null && mark > sheet.max_mark) redirectWith(path, 'error', `The mark can't be more than ${sheet.max_mark}.`);
  }

  if (!onlyFile) {
    const row = excuse
      ? { status: 'excused', mark: null, marked_on: null }
      : { status: 'marked', mark, marked_on: todayInUk() };
    // upsert = update the result if it exists, otherwise add it.
    const { error } = await supabase
      .from('homework_results')
      .upsert({ sheet_id: sheetId, student_id: studentId, ...row }, { onConflict: 'sheet_id,student_id' });
    if (error) {
      console.error('markHomework failed:', error.message);
      redirectWith(path, 'error', 'Could not save the mark.');
    }
  }
  const fileProblem = file ? await saveCorrection(supabase, sheet, studentId, file) : null;

  revalidatePath(path);
  revalidatePath('/');
  if (fileProblem) redirectWith(path, 'error', onlyFile ? fileProblem : `Mark saved, but: ${fileProblem}`);
  redirectWith(path, 'ok', excuse ? 'Marked as excused.'
    : onlyFile ? 'Corrected sheet uploaded. The student can see it now.'
    : file ? 'Mark and corrected sheet saved. The student can see them now.'
    : 'Mark saved.');
}

// "Send" on a sheet marked in the browser with Save & close: the student now sees the marked sheet,
// with the mark typed on the marking page (or the mark already saved).
export async function sendMarkedDraft(form: FormData) {
  const batchId = text(form, 'batch_id');
  const sheetId = text(form, 'sheet_id');
  const studentId = text(form, 'student_id');
  if (![batchId, sheetId, studentId].every((v) => UUID.test(v))) redirectWith('/batches', 'error', 'Homework not found.');
  const path = `/batches/${batchId}`;

  const supabase = await createClient();
  const [{ data: sheet }, { data: result }, { data: draft }] = await Promise.all([
    supabase.from('homework_sheets').select('id, max_mark').eq('id', sheetId).eq('batch_id', batchId).maybeSingle(),
    supabase.from('homework_results').select('status').eq('sheet_id', sheetId).eq('student_id', studentId).maybeSingle(),
    supabase.from('homework_markups').select('draft_file_id, draft_name, draft_mark').eq('sheet_id', sheetId).eq('student_id', studentId).maybeSingle(),
  ]);
  if (!sheet || !result) redirectWith(path, 'error', 'Homework not found.');
  if (!draft?.draft_file_id) redirectWith(path, 'error', 'There is no saved marked sheet to send.');
  const mark = draft.draft_mark === null ? null : Number(draft.draft_mark);
  if (mark === null && result.status !== 'marked') {
    redirectWith(path, 'error', 'Enter a mark first: open 🖊️ Mark and use Save & send, or type the mark and Save.');
  }
  if (mark !== null && sheet.max_mark !== null && mark > Number(sheet.max_mark)) {
    redirectWith(path, 'error', `The mark can't be more than ${sheet.max_mark}.`);
  }

  const problem = await sendMarkedSheet(supabase, sheetId, studentId, { id: draft.draft_file_id, name: draft.draft_name ?? 'Marked sheet.pdf' }, mark);
  revalidatePath(path);
  revalidatePath('/');
  if (problem) redirectWith(path, 'error', problem);
  redirectWith(path, 'ok', 'Marked sheet sent. The student can see it now.');
}

// Deletes a homework and its results. Handed-in files stay in Google Drive.
export async function deleteHomework(form: FormData) {
  await requireStaff();
  const batchId = text(form, 'batch_id');
  const sheetId = text(form, 'sheet_id');
  if (!UUID.test(batchId) || !UUID.test(sheetId)) redirectWith('/batches', 'error', 'Homework not found.');
  const path = `/batches/${batchId}`;

  const supabase = await createClient();
  // file_links rows point at the sheet without a database link, so remove them by hand.
  await supabase.from('file_links').delete().in('owner_type', ['homework_submission', 'homework_sheet']).eq('owner_id', sheetId);
  const { data, error } = await supabase.from('homework_sheets').delete().eq('id', sheetId).eq('batch_id', batchId).select('id');
  if (error || data.length === 0) {
    console.error('deleteHomework failed:', error?.message ?? 'no rows deleted');
    redirectWith(path, 'error', 'Could not delete the homework.');
  }

  revalidatePath(path);
  revalidatePath('/');
  redirectWith(path, 'ok', 'Homework deleted. Any handed-in files are still in Google Drive.');
}

// Adds a homework file (upload or link) to homework that is already set.
export async function addHomeworkFile(form: FormData) {
  const batchId = text(form, 'batch_id');
  const sheetId = text(form, 'sheet_id');
  if (!UUID.test(batchId) || !UUID.test(sheetId)) redirectWith('/batches', 'error', 'Homework not found.');
  const path = `/batches/${batchId}`;

  const supabase = await createClient();
  const { data: sheet } = await supabase.from('homework_sheets').select('id').eq('id', sheetId).eq('batch_id', batchId).maybeSingle();
  if (!sheet) redirectWith(path, 'error', 'Homework not found.');
  const file = form.get('sheet_file');
  if (!(file instanceof File && file.size > 0) && !text(form, 'sheet_url')) redirectWith(path, 'error', 'Choose a file or paste a link.');

  // Upload first, then record the file and/or link in one insert.
  const sheets = await prepareSheetFiles(form);
  if (sheets.files.length > 0) {
    const { error } = await supabase.from('file_links').insert(sheets.files.map((f) => ({
      owner_type: 'homework_sheet', owner_id: sheetId, ...f,
    })));
    if (error) {
      console.error('addHomeworkFile failed:', error.message);
      await discardUploads(sheets);
      redirectWith(path, 'error', 'Could not save the homework file.');
    }
  }
  revalidatePath(path);
  if (sheets.problem) redirectWith(path, 'error', sheets.files.length ? `Homework file added, but: ${sheets.problem}` : sheets.problem);
  redirectWith(path, 'ok', 'Homework file added. Students can open it from My homework.');
}

// Removes a homework file from the homework. An uploaded file stays in Google Drive.
export async function removeHomeworkFile(form: FormData) {
  const batchId = text(form, 'batch_id');
  const fileId = text(form, 'file_id');
  if (!UUID.test(batchId) || !UUID.test(fileId)) redirectWith('/batches', 'error', 'File not found.');
  const path = `/batches/${batchId}`;

  const supabase = await createClient();
  const { error } = await supabase.from('file_links').delete().eq('id', fileId).eq('owner_type', 'homework_sheet');
  if (error) {
    console.error('removeHomeworkFile failed:', error.message);
    redirectWith(path, 'error', 'Could not remove the file.');
  }
  revalidatePath(path);
  redirectWith(path, 'ok', 'Homework file removed. It is still in Google Drive.');
}
