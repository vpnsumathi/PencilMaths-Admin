'use server';

import { revalidatePath } from 'next/cache';
import { redirectWith, text } from '@/lib/form';
import { todayInUk, UUID, YEARS } from '@/lib/options';
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
