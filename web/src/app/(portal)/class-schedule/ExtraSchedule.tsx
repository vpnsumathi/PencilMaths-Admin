import Link from 'next/link';
import ui from '@/components/ui.module.css';
import { KIND_LABEL, rangeDates, ukClock, ukDate, ukDay, type ListResult, type ListRow } from '@/lib/extraClasses';
import { todayInUk } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { ExtraBadge, ExtraStatusPill } from '../extra-classes/bits';
import x from '../extra-classes/extra.module.css';
import styles from './schedule.module.css';

// Extra classes on the Class Schedule page (guide 24): the ones on now (with check-ins; who is in the Meet call is
// on the class's own page), and this week's, each with the Extra label. Not cancelled ones.
export async function loadWeekExtras(): Promise<ListRow[]> {
  const supabase = await createClient();
  const { from, to } = rangeDates('week');
  const { data, error } = await supabase.rpc('extra_class_list', {
    p: { from, to, status: ['upcoming', 'live', 'to_mark', 'done', 'no_show'], order: 'soonest', page_size: 300 },
  });
  if (error && error.code !== 'PGRST202') console.error('Class Schedule extra classes:', error.message);
  return (data as ListResult | null)?.rows ?? [];
}

const names = (r: ListRow) => r.students.map((s) => s.name).join(', ');

export function ExtraLive({ rows }: { rows: ListRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className={styles.cards} style={{ marginTop: 12 }}>
      {rows.map((r) => {
        const started = new Date(r.starts_at).getTime() <= Date.now();
        const checked = r.students.filter((s) => s.mark_source === 'link' || (s.mark && s.mark !== 'absent')).length;
        return (
          <Link key={r.id} href={`/extra-classes/${r.id}`} className={styles.card}>
            <div className={styles.cardTop}>
              <span className={started ? styles.pulse : styles.soonDot} aria-hidden="true" />
              <span>{started ? `Live · started ${ukClock(r.starts_at)}` : `Starting soon · ${ukClock(r.starts_at)}`}</span>
              <ExtraBadge />
            </div>
            <strong className={styles.cardTitle}>{r.code} · {KIND_LABEL[r.kind]}</strong>
            <span className={ui.muted}>{r.subject} · until {ukClock(r.ends_at)}</span>
            <div className={styles.cardFacts} style={{ marginTop: 8 }}>
              <span>{names(r)}</span>
              <span>{r.teacher}</span>
              <span className={ui.muted}>{checked} of {r.students.length} checked in · open for who is in Meet</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function ExtraWeek({ rows }: { rows: ListRow[] }) {
  const today = todayInUk();
  return (
    <section className={styles.block} aria-labelledby="extra-week-title">
      <h2 id="extra-week-title" className={styles.blockTitle}>Extra classes this week <ExtraBadge /></h2>
      {rows.length === 0 ? (
        <p className={ui.empty}>No extra classes this week. <Link href="/extra-classes/new" className={ui.link}>Create one</Link>.</p>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead><tr><th>Day</th><th>Time</th><th>Class</th><th>Students</th><th>Teacher</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={ukDate(r.starts_at) === today ? { background: 'var(--brand-ring)' } : undefined}>
                  <td>{ukDate(r.starts_at) === today ? <b>Today</b> : ukDay(r.starts_at)}</td>
                  <td>{ukClock(r.starts_at)}–{ukClock(r.ends_at)}</td>
                  <td><Link href={`/extra-classes/${r.id}`} className={ui.link}>{r.code}</Link> <span className={x.sub}>· {KIND_LABEL[r.kind]} · {r.subject}</span></td>
                  <td>{names(r)}</td>
                  <td>{r.teacher}</td>
                  <td><ExtraStatusPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
