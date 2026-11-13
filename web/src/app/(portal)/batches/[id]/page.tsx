import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Alerts } from '@/components/Alerts';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Section } from '@/components/Section';
import { SectionNav, type SectionLink } from '@/components/SectionNav';
import { Bone, Skeleton } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { isTeacher } from '@/lib/auth';
import { cleanClassLink } from '@/lib/classLink';
import { formatDate } from '@/lib/format';
import { STUDENT_STATUSES, todayInUk, UUID, WEEKDAYS, yearLabel } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { setBatchClosed, setTopicStatus } from '../actions';
import { AttendanceSection } from '../AttendanceSection';
import { BatchForm } from '../BatchForm';
import { ClassLinkSection, type ClassLink } from '../ClassLinkSection';
import { ClassNotesSection } from '../ClassNotesSection';
import { CompleteTopic } from '../CompleteTopic';
import { GivePastHomework, type PastHomework } from '../GivePastHomework';
import { HomeworkSection } from '../HomeworkSection';
import { LessonPlanner } from '../LessonPlanner';

export const metadata = { title: 'Batch' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; term?: string; module?: string; class_date?: string }>;
};

const TOPIC_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', complete: 'Completed' };

export default async function BatchPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { ok, error: problem, term, module: moduleName, class_date: classDate } = await searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  // Everything below loads at the same time, so the page waits for the slowest query, not for all of them in a row.
  // A teacher (only ever sees their own batches) gets the class without the batch settings or Close.
  const teacherCheck = isTeacher();
  const batchQuery = (async () => supabase
    .from('batches')
    .select('id, code, name, subject_id, year_group, teacher_id, capacity, started_on, closed_on, subjects(name)')
    .eq('id', id)
    .maybeSingle())();
  const [
    teacher, { data: batch }, libraryLessons, { data: slots }, { data: members }, { data: topics }, { data: subjects },
    teachers, { data: allHomework }, { data: classLinkRow },
  ] =
    await Promise.all([
      teacherCheck,
      batchQuery,
      // Classes whose subject and year are in the Lesson library use the term and module lesson planner.
      // Needs the batch's subject and year, so it starts as soon as the batch has loaded.
      batchQuery.then(async ({ data: b }) => {
        if (!b) return 0;
        const { count } = await supabase
          .from('lessons').select('id', { count: 'exact', head: true })
          .eq('subject_id', b.subject_id).eq('year_group', b.year_group);
        return count ?? 0;
      }),
      supabase.from('batch_slots').select('weekday, start_time').eq('batch_id', id).order('weekday').order('start_time'),
      // Current students: open enrolments in this batch, with the student's details joined in.
      supabase
        .from('enrolments')
        .select('id, students(id, code, first_name, last_name, year_group, status)')
        .eq('batch_id', id)
        .is('ended_on', null),
      supabase.from('batch_topics').select('id, position, name, status, completed_on').eq('batch_id', id).order('position'),
      supabase.from('subjects').select('id, name').order('sort'),
      // Teachers for the batch settings (staff only; a teacher can't read the teachers list anyway).
      (async () => (await teacherCheck)
        ? []
        : (await supabase.from('teachers').select('id, first_name, last_name, subject_id').neq('status', 'left').order('first_name')).data)(),
      // All homework of the batch with who it was given to, for "Give past homework" next to each student,
      // and which topic sent it (for "already sent" in the lesson plan).
      supabase
        .from('homework_sheets').select('id, title, set_on, topic_id, homework_results(student_id)').eq('batch_id', id)
        .order('set_on', { ascending: false }).order('created_at', { ascending: false }),
      // The Google Classroom link, on its own so the page still opens before the database script for it
      // (20261111000001_class_link_attendance.sql) has been run: then this comes back empty.
      supabase
        .from('batches')
        .select('class_link, class_link_updated_at, changed_by:staff!batches_class_link_updated_by_fkey(full_name)')
        .eq('id', id)
        .maybeSingle(),
    ]);
  if (!batch) notFound();
  const classLink = classLinkRow as unknown as ClassLink | null;
  // Checked again here, so only a Google Classroom or Google Meet address can ever be a link on this page.
  const joinLink = cleanClassLink(classLink?.class_link);
  const usesLibrary = libraryLessons > 0;
  const hasHomework = (allHomework ?? []).length > 0;
  const notGiven = (studentId: string): PastHomework[] => (allHomework ?? [])
    .filter((h) => !(h.homework_results as { student_id: string }[]).some((r) => r.student_id === studentId))
    .map((h) => ({ id: h.id, title: h.title, set_on: h.set_on }));
  // Homework already sent by completing a topic, by topic.
  const sentFor = new Map((allHomework ?? []).filter((h) => h.topic_id).map((h) => [h.topic_id as string, h.title as string]));
  const today = todayInUk();

  const subjectName = (batch.subjects as unknown as { name: string } | null)?.name ?? batch.subject_id;
  const students = (members ?? [])
    .map((m) => m.students as unknown as { id: string; code: string; first_name: string; last_name: string; year_group: number; status: string })
    .sort((a, b) => a.first_name.localeCompare(b.first_name));

  const topicList = topics ?? [];
  const topicsDone = topicList.filter((t) => t.status === 'complete').length;
  const topicNow = topicList.find((t) => t.status === 'in_progress') ?? topicList.find((t) => t.status !== 'complete');
  const times = (slots ?? []).map((s) => `${WEEKDAYS[s.weekday]} ${s.start_time.slice(0, 5)}`).join(', ');
  const teacherName = (() => {
    const t = (teachers ?? []).find((x) => x.id === batch.teacher_id);
    return t ? `${t.first_name} ${t.last_name}` : null;
  })();

  // The bar under the title: one name per section, in page order. Pressing one opens that section.
  const sections: SectionLink[] = [
    { id: 'students', label: 'Students' },
    { id: 'lesson-plan', label: 'Lesson plan' },
    // Goes straight to the latest active homework, which is open inside the section.
    { id: 'homework', label: '📘 Homework', target: hasHomework ? 'latest-homework' : undefined, highlight: true },
    { id: 'attendance', label: 'Attendance' },
    { id: 'class-notes', label: 'Class notes' },
    { id: 'google-classroom', label: 'Google Classroom' },
    ...(teacher ? [] : [{ id: 'batch-settings', label: 'Batch settings' }]),
  ];

  // Students and Homework (the everyday work) start open; the other sections start closed and open when needed.
  // Each section remembers being opened or closed for the rest of the visit.
  return (
    <>
      <Link href="/batches" className={ui.back}>← {teacher ? 'My batches' : 'All batches'}</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>
            {batch.code}{batch.name ? ` · ${batch.name}` : ''} · {subjectName} · {yearLabel(batch.year_group)}
            {batch.closed_on && <> <StatusBadge status="closed" label={`Closed ${formatDate(batch.closed_on)}`} /></>}
          </h1>
          <p className={ui.subtitle}>
            {students.length} of {batch.capacity} places used
            {teacherName && <> · {teacherName}</>}
            {times && <> · {times}</>}
          </p>
        </div>
        <div className={ui.formActions}>
          <Link href={`/attendance?batch=${batch.id}`} className={ui.button}>Attendance List</Link>
          {joinLink && !batch.closed_on && (
            <a href={joinLink} target="_blank" rel="noopener noreferrer" className={ui.primaryButton}>Join class</a>
          )}
        </div>
      </div>
      <Alerts ok={ok} problem={problem} />

      <SectionNav links={sections} />

      <Section id="students" title="Students" defaultOpen
        summary={`${students.length} of ${batch.capacity} places used`}>
        {students.length === 0 ? (
          <p className={ui.empty}>{teacher ? 'No students in this batch yet.' : <>No students yet. Add them from a student&apos;s page.</>}</p>
        ) : (
          <ul className={ui.list}>
            {students.map((s) => (
              <li key={s.id}>
                <Link href={`/students/${s.id}`} className={ui.link}>{s.first_name} {s.last_name}</Link>
                <span className={ui.formActions}>
                  <span className={ui.muted}>{yearLabel(s.year_group)} · <StatusBadge status={s.status} label={STUDENT_STATUSES[s.status] ?? s.status} /></span>
                  {notGiven(s.id).length > 0 && (
                    <GivePastHomework batchId={batch.id} student={{ id: s.id, name: `${s.first_name} ${s.last_name}` }} homework={notGiven(s.id)} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {usesLibrary ? (
        <LessonPlanner batch={batch} students={students.length} today={today} term={term} moduleName={moduleName} />
      ) : (
        <Section id="lesson-plan" title="Lesson plan"
          summary={topicList.length === 0 ? 'No topics yet'
            : `${topicsDone} of ${topicList.length} topics completed${topicNow ? ` · now on ${topicNow.position}. ${topicNow.name}` : ''}`}>
          {topicList.length === 0 ? (
            <p className={ui.empty}>No topics. Add some to the subject&apos;s curriculum first.</p>
          ) : (
            <ol className={ui.list}>
              {topicList.map((t) => (
                <li key={t.id} style={{ flexWrap: 'wrap' }} className={t.status === 'in_progress' ? ui.rowLive : undefined}>
                  <span>
                    {t.position}. {t.name}
                    {sentFor.has(t.id) && <span className={ui.muted}> · homework sent: {sentFor.get(t.id)}</span>}
                  </span>
                  <span className={ui.formActions}>
                    <StatusBadge
                      status={t.status === 'complete' ? 'active' : t.status === 'in_progress' ? 'in_progress' : 'closed'}
                      label={t.status === 'complete' && t.completed_on
                        ? `Completed ${formatDate(t.completed_on)}`
                        : TOPIC_STATUS[t.status] ?? t.status}
                    />
                    {t.status === 'not_started' && (
                      <form action={setTopicStatus}>
                        <input type="hidden" name="batch_id" value={batch.id} />
                        <input type="hidden" name="topic_id" value={t.id} />
                        <button name="status" value="in_progress" className={ui.button}>Start</button>
                      </form>
                    )}
                    {t.status === 'in_progress' && (
                      <CompleteTopic batchId={batch.id} topicId={t.id} topicName={t.name} students={students.length}
                        today={today} alreadySent={sentFor.get(t.id) ?? null} />
                    )}
                    {t.status !== 'not_started' && (
                      <form action={setTopicStatus}>
                        <input type="hidden" name="batch_id" value={batch.id} />
                        <input type="hidden" name="topic_id" value={t.id} />
                        <button name="status" value={t.status === 'complete' ? 'in_progress' : 'not_started'} className={ui.button}
                          title={t.status === 'complete' ? 'Back to In progress. Homework already sent stays.' : 'Back to Not started'}>
                          Undo
                        </button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}

      <HomeworkSection batchId={batch.id} members={students} teacher={teacher} />

      {/* Loads on its own, so the rest of the page doesn't wait for the register. */}
      <Suspense fallback={(
        <Section id="attendance" title="Attendance" summary="Loading…" forceOpen={Boolean(classDate)}>
          <Skeleton label="Loading the register"><Bone width="60%" /><Bone width="80%" style={{ marginTop: 10 }} /></Skeleton>
        </Section>
      )}>
        <AttendanceSection batchId={batch.id} classDate={classDate} />
      </Suspense>

      <ClassNotesSection batch={batch} usesLibrary={usesLibrary} />

      <ClassLinkSection batchId={batch.id} info={classLink ? { ...classLink, class_link: joinLink } : null}
        teacher={teacher} closed={Boolean(batch.closed_on)} />

      {!teacher && (
        <Section id="batch-settings" title="Batch settings" summary="Name, teacher, places, start date, class times, close batch">
          <BatchForm batch={{ ...batch, slots: slots ?? [] }} subjects={subjects ?? []} teachers={teachers ?? []} embedded />
          {/* Closing is kept apart from the everyday buttons, so it isn't pressed by mistake. */}
          <form action={setBatchClosed} className={ui.dangerZone}>
            <input type="hidden" name="id" value={batch.id} />
            <input type="hidden" name="close" value={String(!batch.closed_on)} />
            <p>
              {batch.closed_on
                ? <>This batch was closed on {formatDate(batch.closed_on)}. Reopen it to use it again.</>
                : <><strong>Close batch</strong> when the class has finished. Move its students to another batch first.</>}
            </p>
            {batch.closed_on
              ? <button className={ui.button}>Reopen batch</button>
              : <ConfirmButton className={ui.dangerButton} message={`Close ${batch.code}? Students and the teacher will no longer see it as an open class.`}>Close batch</ConfirmButton>}
          </form>
        </Section>
      )}
    </>
  );
}
