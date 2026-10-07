'use server';

import { revalidatePath } from 'next/cache';
import { optional, optionalNumber, redirectWith, text } from '@/lib/form';
import { EMAIL, TEACHER_STATUSES, UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Adds a teacher, or updates one when the form includes an id.
export async function saveTeacher(form: FormData) {
  const id = text(form, 'id');
  if (id && !UUID.test(id)) redirectWith('/teachers', 'error', 'Teacher not found.');
  const formPath = id ? `/teachers/${id}` : '/teachers/new';

  const row = {
    first_name: text(form, 'first_name'),
    last_name: text(form, 'last_name'),
    personal_email: optional(form, 'personal_email'),
    phone: optional(form, 'phone'),
    subject_id: optional(form, 'subject_id'),
    year_min: optionalNumber(form, 'year_min'),
    year_max: optionalNumber(form, 'year_max'),
    status: text(form, 'status') || 'active',
    joined_on: optional(form, 'joined_on'),
    notes: optional(form, 'notes'),
  };
  if (!row.first_name || !row.last_name) redirectWith(formPath, 'error', 'Enter the first and last name.');
  if (row.personal_email && !EMAIL.test(row.personal_email)) redirectWith(formPath, 'error', 'Enter a valid email address.');
  if (!(row.status in TEACHER_STATUSES)) redirectWith(formPath, 'error', 'Choose a valid status.');
  if (row.year_min && row.year_max && row.year_min > row.year_max) {
    redirectWith(formPath, 'error', 'The lowest year group cannot be above the highest.');
  }

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from('teachers').update(row).eq('id', id).select('id')
    : await supabase.from('teachers').insert(row).select('id');
  if (error || data.length === 0) {
    console.error('saveTeacher failed:', error?.message ?? 'no rows saved');
    redirectWith(formPath, 'error', error?.code === '23505' ? 'Another teacher already uses that email.' : 'Could not save the teacher.');
  }

  revalidatePath('/teachers');
  revalidatePath('/');
  redirectWith('/teachers', 'ok', id ? 'Teacher updated.' : 'Teacher added.');
}
