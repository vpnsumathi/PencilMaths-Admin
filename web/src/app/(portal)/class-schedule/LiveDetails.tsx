import Link from 'next/link';
import ui from '@/components/ui.module.css';
import { OUTSIDE_BATCH, type Live, type TodayClass } from '@/lib/classSchedule';
import { clock12 } from '@/lib/format';
import { ukClock, type Guest, type LivePerson } from '@/lib/liveClass';
import { linkCallGuest, linkGooglePerson, unlinkCallGuest, unlinkGooglePerson } from './actions';
import styles from './schedule.module.css';

// One class's Meet details on the Class Schedule page (guide 21, sections 12 and 13): who is in the call, who
// pressed Join class, the attendance, and the people Meet couldn't match, with "This is…" and "Not them?".
// Staff (forTeacher false) and the batch's own teacher (forTeacher true) both use it. The teacher's version has
// Join class instead of "Open the Meet room", no WhatsApp parent (teachers can't see parents' numbers), and shows
// an account linked to someone outside the batch without a name and without "This is…" (the office moves those).

export const STATE_LABEL = { later: 'Later', soon: 'Starting soon', live: 'Live', done: 'Done' };

export const STATUS_NOTE: Record<Live['status'], string> = {
  ok: '',
  no_room: 'No Meet room for this batch, so Meet can\'t be checked. Make one on the batch page (Google Classroom section).',
  no_call: 'Nobody has started the Meet call yet.',
  error: '',
};

export function personState(p: LivePerson) {
  switch (p.state) {
    case 'in_meet': return { text: `In Meet · since ${ukClock(p.joinedAt)}`, tone: styles.inMeet };
    case 'left': return { text: `Joined, then left · ${ukClock(p.joinedAt)}–${ukClock(p.leftAt)}`, tone: styles.left };
    case 'not_detected': return { text: 'No join detected', tone: styles.notDetected };
    default: return { text: 'Meet not available', tone: styles.unknown };
  }
}

// How a person matched only by a one-call link joined: "by phone" or "not signed in to Google".
function callNote(p: LivePerson) {
  if (p.calls.length === 0) return null;
  const how = p.calls.some((c) => c.kind === 'phone') ? 'by phone' : 'not signed in to Google';
  return `${how}, linked for this class only`;
}

