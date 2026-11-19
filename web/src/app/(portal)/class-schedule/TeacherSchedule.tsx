import Link from 'next/link';
import { Suspense } from 'react';
import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { checkAfterPage } from '@/lib/meetCheck';
import { loadLive, loadSchedule, type Live, type TodayClass, type WeekSlot } from '@/lib/classSchedule';
import { KIND_LABEL, ukClock, ukClock24, ukDate, type ListRow } from '@/lib/extraClasses';
import { clock12 } from '@/lib/format';
import { UUID, WEEKDAYS } from '@/lib/options';
import { ExtraBadge } from '../extra-classes/bits';
import { ExtraWeek, loadWeekExtras } from './ExtraSchedule';
import { Details } from './LiveDetails';
import { LiveRefresh } from './LiveRefresh';
import styles from './schedule.module.css';

// A teacher's Class Schedule (guide 21, section 13): the part of the staff Class Schedule that is about their own
// classes: their classes on now (with Join class, Open attendance and who is in the Meet call), today, this week's
// extra classes and the week's timetable. Only their own open batches and their own extra classes: the database
// rules decide that, and the loaders also ask for this teacher's classes only, as a second lock.
// In a class's details the teacher can link people Meet couldn't match ("This is…", "Not them?"), but only to
// themselves or a student in that batch (the database checks it). Not shown to teachers: WhatsApp parent and
// parents' emails or phones, and the name of someone outside the batch that an account is linked to.
type Params = { class?: string; ok?: string; error?: string };

