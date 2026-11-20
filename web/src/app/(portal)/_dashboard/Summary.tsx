import Link from 'next/link';
import { ENQUIRY_STAGES, OPEN_STAGES } from '@/lib/options';
import { whatsappNumber } from './homework';
import { SCRIPT, type Loaded } from './load';
import {
  change, countText, itemHref, itemText, pct, rankNeeds, SHOW_CHIPS, type RankedNeed, type Show, type SummaryData,
} from './model';
import { NudgeButton } from './NudgeButton';
import styles from '../dashboard.module.css';

// The rest of the Dashboard (guide 28): the week tiles, Needs you and At a glance, from one dashboard_summary()
// answer. Everything is plain server-made HTML; the only browser code is the WhatsApp nudge button.

export async function Summary({ data, show }: { data: Promise<Loaded<SummaryData>>; show: Show }) {
  const res = await data;
  if (!res.ok) {
    return (
      <p className={styles.notice}>
        {res.notSetUp ? <>Not set up yet: run <code>{SCRIPT}</code> on this database to see the tiles and Needs you.</>
          : 'The numbers couldn’t be loaded. Refresh the page to try again.'}
      </p>
    );
  }
  const d = res.data;
  const teacher = d.role === 'teacher';
  return (
    <>
      <Tiles d={d} teacher={teacher} />
      <div className={styles.lower}>
        <NeedsYou d={d} show={show} teacher={teacher} />
        <Glance d={d} teacher={teacher} />
      </div>
    </>
  );
}

// ---------- This week: the tiles ----------
function Tiles({ d, teacher }: { d: SummaryData; teacher: boolean }) {
  const { students: s, attendance: a, homework: h, enquiries: e } = d.tiles;
  const here = pct(a.here, a.marks);
  const onTime = pct(h.on_time, h.due);
  const converted = e ? pct(e.enrolled, e.decided) : null;
  return (
    <section className={styles.tiles} aria-label="This week">
      <Tile href="/students" label={teacher ? 'My students' : 'Students'} value={String(s.current)}
        delta={change(s.current, s.trend)} trend={s.trend}
        lines={[`${s.active} active · ${s.trial} trial`, `+${s.new_28} new · ${s.left_28} left in 28 days`]} />
      <Tile href="/attendance?range=week" label="Attendance this week" value={here == null ? '—' : `${here}%`} unit="%"
        delta={change(here, a.trend)} trend={a.trend} max={100}
        lines={[
          a.marks ? `Present or late, from ${a.marks} marks · ${pct(a.late, a.marks)}% late` : 'No marks yet this week',
          `Attendance recorded for ${a.recorded} of ${a.expected} expected ${a.expected === 1 ? 'class' : 'classes'}`,
        ]} warn={a.recorded < a.expected} />
      <Tile href="/homework-tracker" label="Homework on time" value={onTime == null ? '—' : `${onTime}%`} unit="%"
        delta={change(onTime, h.trend)} trend={h.trend} max={100}
        lines={[h.due ? `Of ${h.due} due so far this week` : 'Nothing due yet this week', `To mark ${h.to_mark} · Overdue ${h.overdue}`]} />
      {e && (
        <Tile href="/enquiries" label="Open enquiries" value={String(e.open)} trend={e.trend} trendLabel="new per week"
          lines={[`${e.new_week} new this week`,
            converted == null ? 'No decisions yet this school year' : `${converted}% converted this school year (${e.enrolled} of ${e.decided})`]} />
      )}
    </section>
  );
}

