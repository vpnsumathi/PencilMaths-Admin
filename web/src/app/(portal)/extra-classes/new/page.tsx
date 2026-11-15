import Link from 'next/link';
import ui from '@/components/ui.module.css';
import { requireStaff } from '@/lib/auth';
import { NOT_READY, type Detail } from '@/lib/extraClasses';
import { todayInUk, UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { ExtraClassForm, type FormValues } from '../ExtraClassForm';
import { loadFormOptions } from '../formOptions';

export const metadata = { title: 'Create extra class' };

type Props = { searchParams: Promise<{ student?: string; recorded?: string; again?: string }> };

// Create extra class (from the student page, with the student filled in, or from the Extra classes page),
// Record a past extra class (?recorded=1), and Create again (?again=<class>: the same students, subject, teacher,
// length, type and note, on a new date). Staff only.
export default async function NewExtraClassPage({ searchParams }: Props) {
  await requireStaff('/extra-classes');
  const q = await searchParams;
  const recorded = q.recorded === '1';
  const student = UUID.test(q.student ?? '') ? q.student! : null;
  const supabase = await createClient();
  const [opts, againRes] = await Promise.all([
    loadFormOptions(),
    UUID.test(q.again ?? '') ? supabase.rpc('extra_class_detail', { p_id: q.again }) : Promise.resolve({ data: null }),
  ]);
  const again = againRes.data as Detail | null;
  const backHref = student ? `/students/${student}` : again ? `/extra-classes/${again.id}` : '/extra-classes';

  const initial: FormValues = again
    ? {
        subject_id: again.subject_id, teacher_id: again.teacher_status === 'left' ? '' : again.teacher_id,
        class_date: '', start_time: again.start_time, length_minutes: again.length_minutes, kind: again.kind,
        note: again.note ?? '', note_for_family: again.note_for_family, batch_id: again.batch_id,
        students: again.students.filter((s) => s.student_status !== 'left').map((s) => ({ student_id: s.id, missed_session_id: s.missed_session_id })),
      }
    : {
        subject_id: '', teacher_id: '', class_date: '', start_time: '', length_minutes: 60, kind: 'catch_up', note: '',
        note_for_family: false, batch_id: null,
        students: student && opts.students.some((s) => s.id === student && s.status !== 'left') ? [{ student_id: student, missed_session_id: null }] : [],
      };
  const name = student ? opts.students.find((s) => s.id === student)?.name : null;

  return (
    <>
      <Link href={backHref} className={ui.back}>← {student ? `Back to ${name ?? 'the student'}` : again ? `Back to ${again.code}` : 'Extra classes'}</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>{recorded ? 'Record a past extra class' : again ? `Create again: ${again.code}` : 'Create extra class'}</h1>
          <p className={ui.subtitle}>
            {recorded
              ? 'A one-off class that already happened. It goes in the history and gets its own attendance.'
              : 'A one-off class on a set date, such as a catch-up. It gets its own Meet room and attendance, and shows on the student’s and teacher’s pages.'}
          </p>
        </div>
        {!recorded && (
          <Link href={`/extra-classes/new?recorded=1${student ? `&student=${student}` : ''}`} className={ui.button}>Record a past extra class instead</Link>
        )}
      </div>
      {opts.notReady ? <p className={`${ui.alert} ${ui.alertError}`}>{NOT_READY}</p> : (
        <ExtraClassForm mode={recorded ? 'record' : 'new'} students={opts.students} subjects={opts.subjects} teachers={opts.teachers}
          initial={initial} today={todayInUk()} backHref={backHref} />
      )}
    </>
  );
}
