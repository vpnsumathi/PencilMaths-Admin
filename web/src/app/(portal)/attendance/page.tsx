import Link from 'next/link';
import ui from '@/components/ui.module.css';
import {
  attendanceHref, markLetter, RANGES, readFilters, reportArgs, setByText, SHOW, TABS,
  type Attention, type CorrectionRow, type Filters, type Grid, type ListRow, type Summary,
} from '@/lib/attendanceReport';
import { ATTENDANCE_LABEL, markLabel } from '@/lib/classLink';
import { formatClock, formatDate, formatDay } from '@/lib/format';
import { isTeacher } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import styles from './attendance.module.css';

export const metadata = { title: 'Attendance' };

const PAGE_SIZE = 50;
const NOT_READY = 'The database is not ready for this yet: run 20261113000001_attendance_report.sql in Supabase first.';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// "2026-11-10" → "10 Nov"
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekdayShort = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : null);

// Attendance across batches, for checking and correcting: filters at the top (kept in the address, so a link
// opens the same view), five tiles, then four tabs. Teachers get the same page for their own batches only
// (the database decides). Corrections are made on the batch page's register, which every row links to.
export default async function AttendancePage({ searchParams }: Props) {
  const f = readFilters(await searchParams);
  const supabase = await createClient();
  const args = reportArgs(f);

  const [teacher, summaryRes, attentionRes, { data: batches }, { data: students }, { data: teachers }, tabRes] = await Promise.all([
    isTeacher(),
    supabase.rpc('attendance_summary', args),
    supabase.rpc('attendance_attention', args),
    supabase.from('batch_list').select('id, code, name, subject, closed_on').order('closed_on', { ascending: false, nullsFirst: true }).order('code'),
    supabase.from('students').select('id, code, first_name, last_name').order('first_name').order('last_name'),
    supabase.from('teachers').select('id, first_name, last_name').order('first_name'),
    f.tab === 'list'
      ? (f.batch ? supabase.rpc('attendance_grid', { p_batch: f.batch, p_from: f.from, p_to: f.to, p_student: f.student }) : Promise.resolve({ data: null, error: null }))
      : f.tab === 'all'
        ? supabase.rpc('attendance_list', { ...args, p_show: f.show, p_limit: PAGE_SIZE, p_offset: (f.page - 1) * PAGE_SIZE })
        : f.tab === 'corrections'
          ? supabase.rpc('attendance_corrections', { ...args, p_limit: PAGE_SIZE, p_offset: (f.page - 1) * PAGE_SIZE })
          : Promise.resolve({ data: null, error: null }),
  ]);

  const failed = summaryRes.error ?? attentionRes.error ?? tabRes.error;
  if (failed) console.error('Attendance page:', failed.message);
  const notReady = failed?.code === 'PGRST202';
  const summary = summaryRes.data as Summary | null;
  const attention = attentionRes.data as Attention | null;
  const attentionCount = attention ? attention.unconfirmed.length + attention.missing.length + attention.streaks.length : 0;
  const batchName = (batches ?? []).find((b) => b.id === f.batch);

  return (
    <div className={styles.page}>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Attendance</h1>
          <p className={ui.subtitle}>
            Check, compare and correct attendance{teacher ? ' in your batches' : ' across batches'}.
            To change a mark, open that day&apos;s register from any row.
          </p>
        </div>
      </div>

      {/* Filters: a plain form, so they work without JavaScript and end up in the address. */}
      <form method="get" action="/attendance" className={styles.filters}>
        <input type="hidden" name="tab" value={f.tab} />
        <input type="hidden" name="range" value={f.range} />
        <div className={`${styles.field} ${styles.wide}`}>
          <span className={ui.label}>Dates</span>
          <div className={styles.chips}>
            {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((r) => (
              <Link key={r} href={attendanceHref(f, { range: r, page: 1 })} className={`${styles.chip} ${f.range === r ? styles.chipOn : ''}`}
                aria-current={f.range === r ? 'true' : undefined}>{RANGES[r]}</Link>
            ))}
          </div>
          {f.range === 'custom' && (
            <div className={styles.dates}>
              <input type="date" name="from" defaultValue={f.from} aria-label="From" className={ui.input} required />
              <span className={ui.muted}>to</span>
              <input type="date" name="to" defaultValue={f.to} aria-label="To" className={ui.input} required />
            </div>
          )}
        </div>
        <label className={styles.field}>
          <span className={ui.label}>Batch</span>
          <select name="batch" defaultValue={f.batch ?? ''} className={ui.select}>
            <option value="">All batches</option>
            {(batches ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.code}{b.name ? ` · ${b.name}` : ''} · {b.subject}{b.closed_on ? ' (closed)' : ''}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={ui.label}>Student</span>
          <select name="student" defaultValue={f.student ?? ''} className={ui.select}>
            <option value="">All students</option>
            {(students ?? []).map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} · {s.code}</option>)}
          </select>
        </label>
        {!teacher && (
          <label className={styles.field}>
            <span className={ui.label}>Teacher</span>
            <select name="teacher" defaultValue={f.teacher ?? ''} className={ui.select}>
              <option value="">All teachers</option>
              {(teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
            </select>
          </label>
        )}
        {f.tab === 'all' && (
          <label className={styles.field}>
            <span className={ui.label}>Show</span>
            <select name="show" defaultValue={f.show} className={ui.select}>
              {(Object.keys(SHOW) as (keyof typeof SHOW)[]).map((s) => <option key={s} value={s}>{SHOW[s]}</option>)}
            </select>
          </label>
        )}
        <div className={styles.actions}>
          <button className={ui.primaryButton}>Show</button>
          <Link href={attendanceHref({ ...f, batch: null, student: null, teacher: null, show: 'all', page: 1, range: '4w' }, {})} className={ui.button}>Clear</Link>
          <a href={attendanceHref(f, { page: 1 }, '/attendance/export')} className={ui.button} download>Export CSV</a>
        </div>
      </form>

      {notReady ? <p className={ui.empty}>{NOT_READY}</p> : failed ? <p className={ui.empty}>The attendance could not be loaded. Please try again.</p> : (
        <>
          <p className={styles.caption}>
            {f.range === 'all' ? `All classes up to ${formatDate(f.to)}` : `${formatDate(f.from)} to ${formatDate(f.to)}`}
            {batchName ? ` · ${batchName.code}` : ''}
          </p>
          {summary && <Tiles f={f} s={summary} attentionCount={attentionCount} />}

          <nav className={styles.tabs} aria-label="Attendance views">
            {(Object.keys(TABS) as (keyof typeof TABS)[]).map((t) => (
              <Link key={t} href={attendanceHref(f, { tab: t, page: 1 })} className={`${styles.tab} ${f.tab === t ? styles.tabOn : ''}`}
                aria-current={f.tab === t ? 'page' : undefined}>
                {TABS[t]}{t === 'attention' && attentionCount > 0 ? <span className={styles.count}>{attentionCount}</span> : null}
              </Link>
            ))}
          </nav>
          <section className={styles.panel}>
            {f.tab === 'list' && (f.batch
              ? <GridView f={f} grid={tabRes.data as Grid} />
              : <ChooseBatch f={f} batches={(batches ?? []).filter((b) => !b.closed_on)} />)}
            {f.tab === 'all' && <ListView f={f} data={tabRes.data as { total: number; rows: ListRow[] }} />}
            {f.tab === 'corrections' && <CorrectionsView f={f} data={tabRes.data as { total: number; rows: CorrectionRow[] }} />}
            {f.tab === 'attention' && attention && <AttentionView a={attention} />}
          </section>
        </>
      )}
    </div>
  );
}

function Tiles({ f, s, attentionCount }: { f: Filters; s: Summary; attentionCount: number }) {
  const rate = pct(s.present + s.late, s.marks);
  return (
    <div className={styles.tiles}>
      <div className={styles.tile}><span>Classes held</span><b>{s.classes_held}</b></div>
      <div className={styles.tile}>
        <span>Attended</span><b>{rate === null ? '—' : `${rate}%`}</b>
        <small>{s.present} present · {s.late} late · {s.absent} absent</small>
      </div>
      <Link href={attendanceHref(f, { tab: 'all', show: 'checked_in', page: 1 })} className={`${styles.tile} ${s.checked_in > 0 ? styles.tileWarn : ''}`}>
        <span>Check-ins not confirmed</span><b>{s.checked_in}</b>
      </Link>
      <Link href={attendanceHref(f, { tab: 'attention', page: 1 })} className={`${styles.tile} ${s.missing_registers > 0 ? styles.tileBad : ''}`}>
        <span>Classes with no register</span><b>{s.missing_registers}</b>
        {attentionCount > 0 && <small>See Needs attention</small>}
      </Link>
      <Link href={attendanceHref(f, { tab: 'corrections', page: 1 })} className={styles.tile}>
        <span>Corrections</span><b>{s.corrections}</b>
      </Link>
    </div>
  );
}

function ChooseBatch({ f, batches }: { f: Filters; batches: { id: string; code: string; name: string | null; subject: string }[] }) {
  return (
    <>
      <p style={{ marginTop: 0 }}>Choose a batch to see its Attendance List: students down the side, classes across the top.</p>
      {batches.length === 0 ? <p className={ui.empty}>No open batches.</p> : (
        <div className={styles.chips}>
          {batches.map((b) => (
            <Link key={b.id} href={attendanceHref(f, { batch: b.id, page: 1 })} className={styles.chip}>
              {b.code}{b.name ? ` · ${b.name}` : ''} · {b.subject}
            </Link>
          ))}
        </div>
      )}
      <p className={ui.hint} style={{ marginTop: 12 }}>For every batch at once, use <Link href={attendanceHref(f, { tab: 'all' })} className={ui.link}>All Attendance</Link>.</p>
    </>
  );
}

// Attendance List: one batch as a grid. Each box shows the mark; hover (or long-press) for when, who and why.
function GridView({ f, grid }: { f: Filters; grid: Grid | null }) {
  if (!grid) return <p className={ui.empty}>This batch could not be loaded.</p>;
  if (grid.dates.length === 0) return <p className={ui.empty}>No classes in these dates.</p>;
  const register = (d: string) => `/batches/${f.batch}?class_date=${d}#attendance`;
  return (
    <>
      <div className={styles.gridWrap}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th scope="col" className={styles.stickyCol}>Student</th>
              {grid.dates.map((d) => (
                <th key={d.class_date} scope="col" className={d.missing ? styles.missingCol : undefined}>
                  <Link href={register(d.class_date)} title={d.missing ? 'No register yet: open it to take one' : 'Open this day’s register'}>
                    <span className={styles.wd}>{weekdayShort(d.class_date)}</span>{short(d.class_date)}
                  </Link>
                </th>
              ))}
              <th scope="col">Attended</th>
            </tr>
          </thead>
          <tbody>
            {grid.students.map((s) => {
              const marks = Object.values(s.marks);
              const attended = marks.filter((m) => m.status !== 'absent').length;
              const rate = pct(attended, marks.length);
              return (
                <tr key={s.id}>
                  <th scope="row" className={styles.stickyCol}>
                    <Link href={`/students/${s.id}`} className={ui.link}>{s.first_name} {s.last_name}</Link>
                    {!s.in_batch && <small className={styles.left}>left</small>}
                  </th>
                  {grid.dates.map((d) => {
                    const m = s.marks[d.class_date];
                    const outside = (s.started_on && d.class_date < s.started_on) || (s.ended_on && d.class_date > s.ended_on);
                    if (!m) {
                      return (
                        <td key={d.class_date}>
                          <span className={`${styles.cell} ${styles.cellEmpty}`} title={outside ? 'Not in the batch on this day' : d.missing ? 'No register' : 'Not marked'}>
                            {outside ? '–' : d.missing ? '?' : ''}
                          </span>
                        </td>
                      );
                    }
                    const letter = markLetter(m);
                    const tip = [
                      `${weekdayShort(d.class_date)} ${formatDate(d.class_date)}`,
                      markLabel(m.status, m.source),
                      m.joined_at ? `checked in ${formatClock(m.joined_at)}` : '',
                      setByText(m.source, m.by),
                      m.corrected ? `corrected${m.reason ? `: "${m.reason}"` : ''}` : '',
                    ].filter(Boolean).join(' · ');
                    return (
                      <td key={d.class_date}>
                        <span className={`${styles.cell} ${styles[`cell${letter}`]} ${m.corrected ? styles.corrected : ''}`} title={tip} aria-label={tip}>
                          {letter}
                        </span>
                      </td>
                    );
                  })}
                  <td className={rate !== null && rate < 80 ? styles.low : styles.good}>
                    {marks.length ? `${attended}/${marks.length} · ${rate}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className={styles.stickyCol}>Class total</th>
              {grid.dates.map((d) => <td key={d.class_date}>{d.missing ? 'none' : `${d.attended}/${d.total}`}</td>)}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <Legend />
    </>
  );
}

function Legend() {
  return (
    <p className={styles.legend}>
      <span><span className={`${styles.cell} ${styles.cellP}`}>P</span> Present</span>
      <span><span className={`${styles.cell} ${styles.cellL}`}>L</span> Late</span>
      <span><span className={`${styles.cell} ${styles.cellA}`}>A</span> Absent</span>
      <span><span className={`${styles.cell} ${styles.cellC}`}>C</span> Checked in, not confirmed</span>
      <span><span className={`${styles.cell} ${styles.cellP} ${styles.corrected}`}>P</span> Corrected</span>
      <span><span className={`${styles.cell} ${styles.cellEmpty}`}>?</span> No register</span>
      <span><span className={`${styles.cell} ${styles.cellEmpty}`}>–</span> Not in the batch then</span>
      <span>Point at a box for the details · click a date to open that day&apos;s register</span>
    </p>
  );
}

function Pager({ f, total }: { f: Filters; total: number }) {
  if (total <= PAGE_SIZE) return <p className={styles.legend}>{total} {total === 1 ? 'row' : 'rows'}</p>;
  const last = Math.ceil(total / PAGE_SIZE);
  const first = (f.page - 1) * PAGE_SIZE + 1;
  return (
    <p className={styles.pager}>
      {f.page > 1 ? <Link href={attendanceHref(f, { page: f.page - 1 })} className={ui.button}>← Newer</Link> : <span />}
      <span className={ui.muted}>{first}–{Math.min(f.page * PAGE_SIZE, total)} of {total}</span>
      {f.page < last ? <Link href={attendanceHref(f, { page: f.page + 1 })} className={ui.button}>Older →</Link> : <span />}
    </p>
  );
}

function ListView({ f, data }: { f: Filters; data: { total: number; rows: ListRow[] } | null }) {
  if (!data) return <p className={ui.empty}>The attendance could not be loaded.</p>;
  if (data.total === 0) return <p className={ui.empty}>Nothing matches these filters.</p>;
  return (
    <>
      <div className={styles.tableScroll}>
        <table className={ui.table}>
          <thead>
            <tr><th>Date</th><th>Batch</th><th>Student</th><th>Attendance</th><th>Set by</th><th>Portal check-in</th><th>Changes / notes</th></tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={`${r.class_date}-${r.batch_id}-${r.student_id}`}>
                <td><Link href={`/batches/${r.batch_id}?class_date=${r.class_date}#attendance`} className={ui.link}>{weekdayShort(r.class_date)} {formatDate(r.class_date)}</Link></td>
                <td>{r.batch_code} <span className={ui.muted}>· {r.subject}</span></td>
                <td><Link href={`/students/${r.student_id}`} className={ui.link}>{r.first_name} {r.last_name}</Link></td>
                <td><span className={`${styles.pill} ${styles[`pill${markLetter(r)}`]}`}>{markLabel(r.status, r.source)}</span></td>
                <td>{setByText(r.source, r.set_by)}</td>
                <td>{r.joined_at ? formatClock(r.joined_at) : '—'}</td>
                <td className={styles.wrapCell}>
                  {r.last_change ? (
                    <span className={styles.change}>
                      {markLabel(r.last_change.from, r.last_change.from_source)} → {ATTENDANCE_LABEL[r.last_change.to]}
                      {r.last_change.reason ? ` · “${r.last_change.reason}”` : ''}
                      {r.last_change.by ? ` · ${r.last_change.by}` : ''}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager f={f} total={data.total} />
    </>
  );
}

function CorrectionsView({ f, data }: { f: Filters; data: { total: number; rows: CorrectionRow[] } | null }) {
  if (!data) return <p className={ui.empty}>The corrections could not be loaded.</p>;
  if (data.total === 0) return <p className={ui.empty}>No marks were corrected in these dates.</p>;
  return (
    <>
      <div className={styles.tableScroll}>
        <table className={ui.table}>
          <thead><tr><th>Changed</th><th>Class</th><th>Batch</th><th>Student</th><th>From → to</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={`${r.changed_at}-${i}`}>
                <td>{formatDay(r.changed_at)} {formatClock(r.changed_at)}</td>
                <td><Link href={`/batches/${r.batch_id}?class_date=${r.class_date}#attendance`} className={ui.link}>{weekdayShort(r.class_date)} {formatDate(r.class_date)}</Link></td>
                <td>{r.batch_code}</td>
                <td><Link href={`/students/${r.student_id}`} className={ui.link}>{r.first_name} {r.last_name}</Link></td>
                <td>{markLabel(r.from, r.from_source)} → {ATTENDANCE_LABEL[r.to]}</td>
                <td className={styles.wrapCell}>{r.reason ?? <span className={ui.muted}>none given</span>}</td>
                <td>{r.by ?? 'Staff'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager f={f} total={data.total} />
    </>
  );
}

function AttentionView({ a }: { a: Attention }) {
  if (a.unconfirmed.length + a.missing.length + a.streaks.length === 0) {
    return <p className={ui.empty}>Nothing needs attention in these dates. 🎉</p>;
  }
  return (
    <div className={styles.attention}>
      <section>
        <h3>Registers to confirm <span className={styles.count}>{a.unconfirmed.length}</span></h3>
        <p className={ui.hint}>The class is over, but some marks are still portal check-ins or &quot;has not checked in&quot;. Open the register and save it.</p>
        {a.unconfirmed.length === 0 ? <p className={ui.empty}>None.</p> : (
          <ul className={styles.items}>
            {a.unconfirmed.map((u) => (
              <li key={`${u.batch_id}-${u.class_date}`}>
                <span><b>{u.batch_code}</b> · {weekdayShort(u.class_date)} {formatDate(u.class_date)}</span>
                <span className={ui.muted}>{u.checked_in} checked in · {u.not_checked_in} not checked in</span>
                <Link href={`/batches/${u.batch_id}?class_date=${u.class_date}#attendance`} className={ui.button}>Open register</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>Classes with no register <span className={styles.count}>{a.missing.length}</span></h3>
        <p className={ui.hint}>A class was planned (from the batch&apos;s class times) but nobody checked in and no register was taken. Ignore holidays.</p>
        {a.missing.length === 0 ? <p className={ui.empty}>None.</p> : (
          <ul className={styles.items}>
            {a.missing.map((m) => (
              <li key={`${m.batch_id}-${m.class_date}`}>
                <span><b>{m.batch_code}</b> · {weekdayShort(m.class_date)} {formatDate(m.class_date)} {m.start_time.slice(0, 5)}</span>
                <Link href={`/batches/${m.batch_id}?class_date=${m.class_date}#attendance`} className={ui.button}>Take register</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>Absent in a row <span className={styles.count}>{a.streaks.length}</span></h3>
        <p className={ui.hint}>Students whose latest two or more classes in a batch were all absences.</p>
        {a.streaks.length === 0 ? <p className={ui.empty}>None.</p> : (
          <ul className={styles.items}>
            {a.streaks.map((s) => (
              <li key={`${s.batch_id}-${s.student_id}`}>
                <span><Link href={`/students/${s.student_id}`} className={ui.link}>{s.first_name} {s.last_name}</Link> · {s.batch_code}</span>
                <span className={styles.lowText}>{s.absences} absences: {s.dates.map(short).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
