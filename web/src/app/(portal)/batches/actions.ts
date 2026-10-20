'use server';

import { revalidatePath } from 'next/cache';
import { optional, optionalNumber, redirectWith, text } from '@/lib/form';
import { todayInUk, UUID, YEARS } from '@/lib/options';
import { attachSheetFiles } from '@/lib/homework/sheets';
import { createClient } from '@/lib/supabase/server';

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
  };
}

function commonProblem(row: ReturnType<typeof readCommon>) {
  if (!UUID.test(row.teacher_id)) return 'Choose a teacher.';
  if (!(Number.isInteger(row.capacity) && row.capacity >= 1 && row.capacity <= 12)) return 'Capacity must be between 1 and 12.';
  return null;
}

export async function createBatch(form: FormData) {
  const common = readCommon(form);
  const subjectId = text(form, 'subject_id');
  const yearGroup = Number(text(form, 'year_group'));
  const slots = readSlots(form);

  const problem = !subjectId ? 'Choose a subject.'
    : !YEARS.includes(yearGroup) ? 'Choose a year group.'
    : commonProblem(common) ?? (typeof slots === 'string' ? slots : null);
  if (problem) redirectWith('/batches/new', 'error', problem);

  const supabase = await createClient();
  // Creating the batch also copies the subject's curriculum into its lesson plan (a database trigger).
  const { data: batch, error } = await supabase
    .from('batches')
    .insert({ ...common, subject_id: subjectId, year_group: yearGroup })
    .select('id')
    .single();
  if (error) {
    console.error('createBatch failed:', error.message);
    redirectWith('/batches/new', 'error', 'Could not create the batch.');
  }

  if (typeof slots !== 'string' && slots.length > 0) {
    const { error: slotError } = await supabase.from('batch_slots').insert(slots.map((s) => ({ ...s, batch_id: batch.id })));
    if (slotError) {
      console.error('createBatch slots failed:', slotError.message);
      redirectWith(`/batches/${batch.id}`, 'error', 'Batch created, but the class times could not be saved.');
    }
  }

  revalidatePath('/batches');
  revalidatePath('/');
  redirectWith(`/batches/${batch.id}`, 'ok', 'Batch created.');
}

export async function updateBatch(form: FormData) {
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/batches', 'error', 'Batch not found.');
  const path = `/batches/${id}`;
  const common = readCommon(form);
  const slots = readSlots(form);

  const problem = commonProblem(common) ?? (typeof slots === 'string' ? slots : null);
  if (problem) redirectWith(path, 'error', problem);

  const supabase = await createClient();
  const { data, error } = await supabase.from('batches').update(common).eq('id', id).select('id');
  if (error || data.length === 0) {
    console.error('updateBatch failed:', error?.message ?? 'no rows updated');
    redirectWith(path, 'error', 'Could not save the batch.');
  }

  // Students in the batch follow its teacher (the enrolment trigger copies it from the batch).
  await supabase.from('enrolments').update({ teacher_id: common.teacher_id }).eq('batch_id', id).is('ended_on', null);

  // Replace the weekly times with the ones on the form.
  const { error: deleteError } = await supabase.from('batch_slots').delete().eq('batch_id', id);
  const { error: slotError } = typeof slots !== 'string' && slots.length > 0
    ? await supabase.from('batch_slots').insert(slots.map((s) => ({ ...s, batch_id: id })))
    : { error: null };
  if (deleteError || slotError) {
    console.error('updateBatch slots failed:', (deleteError ?? slotError)?.message);
    redirectWith(path, 'error', 'Batch saved, but the class times could not be updated.');
  }

  revalidatePath('/batches');
  revalidatePath(path);
  redirectWith(path, 'ok', 'Batch saved.');
}

