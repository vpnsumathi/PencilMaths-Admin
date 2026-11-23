import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';
import { Alerts } from '@/components/Alerts';
import { ConfirmButton } from '@/components/ConfirmButton';
import { StatusBadge } from '@/components/StatusBadge';
import ui from '@/components/ui.module.css';
import { requireAdmin } from '@/lib/auth';
import { formatDay } from '@/lib/format';
import { type LessonUsage, type UsedBatch } from '@/lib/lessons/library';
import { UUID, yearLabel } from '@/lib/options';
import { deleteLesson, deleteLessonHomework, removeWorksheet } from '../actions';

export const metadata = { title: 'Lesson' };
// Deleting can move worksheets to the Google Drive bin, which takes a moment per file.
export const maxDuration = 60;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };
type Homework = { id: string; slot: number; code: string; url: string | null; file_name: string | null; uploaded_at: string | null };
type Lesson = {
  id: string; subject_id: string; year_group: number; term: number; module: string; code: string; name: string;
  class_no: number | null; active: boolean; subjects: { name: string } | null; lesson_homework: Homework[];
};

const STATUS: Record<string, string> = { in_progress: 'In progress', complete: 'Completed' };

function Batches({ list }: { list: UsedBatch[] }) {
  return (
    <>
      {list.map((b, i) => (
        <Fragment key={b.batch_id}>{i > 0 && ', '}<Link href={`/batches/${b.batch_id}`} className={ui.link}>{b.code}</Link></Fragment>
      ))}
    </>
  );
}

