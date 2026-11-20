import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { clock12 } from '@/lib/format';
import { ukClock, ukMoment, ukNow } from '@/lib/liveClass';
import { checkAfterPage, type ClassRef } from '@/lib/meetCheck';
import { SCRIPT, type Loaded } from './load';
import {
  classState, liveStatus, liveSummary, nextUp, pickLive, timeline, type LiveClass, type TodayClass, type TodayData,
} from './model';
import { NextClass } from './NextClass';
import styles from '../dashboard.module.css';

// The Today band (guide 28): today's timeline, Live now, Next up and Attendance not taken.
// Only saved records: who is in each call comes from the Meet check-in (guide 21, section 15), never from Google
// while the page is made. After the page has been sent, the live classes whose last check is over 2 minutes old
// are checked with Meet (at most 10, one after the other), so the next visit is fresher.

const REFRESH_AFTER_MS = 2 * 60_000;
const REFRESH_MAX = 10;

export async function Today({ data, teacher }: { data: Promise<Loaded<TodayData>>; teacher: boolean }) {
  const res = await data;
  if (!res.ok) {
    checkAfterPage();
    return (
      <Band teacher={teacher}>
        <p className={styles.bandNote}>
          {res.notSetUp ? <>Not set up yet: run <code>{SCRIPT}</code> on this database.</> : 'Today’s classes couldn’t be loaded. Refresh the page to try again.'}
        </p>
      </Band>
    );
  }
  const now = new Date();
  const uk = ukNow(now);
  const { date, classes, missing } = res.data;
  const placed = classes.map((c) => ({ ...c, ...classState(c, uk.minute) }));
  const live: LiveClass[] = placed.filter((c) => c.state === 'live')
    .map((c) => ({ ...c, status: liveStatus(c, c.minutesIn, ukMoment(date, c.start), ukClock) }));
  const upcoming = placed.filter((c) => c.state === 'later' || c.state === 'soon');
  const done = placed.filter((c) => c.state === 'done').length;
  const pick = pickLive(live);
  const next = nextUp(upcoming);
  const line = timeline(classes, uk.minute);
  const lastChecked = classes.map((c) => c.meet?.checked_at).filter((x): x is string => Boolean(x)).sort().at(-1);

  // Fresher next time: live classes with a Meet room whose last check is over 2 minutes old (guide 21, section 15).
  const stale: ClassRef[] = live
    .filter((c) => c.has_room && (!c.meet || now.getTime() - Date.parse(c.meet.checked_at) > REFRESH_AFTER_MS))
    .slice(0, REFRESH_MAX)
    .map((c) => (c.kind === 'extra' ? { kind: 'extra', id: c.id } : { kind: 'batch', batchId: c.id, date }));
  checkAfterPage(stale);

  return (
    <Band teacher={teacher}>
      <div className={styles.bandHead}>
        <p className={styles.bandStats}>
          <strong>{classes.length}</strong> {classes.length === 1 ? 'class' : 'classes'} today
          <span aria-hidden="true"> · </span>{done} done · {live.length} on now · {upcoming.length} to come
        </p>
        <p className={styles.bandChecked}>
          {lastChecked ? <>Meet last checked {ukClock(lastChecked)}</> : 'Meet not checked yet today'}
        </p>
      </div>

      {line && (
        <div className={styles.timeline} role="img"
          aria-label={`Classes per half hour from ${clock12(line.from)} to ${clock12(line.to)}; ${live.length} on now`}>
          <div className={styles.timelineBars}>
            {line.slots.map((s) => (
              <span key={s.at} className={`${styles.slot} ${styles[`slot_${s.when}`]}`} title={`${clock12(s.at)}: ${s.count} starting`}>
                <span style={{ height: `${Math.max((100 * s.count) / line.max, s.count ? 12 : 4)}%` }} />
              </span>
            ))}
            <span className={styles.nowMarker} style={{ left: `${line.nowAt}%` }}><span>Now</span></span>
          </div>
          <div className={styles.timelineAxis}><span>{clock12(line.from)}</span><span>{clock12(line.to)}</span></div>
        </div>
      )}

      {missing.length > 0 && (
        <p className={styles.bandAlert}>
          <span className={styles.dotRed} aria-hidden="true" />
          <strong>Attendance not taken:</strong>{' '}
          {missing.slice(0, 4).map((m, i) => (
            <span key={m.batch_id + m.start}>
              {i > 0 && ', '}
              <Link href={`/batches/${m.batch_id}?class_date=${date}#attendance`}>{m.code} {clock12(m.start)}</Link>
            </span>
          ))}
          {missing.length > 4 && <> and {missing.length - 4} more</>}
        </p>
      )}

      {teacher && (
        <Suspense fallback={null}>
          <div className={styles.teacherNext}><NextClass /></div>
        </Suspense>
      )}

      <div className={styles.bandGrid}>
        <section aria-labelledby="live-now" className={styles.bandBlock}>
          <div className={styles.blockHead}>
            <h2 id="live-now" className={styles.liveTitle}><span className={styles.liveDot} aria-hidden="true" />Live now · {live.length}</h2>
            {liveSummary(pick.counts).map((p) => <span key={p} className={styles.livePill}>{p}</span>)}
          </div>
          {live.length === 0 ? <p className={styles.bandNote}>No class on right now.</p> : (
            <>
              <div className={styles.liveCards}>
                {pick.cards.map((c) => (
                  <Link key={c.kind + c.id} href={liveHref(c)} className={`${styles.liveCard} ${c.status.problem ? styles.liveProblem : ''}`}>
                    <span className={styles.liveCardText}>
                      <strong>{c.code}{c.teacher && !teacher ? ` · ${c.teacher}` : ''}</strong>
                      <span className={c.status.problem ? styles.textWarn : styles.textOk}>
                        {c.status.text}{c.status.lowCheckIn ? ' · low check-in' : ''} · started {clock12(c.start)}
                      </span>
                    </span>
                    <span className={styles.mono} title="Checked in of expected">{c.checked_in}/{c.expected}</span>
                  </Link>
                ))}
              </div>
              {pick.tiles.length > 0 && (
                <div className={styles.liveTiles}>
                  {pick.tiles.map((c) => (
                    <Link key={c.kind + c.id} href={liveHref(c)} className={styles.liveTile} title={c.status.text}>
                      <span><span className={c.status.problem ? styles.dotAmber : styles.dotGreen} aria-hidden="true" /><span>{c.code}</span></span>
                      <span className={styles.mono}>{c.checked_in}/{c.expected} in</span>
                    </Link>
                  ))}
                  <Link href="/class-schedule" className={styles.seeAll} aria-label={`See all ${live.length} live classes`}>See all {live.length} →</Link>
                </div>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="next-up" className={styles.bandBlock}>
          <h2 id="next-up" className={styles.blockTitle}>Next up</h2>
          {!next ? <p className={styles.bandNote}>No more classes today.</p> : (
            <>
              <p className={styles.nextTime}>{clock12(next.start)} <span>· {next.classes.length} {next.classes.length === 1 ? 'class' : 'classes'}</span></p>
              <div className={styles.nextList}>
                {next.classes.slice(0, 8).map((c) => (
                  <Link key={c.kind + c.id} href={c.kind === 'extra' ? `/extra-classes/${c.id}` : `/batches/${c.id}`} className={styles.nextChip}>
                    {c.code}{c.kind === 'extra' ? ' · extra' : ''}
                  </Link>
                ))}
                {next.classes.length > 8 && <span className={styles.bandNote}>+{next.classes.length - 8}</span>}
              </div>
              {next.laterCount > 0 && (
                <Link href="/class-schedule" className={styles.viewMore}>
                  View more · {next.laterCount} later today ({next.laterTimes.map((t) => clock12(t)).join(', ')}) →
                </Link>
              )}
            </>
          )}
        </section>
      </div>
    </Band>
  );
}

function liveHref(c: TodayClass) {
  return c.kind === 'extra' ? `/extra-classes/${c.id}` : `/class-schedule?class=${c.id}#details`;
}

function Band({ children, teacher }: { children: ReactNode; teacher: boolean }) {
  return (
    <section className={styles.band} aria-label={teacher ? 'Your classes today' : 'Today'}>
      {children}
    </section>
  );
}

// The same size as the band, so nothing jumps when it arrives.
export function TodayLoading() {
  return (
    <section className={`${styles.band} ${styles.bandLoading}`} aria-label="Today" role="status">
      <span className={styles.srOnly}>Loading today’s classes…</span>
      <span className={styles.ghostLine} style={{ width: '40%' }} />
      <span className={styles.ghostBar} />
      <div className={styles.bandGrid}>
        <span className={styles.ghostBlock} />
        <span className={styles.ghostBlock} />
      </div>
    </section>
  );
}