export function Details({ live, cls, date, forTeacher = false }: { live: Live; cls: TodayClass; date: string; forTeacher?: boolean }) {
  const people = [...(live.teacher ? [live.teacher] : []), ...live.students];
  const choices = people.map((p) => ({ value: `${p.kind === 'teacher' ? 't' : 's'}:${p.id}`, label: `${p.name}${p.kind === 'teacher' ? ' (teacher)' : ''}` }));
  return (
    <section id="details" className={`${styles.block} ${styles.details}`} aria-labelledby="details-title">
      <div className={ui.header} style={{ marginBottom: 8 }}>
        <div>
          <h2 id="details-title" className={styles.blockTitle} style={{ margin: 0 }}>{cls.code} · {clock12(cls.time)} {STATE_LABEL[cls.state].toLowerCase()}</h2>
          <p className={ui.subtitle}>
            {live.callStartedAt ? `Meet call started ${ukClock(live.callStartedAt)}. ` : ''}
            {live.problem ?? STATUS_NOTE[live.status]}
          </p>
        </div>
        <div className={ui.formActions}>
          {forTeacher && cls.hasRoom && (cls.state === 'live' || cls.state === 'soon') && (
            <a href={`/batches/${cls.batchId}/meet`} target="_blank" rel="noopener noreferrer" className={ui.primaryButton}>Join class</a>
          )}
          <Link href={`/batches/${cls.batchId}?class_date=${date}#attendance`} className={ui.button}>Open attendance</Link>
          {!forTeacher && cls.hasRoom && <a href={`/batches/${cls.batchId}/meet`} target="_blank" rel="noopener noreferrer" className={ui.button}>Open the Meet room</a>}
          <Link href="/class-schedule" className={ui.button}>Close</Link>
        </div>
      </div>

      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead><tr><th>Person</th><th>Google Meet</th><th>Pressed Join class</th><th>Attendance</th><th /></tr></thead>
          <tbody>
            {people.map((p) => {
              const st = personState(p);
              const late = p.kind === 'teacher' && live.teacherLate;
              const note = callNote(p);
              return (
                <tr key={p.id}>
                  <td><b>{p.name}</b>{p.kind === 'teacher' ? <span className={ui.muted}> · teacher</span> : p.code ? <span className={ui.muted}> · {p.code}</span> : null}</td>
                  <td>
                    <span className={`${styles.state} ${late ? styles.teacherLate : st.tone}`}>{late ? `Teacher not detected · ${st.text}` : st.text}</span>
                    {note && <span className={styles.why}>{note}</span>}
                  </td>
                  <td>{p.clickedAt ? ukClock(p.clickedAt) : <span className={ui.muted}>—</span>}</td>
                  <td>{p.mark ?? <span className={ui.muted}>—</span>}</td>
                  <td className={styles.rowActions}>
                    {!forTeacher && p.kind === 'student' && p.state === 'not_detected' && cls.state === 'live' && p.phone && (
                      <a className={ui.link} target="_blank" rel="noreferrer"
                        href={`https://wa.me/${p.phone}?text=${encodeURIComponent(`Hi, this is Pencil Maths. ${p.name.split(' ')[0]}'s ${cls.code} class has started at ${clock12(cls.time)}. We haven't seen them join the Google Meet call yet: please open Join class in the Pencil Maths login. Thank you!`)}`}>
                        WhatsApp parent
                      </a>
                    )}
                    {p.googleIds.length > 0 && (
                      <form action={unlinkGooglePerson} className={styles.inline}>
                        <input type="hidden" name="batch_id" value={cls.batchId} />
                        <input type="hidden" name="google_ids" value={p.googleIds.join(',')} />
                        <button className={styles.textButton} title="This Google account isn't them">Not them?</button>
                      </form>
                    )}
                    {p.calls.length > 0 && (
                      <form action={unlinkCallGuest} className={styles.inline}>
                        <input type="hidden" name="batch_id" value={cls.batchId} />
                        <input type="hidden" name="participant_ids" value={p.calls.map((c) => c.participantId).join(',')} />
                        <button className={styles.textButton} title="This caller isn't them">
                          {p.googleIds.length > 0 ? 'Not them? (caller)' : 'Not them?'}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={ui.hint}>
        &ldquo;No join detected&rdquo; is not the same as absent: they may have joined with another Google account, by phone, or
        Meet may not have caught up yet. Join class presses are shown separately and don&apos;t prove someone joined.
      </p>

      {live.guests.length > 0 && (
        <>
          <h3 className={styles.subTitle}>Unidentified guests</h3>
          <p className={ui.hint}>
            Choose who a guest is with <b>This is…</b> and press Save. A signed-in Google account is remembered from then on,
            in every class. Someone who joined by phone or without signing in to Google is linked for this class only,
            because Google gives no way to know them next time.
          </p>
          <ul className={styles.guests}>
            {live.guests.map((g, i) => <GuestRow key={g.participantId} g={g} i={i} batchId={cls.batchId} choices={choices} forTeacher={forTeacher} />)}
          </ul>
        </>
      )}
    </section>
  );
}

function GuestRow({ g, i, batchId, choices, forTeacher }: {
  g: Guest; i: number; batchId: string; choices: { value: string; label: string }[]; forTeacher: boolean;
}) {
  const signedIn = g.kind === 'signed_in' && Boolean(g.googleId);
  // A teacher can't move an account that is linked to someone outside their batch: the office can.
  const officeOnly = forTeacher && g.knownAs === OUTSIDE_BATCH;
  const how = g.kind === 'phone' ? 'joined by phone' : g.kind === 'anonymous' ? 'not signed in to Google' : null;
  return (
    <li>
      <span>
        <b>{g.name}</b>
        {g.knownAs ? <span className={ui.muted}> · linked to {g.knownAs}{forTeacher ? '' : ' (not in this batch)'}</span> : null}
        {how && <span className={ui.muted}> · {how}</span>}
        <span className={ui.muted}> · {g.leftAt ? `left ${ukClock(g.leftAt)}` : `in Meet since ${ukClock(g.joinedAt)}`}</span>
        {g.why && !g.knownAs && <span className={styles.why}>{g.why}</span>}
        {officeOnly && <span className={styles.why}>If this is someone in your class, ask the office to change the link.</span>}
      </span>
      {officeOnly ? null : signedIn ? (
        <form action={linkGooglePerson} className={styles.matchForm}>
          <input type="hidden" name="batch_id" value={batchId} />
          <input type="hidden" name="google_id" value={g.googleId!} />
          <label className={ui.muted} htmlFor={`who-${i}`}>This is</label>
          <select id={`who-${i}`} name="person" className={ui.select} defaultValue="" required>
            <option value="" disabled>Choose…</option>
            {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <button className={ui.button}>Save</button>
        </form>
      ) : how ? (
        <form action={linkCallGuest} className={styles.matchForm}>
          <input type="hidden" name="batch_id" value={batchId} />
          <input type="hidden" name="participant_id" value={g.participantId} />
          <label className={ui.muted} htmlFor={`who-${i}`}>This is</label>
          <select id={`who-${i}`} name="person" className={ui.select} defaultValue="" required>
            <option value="" disabled>Choose…</option>
            {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <button className={ui.button} title="Linked for this class only">Save for this class</button>
        </form>
      ) : (
        <span className={ui.muted}>Can&apos;t be linked</span>
      )}
    </li>
  );
}
