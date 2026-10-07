'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';

const SUBJECT_ID = /^[a-z0-9_]+$/;

// Go back to a page with a green (ok) or red (error) message in the address.
function back(path: string, kind: 'ok' | 'error', message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

// Only build a redirect address from a subject id that looks like one.
function subjectPath(subjectId: string) {
  return SUBJECT_ID.test(subjectId) ? `/subjects/${subjectId}` : '/subjects';
}

/* ---------- Subjects ---------- */

export async function addSubject(form: FormData) {
  const name = String(form.get('name') ?? '').trim();
  // The id is made from the name: "Computer Science" → "computer_science".
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) back('/subjects', 'error', 'Enter a subject name.');

  const { supabase } = await requireAdmin();
  const { data: last } = await supabase
    .from('subjects').select('sort').order('sort', { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from('subjects').insert({ id, name, sort: (last?.sort ?? 0) + 1 });
  if (error) {
    console.error('addSubject failed:', error.message);
    back('/subjects', 'error', error.code === '23505' ? 'That subject already exists.' : 'Could not add the subject.');
  }

  revalidatePath('/subjects');
  back('/subjects', 'ok', `${name} added.`);
}

export async function renameSubject(form: FormData) {
  const id = String(form.get('id'));
  const name = String(form.get('name') ?? '').trim();
  if (!name) back('/subjects', 'error', 'Enter a subject name.');

  const { supabase } = await requireAdmin();
  // .select('id') returns the changed rows. Zero rows means the security rules said no.
  const { data, error } = await supabase.from('subjects').update({ name }).eq('id', id).select('id');
  if (error || data.length === 0) {
    console.error('renameSubject failed:', error?.message ?? 'no rows updated');
    back('/subjects', 'error', error?.code === '23505' ? 'Another subject already has that name.' : 'Could not rename the subject.');
  }

  revalidatePath('/subjects');
  back('/subjects', 'ok', 'Subject renamed.');
}

export async function setSubjectActive(form: FormData) {
  const id = String(form.get('id'));
  const active = form.get('active') === 'true';

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from('subjects').update({ active }).eq('id', id).select('id');
  if (error || data.length === 0) {
    console.error('setSubjectActive failed:', error?.message ?? 'no rows updated');
    back('/subjects', 'error', 'Could not update the subject.');
  }

  revalidatePath('/subjects');
  back('/subjects', 'ok', active ? 'Subject turned on.' : 'Subject turned off.');
}

export async function moveSubject(form: FormData) {
  const id = String(form.get('id'));
  const direction = form.get('direction') === 'up' ? 'up' : 'down';

  const { supabase } = await requireAdmin();
  const { data: list, error } = await supabase.from('subjects').select('id').order('sort').order('name');
  if (error) {
    console.error('moveSubject failed:', error.message);
    back('/subjects', 'error', 'Could not move the subject.');
  }

  const i = list.findIndex((s) => s.id === id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) back('/subjects', 'error', 'That subject cannot move further.');

  // Swap the two, then number every subject 1, 2, 3… in the new order.
  [list[i], list[j]] = [list[j], list[i]];
  for (const [index, s] of list.entries()) {
    const { error: sortError } = await supabase.from('subjects').update({ sort: index + 1 }).eq('id', s.id);
    if (sortError) {
      console.error('moveSubject failed:', sortError.message);
      back('/subjects', 'error', 'Could not move the subject.');
    }
  }

  revalidatePath('/subjects');
  back('/subjects', 'ok', 'Order updated.');
}

/* ---------- Curriculum topics ---------- */

export async function addTopic(form: FormData) {
  const subjectId = String(form.get('subject_id'));
  const path = subjectPath(subjectId);
  const name = String(form.get('name') ?? '').trim();
  const yearText = String(form.get('year_group') ?? '');
  const yearGroup = yearText ? Number(yearText) : null;
  if (!name) back(path, 'error', 'Enter a topic name.');
  if (yearGroup !== null && !(Number.isInteger(yearGroup) && yearGroup >= 1 && yearGroup <= 13)) {
    back(path, 'error', 'Choose a valid year group.');
  }

  const { supabase } = await requireAdmin();
  // New topics go to the end of their year group's list.
  let lastQuery = supabase.from('curriculum_topics').select('position').eq('subject_id', subjectId);
  lastQuery = yearGroup === null ? lastQuery.is('year_group', null) : lastQuery.eq('year_group', yearGroup);
  const { data: last } = await lastQuery.order('position', { ascending: false }).limit(1).maybeSingle();

  const { error } = await supabase
    .from('curriculum_topics')
    .insert({ subject_id: subjectId, year_group: yearGroup, position: (last?.position ?? 0) + 1, name });
  if (error) {
    console.error('addTopic failed:', error.message);
    back(path, 'error', 'Could not add the topic.');
  }

  revalidatePath(path);
  revalidatePath('/subjects');
  back(path, 'ok', 'Topic added.');
}

export async function renameTopic(form: FormData) {
  const id = String(form.get('id'));
  const path = subjectPath(String(form.get('subject_id')));
  const name = String(form.get('name') ?? '').trim();
  if (!name) back(path, 'error', 'Enter a topic name.');

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from('curriculum_topics').update({ name }).eq('id', id).select('id');
  if (error || data.length === 0) {
    console.error('renameTopic failed:', error?.message ?? 'no rows updated');
    back(path, 'error', 'Could not rename the topic.');
  }

  revalidatePath(path);
  back(path, 'ok', 'Topic renamed.');
}

export async function deleteTopic(form: FormData) {
  const id = String(form.get('id'));
  const path = subjectPath(String(form.get('subject_id')));

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from('curriculum_topics').delete().eq('id', id).select('id');
  if (error || data.length === 0) {
    console.error('deleteTopic failed:', error?.message ?? 'no rows deleted');
    back(path, 'error', 'Could not remove the topic.');
  }

  revalidatePath(path);
  revalidatePath('/subjects');
  back(path, 'ok', 'Topic removed.');
}

export async function moveTopic(form: FormData) {
  const id = String(form.get('id'));
  const path = subjectPath(String(form.get('subject_id')));
  const direction = form.get('direction') === 'up' ? 'up' : 'down';

  const { supabase } = await requireAdmin();
  // The swap happens inside the database (move_curriculum_topic in the 20261007 migration).
  const { error } = await supabase.rpc('move_curriculum_topic', { p_id: id, p_direction: direction });
  if (error) {
    console.error('moveTopic failed:', error.message);
    back(path, 'error', 'Could not move the topic.');
  }

  revalidatePath(path);
  back(path, 'ok', 'Order updated.');
}
