import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alerts } from '@/components/Alerts';
import { StatusBadge } from '@/components/StatusBadge';
import { TermTabs } from '@/components/TermTabs';
import ui from '@/components/ui.module.css';
import { getViewer } from '@/lib/auth';
import { formatDay } from '@/lib/format';
import {
  formatTrackerDate, NOTE_LABEL, standingLabel, standingTone, summaryLine, termTabs, weekdayList, type LessonTrack,
} from '@/lib/lessons/tracker';
import { LESSON_STATUS, loadPlanWithDates } from '@/lib/lessons/trackerData';
import { todayInUk, UUID, yearLabel } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { SetLessonTracker } from '../../SetLessonTracker';

export const metadata = { title: 'Lesson plan with dates' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; set?: string; term?: string }> };

function TrackCell({ track }: { track: LessonTrack }) {
  const label = standingLabel(track.standing);
  if (label) return <StatusBadge status={track.standing.kind} label={label} />;
  if (track.note && track.note !== 'no_class') return <span className={ui.muted}>{NOTE_LABEL[track.note]}</span>;
  return null;
}

// The whole lesson plan of a batch, every term, with each lesson's planned date from the Lesson Tracker, its
// progress and how it stands (Early / On time / Late / Overdue). Admins and the batch's teacher; the database
// decides which batches a teacher may see. Admins can set, reset or remove the tracker and download it as Excel.
export default async function LessonTrackerPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { ok, error: problem, set, term: askedTerm } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [viewer, { data: batch }, { data: slots }] = await Promise.all([
    getViewer(),
    supabase.from('batches').select('id, code, name, subject_id, year_group, started_on, closed_on, subjects(name)').eq('id', id).maybeSingle(),
    supabase.from('batch_slots').select('weekday').eq('batch_id', id),
  ]);
  if (!batch) notFound();
  const isAdmin = viewer?.kind === 'staff' && viewer.role === 'admin';
  const today = todayInUk();
  const { ready, tracker, lessons, summary } = await loadPlanWithDates(supabase, batch, today);
  const subjectName = (batch.subjects as unknown as { name: string } | null)?.name ?? batch.subject_id;
  const active = lessons.filter((l) => l.active);
  const tabs = termTabs(lessons.map((l) => ({ term: l.term, active: l.active, done: l.status === 'complete' })), askedTerm);
  const hasClassNo = active.some((l) => l.class_no != null);
  const slotWeekdays = [...new Set((slots ?? []).map((s) => s.weekday as number))].sort((a, b) => a - b);

  return (
    <>
      <Link href={`/batches/${batch.id}#lesson-plan`} className={ui.back}>← {batch.code}</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Lesson plan with dates</h1>
          <p className={ui.subtitle}>
            {batch.code}{batch.name ? ` · ${batch.name}` : ''} · {subjectName} · {yearLabel(batch.year_group)} · {active.length} lessons
          </p>
        </div>
        {isAdmin && ready && (
          <div className={ui.formActions}>
            {tracker && <a href={`/batches/${batch.id}/lesson-tracker/excel`} className={ui.secondaryButton}>Download Excel</a>}
            {!batch.closed_on && hasClassNo && (
              <SetLessonTracker batchId={batch.id} today={today} batchStart={batch.started_on as string}
                slotWeekdays={slotWeekdays}
                current={tracker ? { startOn: tracker.startOn, weekdays: tracker.weekdays, scope: tracker.scope } : null}
                lessons={active.map((l) => ({ term: l.term, classNo: l.class_no, done: l.status === 'complete' }))}
                noClassCodes={active.filter((l) => l.class_no == null).map((l) => l.code)}
                openNow={set === '1' && !tracker && !problem} />
            )}
          </div>
        )}
      </div>
      <Alerts ok={ok} problem={problem} />

      {!ready && (
        <p className={`${ui.alert} ${ui.alertWarn}`}>
          The database is not ready for the Lesson Tracker yet{isAdmin ? ': run 20261119000001_lesson_tracker.sql in Supabase (Staging first).' : '.'}
        </p>
      )}
      {ready && !hasClassNo && (
        <p className={`${ui.alert} ${ui.alertWarn}`}>
          No lesson in this plan has a Class No., so there are no dates yet.
          {isAdmin && <> Add a <strong>Class No.</strong> column to the lesson plan spreadsheet and import it again in the <Link href="/lesson-library" className={ui.link}>Lesson library</Link>.</>}
        </p>
      )}
      {ready && hasClassNo && !tracker && (
        <p className={`${ui.alert} ${ui.alertWarn}`}>
          No Lesson Tracker yet.{isAdmin ? ' Press Set Lesson Tracker to give every class a date.' : ' An admin sets it.'}
        </p>
      )}
      {ready && hasClassNo && slotWeekdays.length === 0 && !batch.closed_on && (
        <p className={`${ui.alert} ${ui.alertWarn}`}>
          This batch has no weekly class times, so the Lesson Tracker can&apos;t be set.
          {isAdmin && <> Add them in <Link href={`/batches/${batch.id}#batch-settings`} className={ui.link}>Batch settings</Link>.</>}
        </p>
      )}
      {tracker && summary.changed > 0 && (
        <p className={`${ui.alert} ${ui.alertWarn}`}>
          The lesson plan changed after the tracker was set: {summary.changed} lesson{summary.changed === 1 ? '' : 's'} added, moved or removed.
          {isAdmin ? ' Press Reset Lesson Tracker to plan them.' : ' Ask an admin to reset the tracker.'}
        </p>
      )}

      {tracker && (
        <section className={ui.card} style={{ marginBottom: 16 }}>
          <p style={{ margin: 0 }}><strong>{summaryLine(summary, tracker)}</strong></p>
          <p className={ui.muted} style={{ margin: '6px 0 0', fontSize: 13 }}>
            {summary.planned} classes planned{summary.first && summary.last ? `, ${formatTrackerDate(summary.first)} to ${formatTrackerDate(summary.last)}` : ''}
            {summary.doneBefore > 0 && ` · ${summary.doneBefore} done before the tracker`}
            {summary.noClassNo > 0 && ` · ${summary.noClassNo} lessons without a Class No.`}
            {' '}· {tracker.scope === 'remaining' ? 'Classes not yet done' : 'Whole year'} from {formatTrackerDate(tracker.startOn)}, {weekdayList(tracker.weekdays)}
            {' '}· Set {formatDay(tracker.setAt)}{tracker.setBy ? ` by ${tracker.setBy}` : ''}
          </p>
        </section>
      )}

      {lessons.length === 0 ? (
        <p className={ui.empty}>This batch&apos;s subject and year have no lesson plan in the Lesson library.</p>
      ) : [tabs.current].map((term) => {
        const rows = lessons.filter((l) => l.term === term);
        return (
          <section key={term} className={ui.card} style={{ marginBottom: 16 }}>
            <TermTabs terms={tabs.terms} current={term} href={(t) => `/batches/${batch.id}/lesson-tracker?term=${t}`} />
            <h2>Term {term}</h2>
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Module</th><th>Lesson Code</th><th>Lesson</th><th>Class No.</th><th>Planned date</th>
                    <th>Status</th><th>Completed on</th><th>Tracker</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l, i) => (
                    <tr key={l.id} className={l.active ? undefined : ui.muted}>
                      <td>{i === 0 || rows[i - 1].module !== l.module ? <strong>{l.module}</strong> : ''}</td>
                      <td>{l.code}</td>
                      <td style={{ whiteSpace: 'normal', minWidth: 200 }}>
                        {l.name}
                        {!l.active && <> <em>(removed from the plan)</em></>}
                        {l.active && l.track.changed && <> <span className={ui.muted}>· changed since the tracker was set</span></>}
                      </td>
                      <td>{l.class_no != null ? `Class ${l.class_no}` : ''}</td>
                      <td>{l.track.plannedOn ? formatTrackerDate(l.track.plannedOn) : <span className={ui.muted}>{l.active && l.track.note ? NOTE_LABEL[l.track.note] : ''}</span>}</td>
                      <td>{l.status === 'complete'
                        ? <StatusBadge status={standingTone(l.track.standing) === 'bad' ? 'late' : 'on_time'} label="Completed" />
                        : LESSON_STATUS[l.status] ?? l.status}</td>
                      <td>{l.completedOn ? formatTrackerDate(l.completedOn) : ''}</td>
                      <td><TrackCell track={l.track} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
