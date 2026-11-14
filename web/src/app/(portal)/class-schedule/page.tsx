import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { requireStaff } from '@/lib/auth';
import { loadLive, loadSchedule, type Live, type TodayClass } from '@/lib/classSchedule';
import { ukClock, type LivePerson } from '@/lib/liveClass';
import { UUID, WEEKDAYS } from '@/lib/options';
import { linkGooglePerson, unlinkGooglePerson } from './actions';
import { LiveRefresh } from './LiveRefresh';
import styles from './schedule.module.css';

export const metadata = { title: 'Class Schedule' };

type Props = { searchParams: Promise<{ class?: string; ok?: string; error?: string }> };

// Class Schedule (guide 21, section 12), staff only: classes on now with who is in the Google Meet call, one
// class's details, today's classes and the week's timetable. Who is in the call comes from Google Meet (rooms the
// app made); "Join class" presses are shown beside it as a separate signal, never as proof of attending.
export default async function ClassSchedulePage({ searchParams }: Props) {
  const viewer = await requireStaff();
  const { class: picked, ok, error: problem } = await searchParams;
  const s = await loadSchedule();
  const onNow = s.today.filter((c) => c.state === 'live' || c.state === 'soon');
  const chosen = UUID.test(picked ?? '') ? s.today.find((c) => c.batchId === picked) ?? null : null;
  const [live, detail] = await Promise.all([
    Promise.all(onNow.map((c) => loadLive(c, viewer.userId))),
    chosen && !onNow.includes(chosen) ? loadLive(chosen, viewer.userId) : Promise.resolve(null),
  ]);
  const shown = chosen ? (detail ?? live[onNow.indexOf(chosen)]) : null;
  const updatedAt = new Date().toISOString();

  return (
    <>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Class Schedule</h1>
          <p className={ui.subtitle}>Classes on now and who is in the Google Meet call, today&apos;s classes, and the week</p>
        </div>
        <LiveRefresh active={onNow.length > 0} updatedAt={updatedAt} />
      </div>
      <Alerts ok={ok} problem={problem} />
      {!s.meetReady && (
        <p className={`${ui.alert} ${ui.alertError}`}>
          The database is not ready for Meet rooms yet: run 20261114000001_meet_rooms.sql in Supabase. Until then only the
          timetable and Join class presses are shown.
        </p>
      )}

      <section className={styles.block} aria-labelledby="live-title">
        <h2 id="live-title" className={styles.blockTitle}>Live now</h2>
        {live.length === 0 ? (
          <p className={ui.empty}>
            No classes on right now.
            {(() => {
              const next = s.today.find((c) => c.state === 'later');
              return next ? ` Next today: ${next.time} ${next.code}${next.teacher ? ` with ${next.teacher}` : ''}.` : '';
            })()}
          </p>
        ) : (
          <div className={styles.cards}>
            {live.map((l, i) => <LiveCard key={l.batchId + l.time} live={l} cls={onNow[i]} selected={chosen?.batchId === l.batchId} />)}
          </div>
        )}
      </section>

      {shown && chosen && <Details live={shown} cls={chosen} date={s.date} />}

      <section className={styles.block} aria-labelledby="today-title">
        <h2 id="today-title" className={styles.blockTitle}>Today · {WEEKDAYS[s.weekday]}</h2>
        {s.today.length === 0 ? <p className={ui.empty}>No classes today.</p> : (
          <ol className={styles.timeline}>
            {s.today.map((c) => (
              <li key={c.batchId + c.time} className={`${styles.timelineItem} ${styles[c.state]}`}>
                <span className={styles.time}>{c.time}</span>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.what}>
                  <Link href={`/class-schedule?class=${c.batchId}#details`} className={ui.link}>{c.code}{c.name ? ` · ${c.name}` : ''}</Link>
                  <span className={ui.muted}>{[c.subject, c.teacher].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={styles.chip}>{STATE_LABEL[c.state]}</span>
                <span className={styles.reg}>{registerLine(c)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.block} aria-labelledby="week-title">
        <h2 id="week-title" className={styles.blockTitle}>This week</h2>
        <div className={styles.week}>
          {s.week.map((day, i) => (
            <div key={i} className={`${styles.day} ${i + 1 === s.weekday ? styles.today : ''}`}>
              <h3>{WEEKDAYS[i + 1]}</h3>
              {day.length === 0 ? <p className={ui.muted}>—</p> : day.map((c) => (
                <Link key={c.batchId + c.time} href={`/batches/${c.batchId}`} className={styles.slot}>
                  <b>{c.time}</b> {c.code}
                  <span>{[c.subject, c.teacher].filter(Boolean).join(' · ')}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

const STATE_LABEL = { later: 'Later', soon: 'Starting soon', live: 'Live', done: 'Done' };

function registerLine(c: TodayClass) {
  const r = c.register;
  if (!r) return c.state === 'done' ? 'No register' : '';
  return `${r.present + r.late} attended (${r.late} late) · ${r.absent} absent · ${r.clicked} pressed Join class`;
}

const STATUS_NOTE: Record<Live['status'], string> = {
  ok: '',
  no_room: 'No Meet room for this batch, so Meet can\'t be checked. Make one on the batch page (Google Classroom section).',
  no_call: 'Nobody has started the Meet call yet.',
  error: '',
};

function personState(p: LivePerson) {
  switch (p.state) {
    case 'in_meet': return { text: `In Meet · since ${ukClock(p.joinedAt)}`, tone: styles.inMeet };
    case 'left': return { text: `Joined, then left · ${ukClock(p.joinedAt)}–${ukClock(p.leftAt)}`, tone: styles.left };
    case 'not_detected': return { text: 'No join detected', tone: styles.notDetected };
    default: return { text: 'Meet not available', tone: styles.unknown };
  }
}

function LiveCard({ live, cls, selected }: { live: Live; cls: TodayClass; selected: boolean }) {
  const total = live.students.length;
  const pct = total ? Math.round((100 * live.inMeet) / total) : 0;
  const teacher = live.teacher ? personState(live.teacher) : null;
  const clicked = live.students.filter((p) => p.clickedAt).length;
  return (
    <Link href={`/class-schedule?class=${cls.batchId}#details`} className={`${styles.card} ${selected ? styles.selected : ''}`}>
      <div className={styles.cardTop}>
        <span className={cls.state === 'live' ? styles.pulse : styles.soonDot} aria-hidden="true" />
        <span>{cls.state === 'live' ? `Live · started ${cls.time}` : `Starting soon · ${cls.time}`}</span>
      </div>
      <strong className={styles.cardTitle}>{cls.code}{cls.name ? ` · ${cls.name}` : ''}</strong>
      <span className={ui.muted}>{cls.subject}</span>
      <div className={styles.cardMain}>
        <div className={styles.ring} style={{ ['--pct' as string]: `${pct}%` }}>
          <span>{live.status === 'error' || live.status === 'no_room' ? '–' : live.inMeet}<small>/{total}</small></span>
        </div>
        <div className={styles.cardFacts}>
          <span>students in Meet</span>
          <span className={live.teacherLate ? styles.teacherLate : teacher?.tone}>
            {live.teacher ? `${live.teacher.name}: ${live.teacherLate ? 'teacher not detected' : teacher!.text}` : 'No teacher on this batch'}
          </span>
          <span className={ui.muted}>{clicked} pressed Join class</span>
        </div>
      </div>
      {(live.problem || STATUS_NOTE[live.status]) && <span className={styles.cardNote}>{live.problem ?? STATUS_NOTE[live.status]}</span>}
      {live.guests.length > 0 && <span className={styles.cardNote}>{live.guests.length} unidentified {live.guests.length === 1 ? 'guest' : 'guests'}</span>}
    </Link>
  );
}

function Details({ live, cls, date }: { live: Live; cls: TodayClass; date: string }) {
  const people = [...(live.teacher ? [live.teacher] : []), ...live.students];
  const choices = people.map((p) => ({ value: `${p.kind === 'teacher' ? 't' : 's'}:${p.id}`, label: `${p.name}${p.kind === 'teacher' ? ' (teacher)' : ''}` }));
  return (
    <section id="details" className={`${styles.block} ${styles.details}`} aria-labelledby="details-title">
      <div className={ui.header} style={{ marginBottom: 8 }}>
        <div>
          <h2 id="details-title" className={styles.blockTitle} style={{ margin: 0 }}>{cls.code} · {cls.time} {STATE_LABEL[cls.state].toLowerCase()}</h2>
          <p className={ui.subtitle}>
            {live.callStartedAt ? `Meet call started ${ukClock(live.callStartedAt)}. ` : ''}
            {live.problem ?? STATUS_NOTE[live.status]}
          </p>
        </div>
        <div className={ui.formActions}>
          <Link href={`/batches/${cls.batchId}?class_date=${date}#attendance`} className={ui.button}>Open register</Link>
          {cls.hasRoom && <a href={`/batches/${cls.batchId}/meet`} target="_blank" rel="noopener noreferrer" className={ui.button}>Open the Meet room</a>}
          <Link href="/class-schedule" className={ui.button}>Close</Link>
        </div>
      </div>

      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead><tr><th>Person</th><th>Google Meet</th><th>Pressed Join class</th><th>Register</th><th /></tr></thead>
          <tbody>
            {people.map((p) => {
              const st = personState(p);
              const late = p.kind === 'teacher' && live.teacherLate;
              return (
                <tr key={p.id}>
                  <td><b>{p.name}</b>{p.kind === 'teacher' ? <span className={ui.muted}> · teacher</span> : p.code ? <span className={ui.muted}> · {p.code}</span> : null}</td>
                  <td><span className={`${styles.state} ${late ? styles.teacherLate : st.tone}`}>{late ? `Teacher not detected · ${st.text}` : st.text}</span></td>
                  <td>{p.clickedAt ? ukClock(p.clickedAt) : <span className={ui.muted}>—</span>}</td>
                  <td>{p.mark ?? <span className={ui.muted}>—</span>}</td>
                  <td className={styles.rowActions}>
                    {p.kind === 'student' && p.state === 'not_detected' && cls.state === 'live' && p.phone && (
                      <a className={ui.link} target="_blank" rel="noreferrer"
                        href={`https://wa.me/${p.phone}?text=${encodeURIComponent(`Hi, this is Pencil Maths. ${p.name.split(' ')[0]}'s ${cls.code} class has started at ${cls.time}. We haven't seen them join the Google Meet call yet: please open Join class in the Pencil Maths login. Thank you!`)}`}>
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={ui.hint}>
        &ldquo;No join detected&rdquo; is not the same as absent: they may have joined with another Google account, or Meet may not
        have caught up yet. Join class presses are shown separately and don&apos;t prove someone joined.
      </p>

      {live.guests.length > 0 && (
        <>
          <h3 className={styles.subTitle}>Unidentified guests</h3>
          <p className={ui.hint}>
            Choose who a guest is once with <b>This is…</b> and press Save: the app remembers that Google account from then on,
            in every class.
          </p>
          <ul className={styles.guests}>
            {live.guests.map((g, i) => (
              <li key={(g.googleId ?? g.name) + i}>
                <span>
                  <b>{g.name}</b>{g.knownAs ? <span className={ui.muted}> · linked to {g.knownAs} (not in this batch)</span> : null}
                  <span className={ui.muted}> · {g.leftAt ? `left ${ukClock(g.leftAt)}` : `in Meet since ${ukClock(g.joinedAt)}`}</span>
                  {g.why && !g.knownAs && <span className={styles.why}>{g.why}</span>}
                </span>
                {g.kind === 'signed_in' && g.googleId ? (
                  <form action={linkGooglePerson} className={styles.matchForm}>
                    <input type="hidden" name="batch_id" value={cls.batchId} />
                    <input type="hidden" name="google_id" value={g.googleId} />
                    <input type="hidden" name="display_name" value={g.name} />
                    <label className={ui.muted} htmlFor={`who-${i}`}>This is</label>
                    <select id={`who-${i}`} name="person" className={ui.select} defaultValue="" required>
                      <option value="" disabled>Choose…</option>
                      {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <button className={ui.button}>Save</button>
                  </form>
                ) : (
                  <span className={ui.muted}>{g.kind === 'phone' ? 'Joined by phone: can\'t be linked' : 'Not signed in to Google: can\'t be linked'}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
