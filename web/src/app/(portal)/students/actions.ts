'use server';

import { revalidatePath } from 'next/cache';
import { redirectWith, text } from '@/lib/form';
import { STUDENT_STATUSES, UUID, YEARS } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Adds or updates a student. The database function save_student (file 4) saves the student,
// family, main parent, subjects and folder link together, so a half-saved student is impossible.
export async function saveStudent(form: FormData) {
  const id = text(form, 'id');
  if (id && !UUID.test(id)) redirectWith('/students', 'error', 'Student not found.');
  const formPath = id ? `/students/${id}` : '/students/new';

  const status = text(form, 'status') || 'active';
  const yearGroup = Number(text(form, 'year_group'));
  if (!(status in STUDENT_STATUSES)) redirectWith(formPath, 'error', 'Choose a valid status.');
  if (!YEARS.includes(yearGroup)) redirectWith(formPath, 'error', 'Choose a year group.');

  // One enrolment for each ticked subject, with its batch and teacher (both optional).
  const enrolments = form.getAll('enrol').map(String).map((subjectId) => ({
    id: text(form, `enrolment_id_${subjectId}`),
    subject_id: subjectId,
    teacher_id: text(form, `teacher_${subjectId}`),
    batch_id: text(form, `batch_${subjectId}`),
  }));

  const p = {
    id,
    first_name: text(form, 'first_name'),
    last_name: text(form, 'last_name'),
    year_group: yearGroup,
    school: text(form, 'school'),
    date_of_birth: text(form, 'date_of_birth'),
    status,
    start_date: text(form, 'start_date'),
    guardian: {
      full_name: text(form, 'guardian_name'),
      relationship: text(form, 'guardian_relationship'),
      phone: text(form, 'guardian_phone'),
      email: text(form, 'guardian_email'),
    },
    enrolments,
    folder_url: text(form, 'folder_url'),
  };

  const supabase = await createClient();
  const { data: studentId, error } = await supabase.rpc('save_student', { p });
  if (error) {
    console.error('saveStudent failed:', error.message);
    // P0001 = a message raised on purpose by save_student, e.g. "Add at least one subject". Safe to show.
    redirectWith(formPath, 'error', error.code === 'P0001' ? error.message : 'Could not save the student.');
  }

  revalidatePath('/students');
  revalidatePath('/batches');
  revalidatePath('/');
  redirectWith(`/students/${studentId}`, 'ok', id ? 'Student updated.' : 'Student added.');
}