// One Lesson library lesson (admins only, guide 14 section 13): its homework codes and worksheets, every place a
// class has used it, and the deletes that are allowed. What may be deleted is decided again by the database at the
// moment of the delete; this page only leaves out the buttons that would be refused.
export default async function LessonPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { ok, error: problem } = await searchParams;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requireAdmin();
  const [{ data }, usageRes] = await Promise.all([
    supabase.from('lessons')
      .select('id, subject_id, year_group, term, module, code, name, class_no, active, subjects(name), lesson_homework(id, slot, code, url, file_name, uploaded_at)')
      .eq('id', id).maybeSingle(),
    supabase.rpc('lesson_usage', { p_lessons: [id] }),
  ]);
  const lesson = data as unknown as Lesson | null;
  if (!lesson) notFound();
  // Before 20261125000001_lesson_library_delete.sql has run there is no usage and no delete buttons.
  const ready = !usageRes.error;
  if (usageRes.error && usageRes.error.code !== 'PGRST202') console.error('lesson_usage failed:', usageRes.error.message);
  const usage = ((usageRes.data ?? []) as LessonUsage[])[0] ?? null;
  const homework = [...lesson.lesson_homework].sort((a, b) => a.slot - b.slot);
  const hwUsage = new Map((usage?.homework ?? []).map((h) => [h.homework_id, h]));
  const back = `/lesson-library?${new URLSearchParams({ subject: lesson.subject_id, year: String(lesson.year_group), term: String(lesson.term) })}`;
  const used = usage?.used ?? true;
  const notes = usage?.notes ?? [];

  return (
    <>
      <Link href={back} className={ui.back}>← Lesson library</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>{lesson.code} · {lesson.name}</h1>
          <p className={ui.subtitle}>
            {lesson.subjects?.name ?? lesson.subject_id} {yearLabel(lesson.year_group)} · Term {lesson.term} · {lesson.module}
            {lesson.class_no != null && <> · Class {lesson.class_no}</>}
          </p>
        </div>
        {!lesson.active && <StatusBadge status="closed" label="Removed from the plan" />}
      </div>
      <Alerts ok={ok} problem={problem} />
      {!ready && (
        <p className={`${ui.alert} ${ui.alertWarn}`}>
          Not set up yet: run <code>20261125000001_lesson_library_delete.sql</code> in Supabase to see where this lesson is used and to delete.
        </p>
      )}

      <section className={ui.card}>
        <h2>Homework and worksheets</h2>
        {homework.length === 0 ? <p className={ui.empty}>This lesson has no homework codes.</p> : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead><tr><th>Homework</th><th>Code</th><th>Worksheet</th><th>Sent to</th>{ready && <th />}</tr></thead>
              <tbody>
                {homework.map((h) => {
                  const u = hwUsage.get(h.id);
                  const sent = u?.sent ?? [];
                  const canDelete = ready && !!u && sent.length === 0 && u.question_bank === 0;
                  return (
                    <tr key={h.id}>
                      <td>Hw-{h.slot}</td>
                      <td>{h.code}</td>
                      <td>
                        {h.url
                          ? <a href={h.url} target="_blank" rel="noreferrer" className={ui.link}>✅ {h.file_name ?? h.code}</a>
                          : <span className={ui.muted}>⚠️ No worksheet</span>}
                        {h.uploaded_at && <span className={ui.muted}> · {formatDay(h.uploaded_at)}</span>}
                      </td>
                      <td>{sent.length ? <Batches list={sent} /> : <span className={ui.muted}>Not sent</span>}
                        {u && u.question_bank > 0 && <span className={ui.muted}> · question bank work</span>}</td>
                      {ready && (
                        <td>
                          <div className={ui.formActions}>
                            {h.url && (
                              <form action={removeWorksheet}>
                                <input type="hidden" name="homework_id" value={h.id} />
                                <input type="hidden" name="lesson_id" value={lesson.id} />
                                <ConfirmButton className={ui.button} message={sent.length
                                  ? `Take the worksheet off ${h.code}? Homework already sent keeps it, so the file stays in Google Drive. Upload a new one before sending ${h.code} again.`
                                  : `Take the worksheet off ${h.code}? The file goes to the Google Drive bin (you can restore it there for 30 days).`}>
                                  Remove worksheet
                                </ConfirmButton>
                              </form>
                            )}
                            {canDelete && (
                              <form action={deleteLessonHomework}>
                                <input type="hidden" name="homework_id" value={h.id} />
                                <input type="hidden" name="lesson_id" value={lesson.id} />
                                <ConfirmButton className={ui.dangerButton} message={`Delete homework code ${h.code} from ${lesson.code}? `
                                  + 'Its worksheet goes to the Google Drive bin. If it is still in the spreadsheet, the next import adds it back.'}>
                                  Delete code
                                </ConfirmButton>
                              </form>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {usage && (
        <section className={ui.card} style={{ marginTop: 16 }}>
          <h2>Where classes have used it</h2>
          {!usage.used ? <p className={ui.muted}>No class has used this lesson yet.</p> : (
            <ul className={ui.list}>
              {usage.progress.length > 0 && (
                <li><span>Progress</span><span>{usage.progress.map((p, i) => (
                  <Fragment key={p.batch_id}>{i > 0 && ', '}<Link href={`/batches/${p.batch_id}`} className={ui.link}>{p.code}</Link>
                    {' '}{STATUS[p.status] ?? p.status}{p.closed && ' (closed)'}</Fragment>
                ))}</span></li>
              )}
              {usage.homework.filter((h) => h.sent.length > 0).map((h) => (
                <li key={h.homework_id}><span>Hw-{h.slot} {h.code} sent to</span><span><Batches list={h.sent} /></span></li>
              ))}
              {usage.homework.filter((h) => h.question_bank > 0).map((h) => (
                <li key={`qb${h.homework_id}`}><span>Question bank</span><span>Work on {h.code}</span></li>
              ))}
              {notes.length > 0 && (
                <li><span>Class notes about it</span><span>{notes.map((n, i) => (
                  <Fragment key={n.batch_id ?? 'personal'}>{i > 0 && ', '}
                    {n.batch_id ? <Link href={`/batches/${n.batch_id}`} className={ui.link}>{n.code}</Link> : 'Personal notes'} ({n.notes})</Fragment>
                ))}</span></li>
              )}
              {usage.trackers.length > 0 && (
                <li><span>Lesson Tracker dates</span><span><Batches list={usage.trackers} /></span></li>
              )}
            </ul>
          )}
        </section>
      )}

      {ready && (used ? (
        <div className={ui.dangerZone}>
          <p>
            This lesson can&apos;t be deleted because classes have used it; it keeps their history. To take it out of the plan,
            leave it out of the spreadsheet and import again: it then shows as &quot;Removed from the plan&quot;.
            {usage && usage.trackers.length > 0 && <> If a Lesson Tracker is the only use, do that first and then set that class&apos;s Lesson Tracker again.</>}
          </p>
        </div>
      ) : (
        <form action={deleteLesson} className={ui.dangerZone}>
          <input type="hidden" name="lesson_id" value={lesson.id} />
          <p>No class has used this lesson, so it can be deleted with its homework codes. Worksheets nothing else uses go to the Google Drive bin.</p>
          <ConfirmButton className={ui.dangerButton} message={`Delete ${lesson.code} ${lesson.name} and its homework codes? `
            + 'If it is still in the spreadsheet, the next import adds it back.'}>
            Delete lesson
          </ConfirmButton>
        </form>
      ))}
    </>
  );
}