type TileProps = {
  href: string; label: string; value: string; unit?: string; lines: string[]; trend: (number | null)[];
  delta?: number | null; max?: number; warn?: boolean; trendLabel?: string;
};
function Tile({ href, label, value, unit = '', lines, trend, delta = null, max, warn, trendLabel = 'last 6 weeks' }: TileProps) {
  return (
    <Link href={href} className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileRow}>
        <strong className={styles.tileValue}>{value}</strong>
        {delta != null && delta !== 0 && (
          <span className={delta > 0 ? styles.up : styles.down}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}{unit} <span className={styles.srOnly}>against last week</span>
          </span>
        )}
      </span>
      {lines.map((l, i) => <span key={l} className={`${styles.tileLine} ${warn && i === lines.length - 1 ? styles.textWarnDark : ''}`}>{l}</span>)}
      <Sparkline values={trend} max={max} label={trendLabel} />
    </Link>
  );
}

// A tiny trend line: the last 6 complete weeks. Gaps (null) are skipped; the last point gets a dot.
function Sparkline({ values, max, label }: { values: (number | null)[]; max?: number; label: string }) {
  const w = 120;
  const h = 28;
  const top = max ?? Math.max(...values.map((v) => v ?? 0), 1);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values.map((v, i) => (v == null ? null : { x: i * step, y: h - 3 - ((h - 6) * v) / top }))
    .filter((p): p is { x: number; y: number } => p !== null);
  if (points.length < 2) return <span className={styles.sparkEmpty}>Trend after 2 weeks of data</span>;
  const last = points.at(-1)!;
  return (
    <span className={styles.sparkWrap}>
      <svg className={styles.spark} viewBox={`-4 0 ${w + 8} ${h}`} aria-hidden="true">
        <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} />
        <circle cx={last.x} cy={last.y} r={3.5} />
      </svg>
      <span className={styles.sparkLabel}>{label}</span>
    </span>
  );
}

