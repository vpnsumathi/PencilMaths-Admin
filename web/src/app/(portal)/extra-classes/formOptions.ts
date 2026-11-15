import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { PickStudent } from './ExtraClassForm';

// What the booking form needs: every student with the subjects they take now (and their batch and teacher in
// each, to suggest the teacher), the subjects, and the teachers who haven't left (plus `keepTeacher`, a class's
// current teacher, even if they have). notReady: the extra classes script hasn't been run on the database yet.
export async function loadFormOptions(keepTeacher?: string) {
  const supabase = await createClient();
  const [{ data: students }, { data: subjects }, { data: teachers }, probe] = await Promise.all([
    supabase.from('students')
      .select('id, code, first_name, last_name, status, enrolments(subject_id, teacher_id, batch_id, ended_on, batches(teacher_id))')
      .order('first_name').order('last_name'),
    supabase.from('subjects').select('id, name').order('name'),
    supabase.from('teachers').select('id, first_name, last_name, status').order('first_name').order('last_name'),
    supabase.rpc('extra_class_list', { p: { page_size: 1 } }),
  ]);
  type Row = {
    id: string; code: string; first_name: string; last_name: string; status: string;
    enrolments: { subject_id: string; teacher_id: string | null; batch_id: string | null; ended_on: string | null; batches: { teacher_id: string | null } | null }[];
  };
  const pick: PickStudent[] = ((students ?? []) as unknown as Row[]).map((s) => ({
    id: s.id, code: s.code, name: `${s.first_name} ${s.last_name}`, status: s.status,
    enrolments: s.enrolments.filter((e) => !e.ended_on)
      .map((e) => ({ subject_id: e.subject_id, batch_id: e.batch_id, teacher_id: e.batches?.teacher_id ?? e.teacher_id })),
  }));
  return {
    students: pick,
    subjects: (subjects ?? []) as { id: string; name: string }[],
    teachers: ((teachers ?? []) as { id: string; first_name: string; last_name: string; status: string }[])
      .filter((t) => t.status !== 'left' || t.id === keepTeacher)
      .map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name}`, status: t.status })),
    notReady: probe.error?.code === 'PGRST202',
  };
}
