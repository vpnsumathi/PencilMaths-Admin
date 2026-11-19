import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Alerts } from '@/components/Alerts';
import { ConfirmButton } from '@/components/ConfirmButton';
import ui from '@/components/ui.module.css';
import { whatsappNumber } from '@/app/(portal)/_dashboard/homework';
import { getViewer } from '@/lib/auth';
import {
  ASKED_BY, byText, EVENT_LABEL, eventText, KIND_LABEL, NOT_READY, shortWhen, ukClock, ukDay, whatsappText, whenText, type Detail,
} from '@/lib/extraClasses';
import { loadExtraLive, type ExtraLive } from '@/lib/extraMeet';
import { formatDate } from '@/lib/format';
import { ukClock as clock, type LivePerson } from '@/lib/liveClass';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { syncClass } from '@/lib/meetCheck';
import { correctTeacherAttendanceAction } from '../../batches/meetActions';
import { MeetCheckBox, type MeetCheck, type TeacherRecord } from '../../batches/MeetCheckBox';
import { cancelExtraClass, extraMeetRoomAction, refreshExtraMeetCheckAction, restoreExtraClass, saveExtraRegister } from '../actions';
import { ExtraStatusPill, Result } from '../bits';
import styles from '../extra.module.css';

export const metadata = { title: 'Extra class' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

// One extra class (guide 24): its details, the actions, who is in the Meet call while it is on, the students and
// the register, and the class's history. Staff see and do everything; the class's teacher sees it, joins and takes
// the register; anyone else gets "not found" (the database decides).
export default async function ExtraClassPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { ok, error: problem } = await searchParams;
  if (!UUID.test(id)) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  const staff = viewer.kind === 'staff';

  const supabase = await createClient();
  const [{ data, error }, { data: subjects }] = await Promise.all([
    supabase.rpc('extra_class_detail', { p_id: id }),
    supabase.from('subjects').select('id, name'),
  ]);
  if (error?.code === 'PGRST202') return <p className={`${ui.alert} ${ui.alertError}`}>{NOT_READY}</p>;
  let c = data as Detail | null;
  if (!c) notFound();
  // Check the class with Google Meet (guide 21, section 15; at most every 2 minutes, not again once final), then
  // read the class again if that changed anything.
  if (c.status !== 'cancelled' && c.has_meet_room && new Date(c.opens_at).getTime() <= Date.now()) {
    const synced = await syncClass({ kind: 'extra', id });
    if (synced && (synced.checkedIn || synced.takenBack)) {
      const { data: again } = await supabase.rpc('extra_class_detail', { p_id: id });
      if (again) c = again as Detail;
    }
  }
  const [{ data: check }, { data: record }, { data: meetMarks }] = await Promise.all([
    supabase.from('meet_checks').select('state, problem, unknown_guests, final, checked_at').eq('extra_class_id', id).maybeSingle(),
    supabase.from('teacher_class_attendance')
      .select('id, starts_at, first_join, last_leave, minutes, drops, meet_status, status, source, reason').eq('extra_class_id', id).maybeSingle(),
    supabase.from('extra_class_students').select('student_id, meet_joined_at').eq('extra_class_id', id),
  ]);
  // Before 20261119000002_meet_check_in.sql has run these come back empty, and the page works as before.
  const meetAt = new Map(((meetMarks ?? []) as { student_id: string; meet_joined_at: string | null }[]).map((m) => [m.student_id, m.meet_joined_at]));
  const subjectNames = Object.fromEntries(((subjects ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  const now = Date.now();
  const started = new Date(c.starts_at).getTime() <= now;
  const ended = new Date(c.ends_at).getTime() <= now;
  const registerOpen = c.status !== 'cancelled' && new Date(c.opens_at).getTime() <= now;
  const registerTaken = c.students.some((s) => s.mark_source === 'staff');
  const canCancel = staff && c.status !== 'cancelled' && !ended && !registerTaken;
  const canRestore = staff && c.status === 'cancelled' && !started;
  const live = staff && c.status === 'live' && c.has_meet_room ? await loadExtraLive(c) : null;

  return (
    <div className={styles.page}>
      <Link href="/extra-classes" className={ui.back}>← Extra classes</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>{c.code} · {KIND_LABEL[c.kind]}</h1>
          <p className={ui.subtitle}>
            {whenText(c.starts_at, c.ends_at)} · {c.length_minutes} min · {c.subject} · with {c.teacher}
          </p>
        </div>
        <ExtraStatusPill status={c.status} />
      </div>
      <Alerts ok={ok} problem={problem} />

      {c.status === 'cancelled' && (
        <p className={`${ui.alert} ${ui.alertError} ${styles.cancelled}`}>
          Cancelled {c.cancelled_at ? `on ${ukDay(c.cancelled_at)} at ${ukClock(c.cancelled_at)}` : ''}
          {c.cancelled_by ? ` by ${c.cancelled_by}` : ''}. Asked by {ASKED_BY[c.cancel_asked_by ?? 'office']}
          {c.cancel_reason ? `: “${c.cancel_reason}”` : '.'}
          {canRestore ? ' It can be restored until its start time.' : ''}
        </p>
      )}
      {staff && c.teacher_status === 'left' && c.status === 'upcoming' && (
        <p className={`${ui.alert} ${ui.alertWarn}`}>{c.teacher} has left Pencil Maths. Choose another teacher with Change.</p>
      )}
      {staff && c.teacher_status === 'on_leave' && c.status === 'upcoming' && (
        <p className={`${ui.alert} ${ui.alertWarn}`}>{c.teacher} is marked as on leave. Check they can take this class, or choose another teacher.</p>
      )}

      <div className={styles.actions}>
        {c.status === 'live' && (
          <a href={`/extra-classes/${c.id}/meet`} target="_blank" rel="noopener noreferrer" className={ui.primaryButton}>Join class (Meet)</a>
        )}
        {staff && c.status === 'upcoming' && c.has_meet_room && (
          <a href={`/extra-classes/${c.id}/meet`} target="_blank" rel="noopener noreferrer" className={ui.button}>Open the Meet room</a>
        )}
        {staff && c.status !== 'cancelled' && (
          <Link href={`/extra-classes/${c.id}/edit`} className={ui.button}>{started ? 'Change type or note' : 'Reschedule or change'}</Link>
        )}
        {staff && <Link href={`/extra-classes/new?again=${c.id}`} className={ui.button}>Create again</Link>}
        {canRestore && (
          <form action={restoreExtraClass}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="version" value={c.version} />
            <ConfirmButton className={ui.button} message="Restore this class? The clash rules are checked again first.">Restore</ConfirmButton>
          </form>
        )}
        {!staff && <span className={ui.muted} style={{ fontSize: 14 }}>To move, cancel or change this class, ask the office.</span>}
      </div>

      {live && <LivePanel live={live} />}

      <div className={ui.columns} style={{ marginTop: 0, maxWidth: 1100 }}>
        <section className={ui.card}>
          <h2>Details</h2>
          <dl className={styles.facts}>
            <dt>When</dt><dd>{whenText(c.starts_at, c.ends_at)} ({c.length_minutes} minutes)</dd>
            <dt>Join and check-in</dt><dd>From {ukClock(c.opens_at)} to {ukClock(c.ends_at)} · late after {ukClock(c.late_after)}</dd>
            <dt>Subject</dt><dd>{c.subject}{c.batch_code ? <span className={ui.muted}> · batch {c.batch_id ? <Link href={`/batches/${c.batch_id}`} className={ui.link}>{c.batch_code}</Link> : c.batch_code}</span> : null}</dd>
            <dt>Teacher</dt><dd>{c.teacher}{c.teacher_status !== 'active' ? <span className={ui.muted}> ({c.teacher_status.replace('_', ' ')})</span> : null}</dd>
            <dt>Type</dt><dd>{KIND_LABEL[c.kind]}</dd>
            <dt>Note</dt>
            <dd className={styles.note}>
              {c.note ?? <span className={ui.muted}>None</span>}
              {c.note && <span className={ui.muted}> ({c.note_for_family ? 'the family sees it' : 'staff and the teacher only'})</span>}
            </dd>
            <dt>{c.recorded_after ? 'Recorded' : 'Created'}</dt>
            <dd>{c.created_by ?? 'The app'} on {ukDay(c.created_at)} at {ukClock(c.created_at)}{c.recorded_after ? ' (after the class)' : ''}</dd>
          </dl>
        </section>

        {staff && (
          <section className={ui.card}>
            <h2>Meet room</h2>
            {c.status === 'cancelled' ? <p className={ui.muted} style={{ margin: 0 }}>The class is cancelled.</p> : c.has_meet_room ? (
              <>
                <p style={{ marginTop: 0 }}>
                  This class has its own Google Meet room. From {ukClock(c.opens_at)}, Join class opens it for the students (in their login)
                  and for the teacher. Students are checked in from the Meet call (their first join counts); pressing Join class
                  checks them in straight away, but on its own it only counts when Meet can&apos;t see the call. Moving the class keeps the same room.
                </p>
                <form action={extraMeetRoomAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="replace" value="yes" />
                  <ConfirmButton className={ui.button} message="Make a new Meet room for this class? Join class gets a new link, and the old room is closed (a call going on in it ends).">Recreate room</ConfirmButton>
                </form>
              </>
            ) : ended ? <p className={ui.muted} style={{ margin: 0 }}>No Meet room (the class is over).</p> : (
              <>
                <p style={{ marginTop: 0 }}>No Meet room yet. It is also made by itself when someone first presses Join class.</p>
                <form action={extraMeetRoomAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className={ui.primaryButton}>Make Meet room</button>
                </form>
              </>
            )}
          </section>
        )}
      </div>

      <section id="register" className={ui.card} style={{ marginTop: 16, maxWidth: 1100 }}>
        <h2>{registerOpen ? 'Attendance' : c.students.length === 1 ? 'Student' : `Students (${c.students.length})`}</h2>
        {registerOpen && (
          <MeetCheckBox check={(check ?? null) as MeetCheck} hasRoom={c.has_meet_room} opened={registerOpen} teacherName={c.teacher}
            record={(record ?? null) as TeacherRecord} canRefresh canCorrect={staff} hidden={{ id: c.id }}
            refreshAction={refreshExtraMeetCheckAction} correctAction={correctTeacherAttendanceAction} />
        )}
        {registerOpen ? <Register c={c} staff={staff} meetAt={meetAt} /> : <StudentsTable c={c} staff={staff} />}
      </section>

      {canCancel && (
        <details id="cancel" className={`${ui.card} ${styles.cancelBox}`} style={{ marginTop: 16 }}>
          <summary>Cancel this class</summary>
          <form action={cancelExtraClass} className={styles.cancelForm}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="version" value={c.version} />
            <fieldset className={styles.radios} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className={ui.label} style={{ marginBottom: 6 }}>Who asked for it?</legend>
              {(Object.keys(ASKED_BY) as (keyof typeof ASKED_BY)[]).map((k) => (
                <label key={k}><input type="radio" name="asked_by" value={k} required /> {ASKED_BY[k]}</label>
              ))}
            </fieldset>
            <label className={ui.field}>
              <span className={ui.label}>Reason (kept in the history; the family never sees it)</span>
              <input name="reason" className={ui.input} maxLength={300} required placeholder="For example: student unwell" />
            </label>
            <div className={ui.formActions}>
              <ConfirmButton className={ui.dangerButton} message="Cancel this extra class? It can be restored until its start time.">Cancel class</ConfirmButton>
              <span className={ui.muted} style={{ fontSize: 13 }}>Then let the family know with WhatsApp parent, and the teacher.</span>
            </div>
          </form>
        </details>
      )}

      <section className={ui.card} style={{ marginTop: 16, maxWidth: 1100 }}>
        <h2>History</h2>
        {c.history.length === 0 ? <p className={ui.empty}>Nothing yet.</p> : (
          <ol className={styles.timeline}>
            {c.history.map((e) => (
              <li key={e.id}>
                <time dateTime={e.at}>{ukDay(e.at)}<br />{ukClock(e.at)}</time>
                <span>
                  <b>{EVENT_LABEL[e.event] ?? e.event}</b>{eventText(e, subjectNames)}
                  {e.reason ? <span className={styles.reasonText}> · “{e.reason}”</span> : null}
                  <span className={styles.sub}> · {byText(e.by)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

// Before the register opens (and for a cancelled class): who is on the class, and WhatsApp parent for staff.
function StudentsTable({ c, staff }: { c: Detail; staff: boolean }) {
  const cancelled = c.status === 'cancelled';
  return (
    <div className={styles.scroll}>
      <table className={styles.register}>
        <thead><tr><th>Student</th><th>Makes up for</th><th>Result</th>{staff && <th>Parent</th>}</tr></thead>
        <tbody>
          {c.students.map((s) => {
            const phone = staff ? whatsappNumber(s.parent_phone) : null;
            return (
              <tr key={s.id}>
                <td>
                  <Link href={`/students/${s.id}`} className={ui.link}>{s.first_name} {s.last_name}</Link>
                  {s.student_status !== 'active' && <span className={styles.sub}> · {s.student_status}</span>}
                </td>
                <td>{s.missed_date ? `${s.missed_batch} · ${formatDate(s.missed_date)}` : <span className={ui.muted}>—</span>}</td>
                <td><Result mark={s.mark} source={s.mark_source} cancelled={cancelled} /></td>
                {staff && (
                  <td>
                    {phone ? (
                      <a className={ui.link} target="_blank" rel="noreferrer"
                        href={`https://wa.me/${phone}?text=${encodeURIComponent(whatsappText(c, s.first_name))}`}>WhatsApp parent</a>
                    ) : <span className={ui.muted}>No phone</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {c.status === 'upcoming' && <p className={ui.hint} style={{ margin: '12px 0 0' }}>Attendance opens at {ukClock(c.opens_at)} on {ukDay(c.starts_at)}.</p>}
    </div>
  );
}

// The register: Present / Late / Absent for each student, like a batch register. A portal check-in shows as
// chosen but stays "Checked in" until saved here; changing a saved mark needs a reason.
// meetAt: when Google Meet first saw each student in the class's call.
function Register({ c, staff, meetAt }: { c: Detail; staff: boolean; meetAt: Map<string, string | null> }) {
  return (
    <form action={saveExtraRegister}>
      <input type="hidden" name="id" value={c.id} />
      <div className={styles.scroll}>
        <table className={styles.register}>
          <thead>
            <tr><th>Student</th><th>Mark attendance</th><th>Now</th><th>In Meet / Join class</th><th>Reason for a change</th>{staff && <th>Parent</th>}</tr>
          </thead>
          <tbody>
            {c.students.map((s) => {
              const phone = staff ? whatsappNumber(s.parent_phone) : null;
              const inMeet = meetAt.get(s.id) ?? null;
              const showWhatsapp = phone && c.status === 'live' && !s.joined_at && !inMeet;
              return (
                <tr key={s.id}>
                  <td>
                    <input type="hidden" name="student" value={s.id} />
                    <Link href={`/students/${s.id}`} className={ui.link}>{s.first_name} {s.last_name}</Link>
                    {s.missed_date && <div className={styles.sub}>Makes up for {s.missed_batch} · {formatDate(s.missed_date)}</div>}
                  </td>
                  <td>
                    <span className={styles.choice} role="radiogroup" aria-label={`Mark attendance for ${s.first_name}`}>
                      {(['present', 'late', 'absent'] as const).map((m) => (
                        <label key={m}>
                          <input type="radio" name={`mark_${s.id}`} value={m} defaultChecked={s.mark === m} />
                          <span className={styles[m[0]]}>{m === 'present' ? 'Present' : m === 'late' ? 'Late' : 'Absent'}</span>
                        </label>
                      ))}
                    </span>
                  </td>
                  <td>
                    <Result mark={s.mark} source={s.mark_source} fromMeet={s.mark_source === 'link' ? Boolean(inMeet) : undefined} />
                    {s.mark_source === 'staff' && s.marked_by && <div className={styles.sub}>by {s.marked_by}{s.marked_at ? `, ${ukClock(s.marked_at)}` : ''}</div>}
                  </td>
                  <td>
                    {inMeet ? <>In Meet from {ukClock(inMeet)}</> : null}
                    {s.joined_at ? <div className={inMeet ? styles.sub : undefined}>Pressed Join class at {ukClock(s.joined_at)}</div> : null}
                    {!inMeet && !s.joined_at && <span className={ui.muted}>—</span>}
                  </td>
                  <td><input name={`reason_${s.id}`} className={`${ui.input} ${styles.reason}`} maxLength={300} placeholder={s.mark ? 'Needed to change the mark' : 'Optional'} /></td>
                  {staff && (
                    <td>
                      {showWhatsapp ? (
                        <a className={ui.link} target="_blank" rel="noreferrer"
                          href={`https://wa.me/${phone}?text=${encodeURIComponent(whatsappText(c, s.first_name))}`}>WhatsApp parent</a>
                      ) : phone ? <span className={ui.muted}>—</span> : <span className={ui.muted}>No phone</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={ui.formActions} style={{ marginTop: 12 }}>
        <button className={ui.primaryButton}>Save attendance</button>
        <span className={ui.muted} style={{ fontSize: 13 }}>
          {c.status === 'live' ? 'You can save now and again at the end.' : 'Students left blank stay as they are.'} Extra classes don&apos;t count in the weekly attendance figures.
        </span>
      </div>
    </form>
  );
}

function personLine(p: LivePerson) {
  switch (p.state) {
    case 'in_meet': return { text: `In Meet since ${clock(p.joinedAt)}`, tone: styles.inMeet };
    case 'left': return { text: `Joined, then left (${clock(p.joinedAt)}–${clock(p.leftAt)})`, tone: styles.leftCall };
    case 'not_detected': return { text: 'No join detected', tone: styles.notSeen };
    default: return { text: 'Meet not available', tone: styles.notSeen };
  }
}

// While the class is on: who is in its Meet call (from Google Meet, for rooms the app made). "No join detected" is
// not the same as absent; the register decides.
function LivePanel({ live }: { live: ExtraLive }) {
  const note = live.status === 'no_call' ? 'Nobody has started the Meet call yet.' : live.status === 'error' ? live.problem : null;
  const people = [...(live.teacher ? [live.teacher] : []), ...live.students];
  return (
    <section className={ui.card} style={{ marginBottom: 16, maxWidth: 1100 }}>
      <h2>In the Meet call now · {live.inMeet} of {live.students.length} {live.students.length === 1 ? 'student' : 'students'}</h2>
      {note && <p className={ui.muted} style={{ marginTop: 0 }}>{note}</p>}
      <ul className={styles.livePeople}>
        {people.map((p) => {
          const line = personLine(p);
          return (
            <li key={p.id}>
              <span><b>{p.name}</b>{p.kind === 'teacher' ? <span className={styles.sub}> · teacher</span> : null}</span>
              <span className={line.tone}>{line.text}{p.clickedAt ? ` · pressed Join class ${clock(p.clickedAt)}` : ''}</span>
            </li>
          );
        })}
      </ul>
      {live.guests.length > 0 && (
        <p className={ui.hint} style={{ margin: '12px 0 0' }}>
          Also in the call: {live.guests.map((g) => g.name).join(', ')}. Google accounts are linked to people on the Class Schedule page.
        </p>
      )}
      <p className={ui.hint} style={{ margin: '8px 0 0' }}>Reload the page to update. &ldquo;No join detected&rdquo; is not the same as absent: the attendance you save decides.</p>
      <p className={ui.hint} style={{ margin: '4px 0 0' }}>Last checked {shortWhen(new Date().toISOString())}.</p>
    </section>
  );
}