// ---------- Needs you ----------
function NeedsYou({ d, show, teacher }: { d: SummaryData; show: Show; teacher: boolean }) {
  const r = rankNeeds(d.needs, show);
  const chips = (Object.keys(SHOW_CHIPS) as (keyof typeof SHOW_CHIPS)[]);
  return (
    <section className={`${styles.card} ${styles.needs}`} aria-labelledby="needs-you" id="needs">
      <div className={styles.cardHead}>
        <h2 id="needs-you">Needs you {r.total > 0 && <span className={styles.count}>{r.total}</span>}</h2>
        {r.total > 0 && (
          <nav className={styles.chips} aria-label="Show">
            {chips.map((c) => (
              <Link key={c} href={show === c ? '/#needs' : `/?show=${c}#needs`} scroll={false}
                className={`${styles.chip} ${show === c ? styles.chipOn : ''}`} aria-current={show === c ? 'true' : undefined}>
                {SHOW_CHIPS[c]} <span>{r.areaTotals[c]}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
      {r.total === 0 ? <p className={styles.allClear}>Nothing needs you right now.</p>
        : r.shown.length === 0 ? <p className={styles.muted}>Nothing here. <Link href="/#needs" className={styles.link}>Show the most urgent</Link></p>
        : (
          <ul className={styles.needList}>
            {r.shown.map((g) => <NeedRow key={g.key} g={g} today={d.date} teacher={teacher} />)}
          </ul>
        )}
      {r.hidden.length > 0 && (
        <Link href={`/?show=${show ?? 'all'}#needs`} scroll={false} className={styles.seeMore}>
          See more · {r.hidden.length} more {r.hidden.length === 1 ? 'group' : 'groups'} ({r.hidden.map((g) => g.title).join(', ')}) →
        </Link>
      )}
    </section>
  );
}

function NeedRow({ g, today, teacher }: { g: RankedNeed; today: string; teacher: boolean }) {
  return (
    <li className={styles.needRow}>
      <div className={styles.needHead}>
        <span className={styles[`dot_${g.tone}`]} aria-hidden="true" />
        <strong>{g.title}</strong>
        <span className={styles.needCount}>{countText(g)}</span>
        <Link href={g.all} className={styles.needAll}>{g.allLabel} →</Link>
      </div>
      <ul className={styles.needItems}>
        {g.items.map((i, n) => {
          const t = itemText(g.key, i, today);
          return (
            <li key={n}>
              <Link href={itemHref(g.key, i)} className={styles.needItem}>
                <span>{t.main}</span> <span className={styles.muted}>{t.sub}</span>
              </Link>
              {g.key === 'falling_behind' && !teacher && (
                <NudgeButton student={{
                  firstName: String(i.first_name ?? ''), overdue: Number(i.overdue), titles: (i.titles as string[] | null) ?? [],
                  phone: whatsappNumber((i.phone as string | null) ?? null), group: (i.group as string | null) ?? null,
                  parent: (i.parent as string | null) ?? null,
                }} />
              )}
            </li>
          );
        })}
        {g.total > g.items.length && <li className={styles.muted}>and {g.total - g.items.length} more</li>}
      </ul>
    </li>
  );
}

// ---------- At a glance ----------
function Glance({ d, teacher }: { d: SummaryData; teacher: boolean }) {
  const e = d.tiles.enquiries;
  const p = d.glance.places;
  const stageTotal = e ? OPEN_STAGES.reduce((n, s) => n + (e.stages[s] ?? 0), 0) : 0;
  return (
    <aside className={styles.glance} aria-label="At a glance">
      {e && (
        <section className={styles.card}>
          <h2 className={styles.smallTitle}>Enquiry stages</h2>
          {stageTotal === 0 ? <p className={styles.muted}>No open enquiries.</p> : (
            <>
              <div className={styles.stageBar} role="img"
                aria-label={OPEN_STAGES.map((s) => `${ENQUIRY_STAGES[s]} ${e.stages[s] ?? 0}`).join(', ')}>
                {OPEN_STAGES.map((s, i) => (e.stages[s] ?? 0) > 0 && (
                  <span key={s} className={styles[`stage${i + 1}`]} style={{ flexGrow: e.stages[s] }} />
                ))}
              </div>
              <ul className={styles.stageKey}>
                {OPEN_STAGES.map((s, i) => (
                  <li key={s}><span className={styles[`stage${i + 1}`]} aria-hidden="true" />{ENQUIRY_STAGES[s]} <b>{e.stages[s] ?? 0}</b></li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {p && (
        <section className={styles.card}>
          <h2 className={styles.smallTitle}>Batch places</h2>
          <p className={styles.glanceBig}>{p.used} <span>of {p.seats} places used · {p.batches} open batches</span></p>
          {p.nearly_full.length === 0 ? <p className={styles.muted}>No batch is 90% full.</p> : (
            <ul className={styles.fullList}>
              {p.nearly_full.map((b) => (
                <li key={b.batch_id}>
                  <Link href={`/batches/${b.batch_id}`} className={styles.link}>{b.code}</Link>
                  <span className={styles.meter}><span style={{ width: `${Math.min(100, (100 * b.members) / b.capacity)}%` }} /></span>
                  <span className={styles.mono}>{b.members}/{b.capacity}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className={styles.card}>
        <h2 className={styles.smallTitle}>{teacher ? 'Your week so far' : 'This week so far'}</h2>
        <ul className={styles.weekList}>
          <li><b>{d.glance.classes_held}</b> classes with Attendance</li>
          <li><b>{d.glance.submitted}</b> homework submitted</li>
          <li><b>{d.glance.corrected}</b> homework corrected</li>
        </ul>
      </section>
    </aside>
  );
}

// The same size as the tiles and cards, so nothing jumps when they arrive.
export function SummaryLoading() {
  return (
    <div role="status">
      <span className={styles.srOnly}>Loading the numbers…</span>
      <div className={styles.tiles}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={`${styles.tile} ${styles.ghostTile}`} />)}
      </div>
      <div className={styles.lower}>
        <span className={`${styles.card} ${styles.ghostCard}`} />
        <span className={`${styles.card} ${styles.ghostCard}`} />
      </div>
    </div>
  );
}