export async function TeacherSchedule({ teacherId, params = {} }: { teacherId: string; params?: Params }) {
  const [s, extras] = await Promise.all([loadSchedule({ teacherId }), loadWeekExtras(teacherId)]);
  const onNow = s.today.filter((c) => c.state === 'live' || c.state === 'soon');
  const extrasOn = extras.filter((r) => r.status === 'live');
  const todayItems = [...s.today.map(fromBatch), ...extras.filter((r) => ukDate(r.starts_at) === s.date).map(fromExtra)]
    .sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  const clashes = findClashes(s.week, extras);
  // Only a class of this teacher's today can be opened (?class= of another batch is ignored).
  const chosen = UUID.test(params.class ?? '') ? s.today.find((c) => c.batchId === params.class) ?? null : null;
  const updatedAt = new Date().toISOString();
  const next = todayItems.find((c) => c.state === 'later');
  const nextLine = next ? ` Your next class today: ${clock12(next.time)} ${next.title}.` : '';
  // Nothing on now: still catch up on finished classes nobody looked at, once the page is sent (guide 21, section 15).
  if (onNow.length === 0 && extrasOn.length === 0 && !chosen) checkAfterPage();

  return (
    <>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Class Schedule</h1>
          <p className={ui.subtitle}>Your classes on now, today and this week</p>
        </div>
        <LiveRefresh active={onNow.length > 0 || extrasOn.length > 0} updatedAt={updatedAt} />
      </div>
      <Alerts ok={params.ok} problem={params.error} />

      {s.batchCount === 0 && extras.length === 0 ? (
        <p className={ui.empty}>
          You have no classes yet. When the office gives you a batch or an extra class, it shows here.
        </p>
      ) : (
        <>
          {clashes.length > 0 && (
            <div className={`${ui.alert} ${ui.alertError}`} role="alert">
              <b>Two of your classes are at the same time.</b> Please tell the office so they can move one:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{clashes.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}

          {/* The classes on now wait for Google Meet, so they come in on their own: today and the week show at once. */}
          {onNow.length === 0 && extrasOn.length === 0 && !chosen ? (
            <section className={styles.block} aria-labelledby="live-title">
              <h2 id="live-title" className={styles.blockTitle}>Live now</h2>
              <p className={ui.empty}>No class on right now.{nextLine}</p>
            </section>
          ) : (
            <Suspense fallback={(
              <section className={styles.block} aria-labelledby="live-title" aria-busy="true">
                <h2 id="live-title" className={styles.blockTitle}>Live now</h2>
                <p className={ui.empty}>Asking Google Meet who is in the call…</p>
              </section>
            )}>
              <TeacherLiveNow teacherId={teacherId} onNow={onNow} extrasOn={extrasOn} chosen={chosen} date={s.date} nextLine={nextLine} />
            </Suspense>
          )}

          <section className={styles.block} aria-labelledby="today-title">
            <h2 id="today-title" className={styles.blockTitle}>Today · {WEEKDAYS[s.weekday]}</h2>
            {todayItems.length === 0 ? <p className={ui.empty}>No classes today.</p> : (
              <ol className={styles.timeline}>
                {todayItems.map((c) => (
                  <li key={c.key} className={`${styles.timelineItem} ${styles[c.state]}`}>
                    <span className={styles.time}>{clock12(c.time)}</span>
                    <span className={styles.dot} aria-hidden="true" />
                    <span className={styles.what}>
                      <span><Link href={c.href} className={ui.link}>{c.title}</Link>{c.extra && <> <ExtraBadge /></>}</span>
                      <span className={ui.muted}>{c.sub}</span>
                    </span>
                    <span className={styles.chip}>{STATE_LABEL[c.state]}</span>
                    {c.line && <span className={styles.reg}>{c.line}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <ExtraWeek rows={extras} teacherView />

          <section className={styles.block} aria-labelledby="week-title">
            <h2 id="week-title" className={styles.blockTitle}>This week</h2>
            <div className={styles.week}>
              {s.week.map((day, i) => (
                <div key={i} className={`${styles.day} ${i + 1 === s.weekday ? styles.today : ''}`}>
                  <h3>{WEEKDAYS[i + 1]}</h3>
                  {day.length === 0 ? <p className={ui.muted}>—</p> : day.map((c) => (
                    <Link key={c.batchId + c.time} href={`/batches/${c.batchId}`} className={styles.slot}>
                      <b>{clock12(c.time)}</b> {c.code}
                      <span>{c.subject}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
            {s.unscheduled.length > 0 && (
              <p className={ui.hint}>
                No class time set yet, so not on the timetable:{' '}
                {s.unscheduled.map((b, i) => (
                  <span key={b.batchId}>{i > 0 && ', '}<Link href={`/batches/${b.batchId}`} className={ui.link}>{b.code}</Link></span>
                ))}. The office sets class times.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}

type State = TodayClass['state'];
const STATE_LABEL: Record<State, string> = { later: 'Later', soon: 'Starting soon', live: 'Live', done: 'Done' };

type Item = { key: string; time: string; title: string; sub: string; href: string; state: State; extra: boolean; line: string | null };

function fromBatch(c: TodayClass): Item {
  const r = c.register;
  return {
    key: `b${c.batchId}${c.time}`, time: c.time, title: `${c.code}${c.name ? ` · ${c.name}` : ''}`, sub: c.subject ?? '',
    href: `/class-schedule?class=${c.batchId}#details`, state: c.state, extra: false,
    line: r ? `${r.present + r.late} attended (${r.late} late) · ${r.absent} absent · ${r.clicked} pressed Join class`
      : c.state === 'done' ? 'No attendance yet' : null,
  };
}

function fromExtra(r: ListRow): Item {
  const started = new Date(r.starts_at).getTime() <= Date.now();
  const state: State = r.status === 'live' ? (started ? 'live' : 'soon') : r.status === 'upcoming' ? 'later' : 'done';
  return {
    key: `x${r.id}`, time: ukClock24(r.starts_at), title: `${r.code} · ${KIND_LABEL[r.kind]}`,
    sub: `${r.subject} · until ${ukClock(r.ends_at)} · ${r.students.map((x) => x.name).join(', ')}`,
    href: `/extra-classes/${r.id}`, state, extra: true,
    line: r.status === 'to_mark' ? 'Attendance not taken yet' : null,
  };
}

// A weekly class on now: Join class opens the batch's Meet room (at class time only, checked again by the server);
// without a room the batch page has the class link. Open attendance goes to today's attendance on the batch page.
// Who is in the call opens the class's details (who Meet sees, and This is… for anyone it couldn't match).
// Live now and one class's details: these ask Google Meet (each class gives up after 10 seconds, lib/meetCalls.ts).
async function TeacherLiveNow({ teacherId, onNow, extrasOn, chosen, date, nextLine }: {
  teacherId: string; onNow: TodayClass[]; extrasOn: ListRow[]; chosen: TodayClass | null; date: string; nextLine: string;
}) {
  const viewer = { kind: 'teacher' as const, teacherId };
  const [live, detail] = await Promise.all([
    Promise.all(onNow.map((c) => loadLive(c, viewer))),
    chosen && !onNow.includes(chosen) ? loadLive(chosen, viewer) : Promise.resolve(null),
  ]);
  const shown = chosen ? (detail ?? live[onNow.indexOf(chosen)]) : null;
  // Once the page is sent: save what Meet saw in the classes on now (check-in from Meet, at most every 2 minutes),
  // then catch up on finished classes nobody looked at (guide 21, section 15).
  checkAfterPage([
    ...live.filter((l) => l.status === 'ok').map((l) => ({ kind: 'batch' as const, batchId: l.batchId, date })),
    ...extrasOn.filter((r) => r.has_meet_room).map((r) => ({ kind: 'extra' as const, id: r.id })),
  ]);
  return (
    <>
      <section className={styles.block} aria-labelledby="live-title">
        <h2 id="live-title" className={styles.blockTitle}>Live now</h2>
        {onNow.length === 0 && extrasOn.length === 0 ? (
          <p className={ui.empty}>No class on right now.{nextLine}</p>
        ) : (
          <div className={styles.cards}>
            {onNow.map((c, i) => <BatchNow key={c.batchId + c.time} c={c} date={date} live={live[i]} selected={chosen?.batchId === c.batchId} />)}
            {extrasOn.map((r) => <ExtraNow key={r.id} r={r} />)}
          </div>
        )}
      </section>
      {shown && chosen && <Details live={shown} cls={chosen} date={date} forTeacher />}
    </>
  );
}

function BatchNow({ c, date, live, selected }: { c: TodayClass; date: string; live: Live; selected: boolean }) {
  const meetKnown = live.status === 'ok' || live.status === 'no_call';
  return (
    <div className={`${styles.card} ${selected ? styles.selected : ''}`}>
      <div className={styles.cardTop}>
        <span className={c.state === 'live' ? styles.pulse : styles.soonDot} aria-hidden="true" />
        <span>{c.state === 'live' ? `Live · started ${clock12(c.time)}` : `Starting soon · ${clock12(c.time)}`}</span>
      </div>
      <strong className={styles.cardTitle}>{c.code}{c.name ? ` · ${c.name}` : ''}</strong>
      <span className={ui.muted}>{c.subject}</span>
      {meetKnown && <span className={styles.cardNote}>{live.inMeet} of {live.students.length} students in Meet</span>}
      {live.problem && <span className={styles.cardNote}>{live.problem}</span>}
      {c.register && <span className={styles.cardNote}>{c.register.clicked} pressed Join class so far</span>}
      {live.guests.length > 0 && (
        <span className={styles.cardNote}>{live.guests.length} unidentified {live.guests.length === 1 ? 'guest' : 'guests'} in the call</span>
      )}
      <div className={ui.formActions} style={{ marginTop: 10 }}>
        {c.hasRoom
          ? <a href={`/batches/${c.batchId}/meet`} target="_blank" rel="noopener noreferrer" className={ui.primaryButton}>Join class</a>
          : <Link href={`/batches/${c.batchId}`} className={ui.button}>Open batch</Link>}
        <Link href={`/batches/${c.batchId}?class_date=${date}#attendance`} className={ui.button}>Open attendance</Link>
        {c.hasRoom && <Link href={`/class-schedule?class=${c.batchId}#details`} className={ui.button}>Who is in the call</Link>}
      </div>
      {!c.hasRoom && <span className={styles.cardNote}>No Meet room for this batch yet: the class link is on the batch page.</span>}
    </div>
  );
}

function ExtraNow({ r }: { r: ListRow }) {
  const started = new Date(r.starts_at).getTime() <= Date.now();
  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <span className={started ? styles.pulse : styles.soonDot} aria-hidden="true" />
        <span>{started ? `Live · started ${ukClock(r.starts_at)}` : `Starting soon · ${ukClock(r.starts_at)}`}</span>
        <ExtraBadge />
      </div>
      <strong className={styles.cardTitle}>{r.code} · {KIND_LABEL[r.kind]}</strong>
      <span className={ui.muted}>{r.subject} · until {ukClock(r.ends_at)}</span>
      <span className={styles.cardNote}>{r.students.map((x) => x.name).join(', ')}</span>
      <div className={ui.formActions} style={{ marginTop: 10 }}>
        {r.has_meet_room && <a href={`/extra-classes/${r.id}/meet`} target="_blank" rel="noopener noreferrer" className={ui.primaryButton}>Join class</a>}
        <Link href={`/extra-classes/${r.id}#register`} className={ui.button}>Open attendance</Link>
      </div>
    </div>
  );
}

// Classes of this teacher that are at the same time this week: two weekly classes starting at the same time, or a
// weekly class starting during an extra class. The database refuses new clashes like these (guide 24), so this only
// shows up for times saved before those checks, and tells the teacher to ask the office.
function findClashes(week: WeekSlot[][], extras: ListRow[]) {
  const found: string[] = [];
  week.forEach((day, i) => {
    for (let a = 0; a < day.length; a++) {
      for (let b = a + 1; b < day.length; b++) {
        if (day[a].time === day[b].time) found.push(`${WEEKDAYS[i + 1]} ${clock12(day[a].time)}: ${day[a].code} and ${day[b].code}`);
      }
    }
  });
  for (const r of extras) {
    const weekday = ((new Date(`${ukDate(r.starts_at)}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const [from, to] = [ukClock24(r.starts_at), ukClock24(r.ends_at)];
    for (const c of week[weekday - 1] ?? []) {
      if (c.time >= from && c.time < to) found.push(`${WEEKDAYS[weekday]} ${clock12(c.time)}: ${c.code} and extra class ${r.code} (${clock12(from)}–${clock12(to)})`);
    }
  }
  return found;
}
