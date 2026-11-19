import Link from 'next/link';
import { Suspense } from 'react';
import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { requireStaffOrTeacher } from '@/lib/auth';
import { checkAfterPage } from '@/lib/meetCheck';
import { loadLive, loadSchedule, type Live, type TodayClass } from '@/lib/classSchedule';
import { clock12 } from '@/lib/format';
import { UUID, WEEKDAYS } from '@/lib/options';
import { ExtraLive, ExtraWeek, loadWeekExtras } from './ExtraSchedule';
import { Details, personState, STATE_LABEL, STATUS_NOTE } from './LiveDetails';
import { LiveRefresh } from './LiveRefresh';
import { TeacherSchedule } from './TeacherSchedule';
import styles from './schedule.module.css';

export const metadata = { title: 'Class Schedule' };

type Props = { searchParams: Promise<{ class?: string; ok?: string; error?: string }> };

// Class Schedule (guide 21, section 12) for staff: classes on now with who is in the Google Meet call, one
// class's details, today's classes and the week's timetable. Who is in the call comes from Google Meet (rooms the
// app made); "Join class" presses are shown beside it as a separate signal, never as proof of attending.
// A teacher gets their own Class Schedule instead (TeacherSchedule, guide 21 section 13): only their own classes,
// with who is in their call and "This is…", but no WhatsApp parent and no parents' details.
export default async function ClassSchedulePage({ searchParams }: Props) {
  const viewer = await requireStaffOrTeacher();
  const params = await searchParams;
  if (viewer.kind === 'teacher') return <TeacherSchedule teacherId={viewer.teacherId} params={params} />;
  const { class: picked, ok, error: problem } = params;
  const [s, extras] = await Promise.all([loadSchedule(), loadWeekExtras()]);
  const extrasOn = extras.filter((r) => r.status === 'live');
  const onNow = s.today.filter((c) => c.state === 'live' || c.state === 'soon');
  const chosen = UUID.test(picked ?? '') ? s.today.find((c) => c.batchId === picked) ?? null : null;
  const updatedAt = new Date().toISOString();
  const next = s.today.find((c) => c.state === 'later');
  const nextLine = next ? ` Next today: ${clock12(next.time)} ${next.code}${next.teacher ? ` with ${next.teacher}` : ''}.` : '';
  // Nothing on now: still catch up on finished classes nobody looked at, once the page is sent (guide 21, section 15).
  if (onNow.length === 0 && extrasOn.length === 0 && !chosen) checkAfterPage();

  return (
    <>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Class Schedule</h1>
          <p className={ui.subtitle}>Classes on now and who is in the Google Meet call, today&apos;s classes, and the week</p>
        </div>
        <LiveRefresh active={onNow.length > 0 || extrasOn.length > 0} updatedAt={updatedAt} />
      </div>
      <Alerts ok={ok} problem={problem} />
      {!s.meetReady && (
        <p className={`${ui.alert} ${ui.alertError}`}>
          The database is not ready for Meet rooms yet: run 20261114000001_meet_rooms.sql in Supabase. Until then only the
          timetable and Join class presses are shown.
        </p>
      )}

      {/* The classes on now wait for Google Meet, so they come in on their own: today and the week show at once. */}
      {onNow.length === 0 && extrasOn.length === 0 && !chosen ? (
        <section className={styles.block} aria-labelledby="live-title">
          <h2 id="live-title" className={styles.blockTitle}>Live now</h2>
          <p className={ui.empty}>No classes on right now.{nextLine}</p>
        </section>
      ) : (
        <Suspense fallback={<LiveWaiting />}>
          <LiveNow onNow={onNow} extrasOn={extrasOn} chosen={chosen} date={s.date} viewer={viewer} nextLine={nextLine} />
        </Suspense>
      )}

      <section className={styles.block} aria-labelledby="today-title">
        <h2 id="today-title" className={styles.blockTitle}>Today · {WEEKDAYS[s.weekday]}</h2>
        {s.today.length === 0 ? <p className={ui.empty}>No classes today.</p> : (
          <ol className={styles.timeline}>
            {s.today.map((c) => (
              <li key={c.batchId + c.time} className={`${styles.timelineItem} ${styles[c.state]}`}>
                <span className={styles.time}>{clock12(c.time)}</span>
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

      <ExtraWeek rows={extras} />

      <section className={styles.block} aria-labelledby="week-title">
        <h2 id="week-title" className={styles.blockTitle}>This week</h2>
        <div className={styles.week}>
          {s.week.map((day, i) => (
            <div key={i} className={`${styles.day} ${i + 1 === s.weekday ? styles.today : ''}`}>
              <h3>{WEEKDAYS[i + 1]}</h3>
              {day.length === 0 ? <p className={ui.muted}>—</p> : day.map((c) => (
                <Link key={c.batchId + c.time} href={`/batches/${c.batchId}`} className={styles.slot}>
                  <b>{clock12(c.time)}</b> {c.code}
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

function LiveWaiting() {
  return (
    <section className={styles.block} aria-labelledby="live-title" aria-busy="true">
      <h2 id="live-title" className={styles.blockTitle}>Live now</h2>
      <p className={ui.empty}>Asking Google Meet who is in the call…</p>
    </section>
  );
}

// Live now and one class's details: these ask Google Meet (each class gives up after 10 seconds, lib/meetCalls.ts).
async function LiveNow({ onNow, extrasOn, chosen, date, viewer, nextLine }: {
  onNow: TodayClass[]; extrasOn: Awaited<ReturnType<typeof loadWeekExtras>>; chosen: TodayClass | null; date: string;
  viewer: { kind: 'staff'; userId: string }; nextLine: string;
}) {
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
        {live.length === 0 && extrasOn.length === 0 ? (
          <p className={ui.empty}>No classes on right now.{nextLine}</p>
        ) : live.length > 0 && (
          <div className={styles.cards}>
            {live.map((l, i) => <LiveCard key={l.batchId + l.time} live={l} cls={onNow[i]} selected={chosen?.batchId === l.batchId} />)}
          </div>
        )}
        {/* Extra classes on now (guide 24). */}
        <ExtraLive rows={extrasOn} />
      </section>
      {shown && chosen && <Details live={shown} cls={chosen} date={date} />}
    </>
  );
}

function registerLine(c: TodayClass) {
  const r = c.register;
  if (!r) return c.state === 'done' ? 'No attendance' : '';
  return `${r.present + r.late} attended (${r.late} late) · ${r.absent} absent · ${r.clicked} pressed Join class`;
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
        <span>{cls.state === 'live' ? `Live · started ${clock12(cls.time)}` : `Starting soon · ${clock12(cls.time)}`}</span>
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