export async function setBatchClosed(form: FormData) {
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

// Reads and checks the homework fields shared by "Set homework" and "Mark completed".
function readHomework(form: FormData, path: string) {
  const title = text(form, 'title');
  const setOn = text(form, 'set_on') || todayInUk();
  const dueOn = optional(form, 'due_on');
  const maxMark = optionalNumber(form, 'max_mark');
  if (!title) redirectWith(path, 'error', 'Enter a homework title.');
  if (dueOn && dueOn < setOn) redirectWith(path, 'error', 'The due date cannot be before the date it is set.');
  if (maxMark !== null && !(maxMark > 0)) redirectWith(path, 'error', 'The maximum mark must be more than 0.');
  return { title, set_on: setOn, due_on: dueOn, max_mark: maxMark };
}

// Adds the homework with a "pending" result for each current student. Returns its id and the number of students.
async function insertHomework(supabase: Supabase, batchId: string, path: string, fields: ReturnType<typeof readHomework> & { topic_id?: string }) {
  const { data: sheet, error } = await supabase
    .from('homework_sheets')
    .insert({ batch_id: batchId, ...fields })
    .select('id')
    .single();
  if (error) {
    console.error('insertHomework failed:', error.message);
    redirectWith(path, 'error', 'Could not set the homework.');
  }

  // One "pending" result per current student, so reports count anyone who hasn't handed it in.
  const { data: members } = await supabase.from('enrolments').select('student_id').eq('batch_id', batchId).is('ended_on', null);
  if (members?.length) {
    const { error: resultError } = await supabase
      .from('homework_results')
      .insert(members.map((m) => ({ sheet_id: sheet.id, student_id: m.student_id })));
    if (resultError) console.error('insertHomework results failed:', resultError.message);
  }
  return { sheetId: sheet.id as string, students: members?.length ?? 0 };
}

// Sets homework for the whole batch, with a "not handed in" result for each current student.
export async function createHomework(form: FormData) {
  const batchId = text(form, 'batch_id');
  if (!UUID.test(batchId)) redirectWith('/batches', 'error', 'Batch not found.');
  const path = `/batches/${batchId}`;
  const fields = readHomework(form, path);

  const supabase = await createClient();
  const { sheetId, students } = await insertHomework(supabase, batchId, path, fields);
  const fileProblem = await attachSheetFiles(supabase, sheetId, form);

  revalidatePath(path);
  revalidatePath('/');
  if (fileProblem) redirectWith(path, 'error', `Homework set, but: ${fileProblem}`);
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

  let message: string;
  let fileProblem: string | null = null;
  if (sent) {
    message = `Topic completed. Its homework "${sent.title}" was already sent, so it was not sent again.`;
  } else {
    const fields = readHomework(form, path);
    const { sheetId, students } = await insertHomework(supabase, batchId, path, { ...fields, topic_id: topicId });
    fileProblem = await attachSheetFiles(supabase, sheetId, form, fields.title);
    message = `Topic completed. Homework "${fields.title}" sent to ${students} student(s).`;
  }

  const { error } = await supabase
    .from('batch_topics').update({ status: 'complete', completed_on: todayInUk() }).eq('id', topicId);
  if (error) {
    console.error('completeTopic failed:', error.message);
    redirectWith(path, 'error', 'The homework was sent, but the topic could not be marked completed.');
  }

  revalidatePath(path);
  revalidatePath('/batches');
  revalidatePath('/');
  if (fileProblem) redirectWith(path, 'error', `${message} But: ${fileProblem}`);
  redirectWith(path, 'ok', message);
}

// Records a mark, or "excused", for one student's homework.
export async function markHomework(form: FormData) {
  const batchId = text(form, 'batch_id');
  const sheetId = text(form, 'sheet_id');
  const studentId = text(form, 'student_id');
  if (![batchId, sheetId, studentId].every((v) => UUID.test(v))) redirectWith('/batches', 'error', 'Homework not found.');
  const path = `/batches/${batchId}`;
  const excuse = form.get('excuse') === 'true';
  const mark = optionalNumber(form, 'mark');

  const supabase = await createClient();
  // The maximum mark comes from the database, not the form, so it can't be tampered with.
  const { data: sheet } = await supabase
    .from('homework_sheets').select('max_mark').eq('id', sheetId).eq('batch_id', batchId).maybeSingle();
  if (!sheet) redirectWith(path, 'error', 'Homework not found.');
  if (!excuse) {
    if (mark === null || !(mark >= 0)) redirectWith(path, 'error', 'Enter a mark of 0 or more.');
    if (sheet.max_mark !== null && mark > sheet.max_mark) redirectWith(path, 'error', `The mark can't be more than ${sheet.max_mark}.`);
  }

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

  revalidatePath(path);
  revalidatePath('/');
  redirectWith(path, 'ok', excuse ? 'Marked as excused.' : 'Mark saved.');
}

// Deletes a homework and its results. Handed-in files stay in Google Drive.
export async function deleteHomework(form: FormData) {
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

  const problem = await attachSheetFiles(supabase, sheetId, form);
  revalidatePath(path);
  if (problem) redirectWith(path, 'error', problem);
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
