import Link from 'next/link';
import { notFound } from 'next/navigation';
import ui from '@/components/ui.module.css';
import { requireStaff } from '@/lib/auth';
import { NOT_READY, whenText, type Detail } from '@/lib/extraClasses';
import { redirectWith } from '@/lib/form';
import { todayInUk, UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { ExtraClassForm } from '../../ExtraClassForm';
import { loadFormOptions } from '../../formOptions';

export const metadata = { title: 'Change extra class' };

// Change an extra class: move it (Reschedule), change the teacher, add or take off students, or change the type
// and the note. Once the class has started only the type and the note can change. Staff only.
export default async function EditExtraClassPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff('/extra-classes');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('extra_class_detail', { p_id: id });
  if (error?.code === 'PGRST202') return <p className={`${ui.alert} ${ui.alertError}`}>{NOT_READY}</p>;
  const c = data as Detail | null;
  if (!c) notFound();
  if (c.status === 'cancelled') redirectWith(`/extra-classes/${id}`, 'error', 'This class is cancelled. Restore it first.');
  const opts = await loadFormOptions(c.teacher_id);
  // Students already on the class who have since left still show (they can be taken off).
  const known = new Set(opts.students.map((s) => s.id));
  const students = [
    ...opts.students,
    ...c.students.filter((s) => !known.has(s.id)).map((s) => ({ id: s.id, code: '', name: `${s.first_name} ${s.last_name}`, status: s.student_status, enrolments: [] })),
  ];

  return (
    <>
      <Link href={`/extra-classes/${id}`} className={ui.back}>← Back to {c.code}</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Change {c.code}</h1>
          <p className={ui.subtitle}>Now: {whenText(c.starts_at, c.ends_at)} with {c.teacher}. Every change is kept in the class&apos;s history.</p>
        </div>
      </div>
      <ExtraClassForm
        mode="edit" students={students} subjects={opts.subjects} teachers={opts.teachers} today={todayInUk()} backHref={`/extra-classes/${id}`}
        locked={new Date(c.starts_at).getTime() <= Date.now()}
        initial={{
          id: c.id, version: c.version, subject_id: c.subject_id, teacher_id: c.teacher_id, class_date: c.class_date,
          start_time: c.start_time, length_minutes: c.length_minutes, kind: c.kind, note: c.note ?? '', note_for_family: c.note_for_family,
          batch_id: c.batch_id, students: c.students.map((s) => ({ student_id: s.id, missed_session_id: s.missed_session_id })),
        }}
      />
    </>
  );
}
