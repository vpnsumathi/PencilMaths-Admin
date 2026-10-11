'use server';

import { revalidatePath } from 'next/cache';
import { optional, optionalNumber, redirectWith, text } from '@/lib/form';
import { EMAIL, ENQUIRY_STAGES, UUID, YEARS } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Adds a lead, or updates one when the form includes an id.
export async function saveEnquiry(form: FormData) {
  const id = text(form, 'id');
  if (id && !UUID.test(id)) redirectWith('/enquiries', 'error', 'Enquiry not found.');
  const formPath = id ? `/enquiries/${id}` : '/enquiries/new';

  const row = {
    child_first_name: text(form, 'child_first_name'),
    child_last_name: text(form, 'child_last_name'),
    year_group: Number(text(form, 'year_group')),
    school: optional(form, 'school'),
    source: optional(form, 'source'),
    parent_name: text(form, 'parent_name'),
    parent_relationship: optional(form, 'parent_relationship'),
    parent_phone: optional(form, 'parent_phone'),
    parent_email: optional(form, 'parent_email'),
    assessment_score: optionalNumber(form, 'assessment_score'),
    assessment_comments: optional(form, 'assessment_comments'),
  };
  const subjects = form.getAll('subjects').map(String);
  if (!row.child_first_name || !row.child_last_name) redirectWith(formPath, 'error', "Enter the child's first and last name.");
  if (!YEARS.includes(row.year_group)) redirectWith(formPath, 'error', 'Choose a year group.');
  if (!row.parent_name) redirectWith(formPath, 'error', "Enter the parent's name.");
  if (row.parent_email && !EMAIL.test(row.parent_email)) redirectWith(formPath, 'error', 'Enter a valid email address.');
  if (row.assessment_score !== null && !(row.assessment_score >= 0 && row.assessment_score <= 100)) {
    redirectWith(formPath, 'error', 'The assessment score must be between 0 and 100.');
  }
  if (subjects.length === 0) redirectWith(formPath, 'error', 'Tick at least one subject.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = id
    ? await supabase.from('enquiries').update(row).eq('id', id).select('id').single()
    : await supabase.from('enquiries').insert(row).select('id').single();
  if (error) {
    console.error('saveEnquiry failed:', error.message);
    redirectWith(formPath, 'error', 'Could not save the enquiry.');
  }
  const enquiryId = data.id;

  // Replace the subjects with the ticked ones.
  await supabase.from('enquiry_subjects').delete().eq('enquiry_id', enquiryId);
  const { error: subjectError } = await supabase
    .from('enquiry_subjects')
    .insert(subjects.map((subject_id) => ({ enquiry_id: enquiryId, subject_id })));
  if (subjectError) console.error('saveEnquiry subjects failed:', subjectError.message);

  // A new lead starts its history at "New".
  if (!id) await supabase.from('enquiry_events').insert({ enquiry_id: enquiryId, stage: 'new', by_staff: user?.id });

  revalidatePath('/enquiries');
  revalidatePath('/');
  redirectWith(`/enquiries/${enquiryId}`, 'ok', id ? 'Enquiry updated.' : 'Enquiry added.');
}

// Moves a lead to another stage and records it in the history.
export async function setStage(form: FormData) {
  const id = text(form, 'id');
  const stage = text(form, 'stage');
  if (!UUID.test(id)) redirectWith('/enquiries', 'error', 'Enquiry not found.');
  const path = `/enquiries/${id}`;
  if (!(stage in ENQUIRY_STAGES) || stage === 'enrolled') {
    redirectWith(path, 'error', 'Choose a valid stage. Use "Convert to student" to enrol.');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // .is('student_id', null): a converted lead can't be moved back.
  const { data, error } = await supabase
    .from('enquiries')
    .update({ stage, stage_changed_at: new Date().toISOString() })
    .eq('id', id)
    .is('student_id', null)
    .select('id');
  if (error || data.length === 0) {
    console.error('setStage failed:', error?.message ?? 'no rows updated');
    redirectWith(path, 'error', 'Could not change the stage.');
  }
  await supabase.from('enquiry_events').insert({ enquiry_id: id, stage, by_staff: user?.id });

  revalidatePath('/enquiries');
  revalidatePath(path);
  revalidatePath('/');
  redirectWith(path, 'ok', `Moved to ${ENQUIRY_STAGES[stage]}.`);
}

// Turns a lead into a student: copies the child, parent and subjects, then marks the lead enrolled.
export async function convertToStudent(form: FormData) {
  const id = text(form, 'id');
  if (!UUID.test(id)) redirectWith('/enquiries', 'error', 'Enquiry not found.');
  const path = `/enquiries/${id}`;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: e } = await supabase
    .from('enquiries')
    .select('child_first_name, child_last_name, year_group, school, parent_name, parent_relationship, parent_phone, parent_email, student_id, enquiry_subjects(subject_id)')
    .eq('id', id)
    .maybeSingle();
  if (!e) redirectWith('/enquiries', 'error', 'Enquiry not found.');
  if (e.student_id) redirectWith(`/students/${e.student_id}`, 'ok', 'This enquiry is already a student.');

  // Same database function the student form uses: student, family, parent and subjects in one go.
  const { data: studentId, error } = await supabase.rpc('save_student', {
    p: {
      first_name: e.child_first_name,
      last_name: e.child_last_name,
      year_group: e.year_group,
      school: e.school ?? '',
      status: 'active',
      guardian: {
        full_name: e.parent_name,
        relationship: e.parent_relationship ?? '',
        phone: e.parent_phone ?? '',
        email: e.parent_email ?? '',
      },
      enrolments: (e.enquiry_subjects as { subject_id: string }[]).map((s) => ({ subject_id: s.subject_id })),
    },
  });
  if (error) {
    console.error('convertToStudent failed:', error.message);
    redirectWith(path, 'error', error.code === 'P0001' ? error.message : 'Could not create the student.');
  }

  // Link the lead to its new student. (Phase 3 will also create the Drive folder here.)
  await supabase
    .from('enquiries')
    .update({ stage: 'enrolled', stage_changed_at: new Date().toISOString(), student_id: studentId })
    .eq('id', id);
  await supabase.from('enquiry_events').insert({ enquiry_id: id, stage: 'enrolled', by_staff: user?.id });

  revalidatePath('/enquiries');
  revalidatePath('/students');
  revalidatePath('/');
  redirectWith(`/students/${studentId}`, 'ok', 'Student created from the enquiry. Now choose their batches.');
}