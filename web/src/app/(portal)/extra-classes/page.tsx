import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { formatDate } from '@/lib/format';
import { getViewer } from '@/lib/auth';
import {
  ASKED_BY, attentionCount, byText, EVENT_LABEL, eventText, extraHref, historyArgs, KIND_LABEL, listArgs, NOT_READY, RANGES,
  readFilters, shortWhen, STATUS_LABEL, TABS, ukClock, ukDay,
  type Attention, type ExtraKind, type ExtraStatus, type Filters, type HistoryResult, type ListResult, type Summary,
} from '@/lib/extraClasses';
import { createClient } from '@/lib/supabase/server';
import att from '../attendance/attendance.module.css';
import { ExtraStatusPill, Result } from './bits';
import styles from './extra.module.css';

export const metadata = { title: 'Extra classes' };

const PAGE_SIZE = 50;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Extra classes (guide 24): every one-off class in one place, to see, filter and check. Works like the Attendance
// page: filters at the top (kept in the address), tiles, then tabs. A teacher gets the same page for their own
// extra classes only (the database decides), without booking, Booked by, or Needs attention.
export default async function ExtraClassesPage({ searchParams }: Props) {
  const q = await searchParams;
  const f = readFilters(q);
  const viewer = await getViewer();
  const staff = viewer?.kind === 'staff';
  if (!staff && f.tab === 'attention') f.tab = 'list';
  const supabase = await createClient();

  const [listRes, attentionRes, tabRes, { data: students }, { data: teachers }, { data: subjects }, { data: staffList }] = await Promise.all([
    supabase.rpc('extra_class_list', { p: listArgs(f, f.tab === 'list' ? f.page : 1, f.tab === 'list' ? PAGE_SIZE : 1) }),
    staff ? supabase.rpc('extra_class_attention') : Promise.resolve({ data: null, error: null }),
    f.tab === 'history' ? supabase.rpc('extra_class_history', { p: historyArgs(f, f.page, PAGE_SIZE) }) : Promise.resolve({ data: null, error: null }),
    supabase.from('students').select('id, code, first_name, last_name').order('first_name').order('last_name'),
    staff ? supabase.from('teachers').select('id, first_name, last_name').order('first_name') : Promise.resolve({ data: [] }),
    supabase.from('subjects').select('id, name').order('name'),
    staff ? supabase.from('staff').select('id, full_name').order('full_name') : Promise.resolve({ data: [] }),
  ]);
  const failed = listRes.error ?? attentionRes.error ?? tabRes.error;
  if (failed) console.error('Extra classes page:', failed.message);
  const notReady = failed?.code === 'PGRST202';
  const list = listRes.data as ListResult | null;
  const attention = attentionRes.data as Attention | null;
  const toFix = attentionCount(attention);
  const subjectNames = Object.fromEntries(((subjects ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const tabs = (Object.keys(TABS) as (keyof typeof TABS)[]).filter((t) => staff || t !== 'attention');

  return (
    <div className={`${att.page} ${styles.page}`}>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Extra classes</h1>
          <p className={ui.subtitle}>
            {staff ? 'One-off classes such as catch-ups: create, check and audit them here.' : 'Your one-off classes, such as catch-ups. The office creates and changes them.'}
            {' '}They don&apos;t count in the weekly attendance figures.
          </p>
        </div>
        {staff && (
          <div className={ui.formActions}>
            <Link href="/extra-classes/new?recorded=1" className={ui.button}>Record a past class</Link>
            <Link href="/extra-classes/new" className={ui.primaryButton}>Create extra class</Link>
          </div>
        )}
      </div>
      <Alerts ok={typeof q.ok === 'string' ? q.ok : undefined} problem={typeof q.error === 'string' ? q.error : undefined} />

      {/* Filters: a plain form, so they work without JavaScript and end up in the address. */}
      <form method="get" action="/extra-classes" className={att.filters}>
        <input type="hidden" name="tab" value={f.tab} />
        <input type="hidden" name="range" value={f.range} />
        <div className={`${att.field} ${att.wide}`}>
          <span className={ui.label}>{f.tab === 'history' ? 'Changes made' : 'Dates'}</span>
          <div className={att.chips}>
            {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((r) => (
              <Link key={r} href={extraHref(f, { range: r, page: 1 })} className={`${att.chip} ${f.range === r ? att.chipOn : ''}`}
                aria-current={f.range === r ? 'true' : undefined}>{RANGES[r]}</Link>
            ))}
          </div>
          {f.range === 'custom' && (
            <div className={att.dates}>
              <input type="date" name="from" defaultValue={f.from ?? ''} aria-label="From" className={ui.input} required />
              <span className={ui.muted}>to</span>
              <input type="date" name="to" defaultValue={f.to ?? ''} aria-label="To" className={ui.input} required />
            </div>
          )}
        </div>
        {f.tab !== 'history' && (
          <label className={att.field}>
            <span className={ui.label}>Status</span>
            <select name="status" defaultValue={f.status ?? ''} className={ui.select}>
              <option value="">Any status</option>
              {(Object.keys(STATUS_LABEL) as ExtraStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
        )}
        <label className={att.field}>
          <span className={ui.label}>Student</span>
          <select name="student" defaultValue={f.student ?? ''} className={ui.select}>
            <option value="">All students</option>
            {(students ?? []).map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} · {s.code}</option>)}
          </select>
        </label>
        {staff && (
          <label className={att.field}>
            <span className={ui.label}>Teacher</span>
            <select name="teacher" defaultValue={f.teacher ?? ''} className={ui.select}>
              <option value="">All teachers</option>
              {(teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
            </select>
          </label>
        )}
        {f.tab !== 'history' && (
          <>
            {(subjects ?? []).length > 0 && <label className={att.field}>
              <span className={ui.label}>Subject</span>
              <select name="subject" defaultValue={f.subject ?? ''} className={ui.select}>
                <option value="">All subjects</option>
                {(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>}
            <label className={att.field}>
              <span className={ui.label}>Type</span>
              <select name="kind" defaultValue={f.kind ?? ''} className={ui.select}>
                <option value="">Any type</option>
                {(Object.keys(KIND_LABEL) as ExtraKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
            {staff && (
              <label className={att.field}>
                <span className={ui.label}>Cancelled by</span>
                <select name="cancelled_by" defaultValue={f.cancelled_by ?? ''} className={ui.select}>
                  <option value="">Anyone</option>
                  {(Object.keys(ASKED_BY) as (keyof typeof ASKED_BY)[]).map((k) => <option key={k} value={k}>{ASKED_BY[k]}</option>)}
                </select>
              </label>
            )}
          </>
        )}
        {f.tab === 'history' && (
          <label className={att.field}>
            <span className={ui.label}>Event</span>
            <select name="event" defaultValue={f.event ?? ''} className={ui.select}>
              <option value="">Any change</option>
              {Object.entries(EVENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        )}
        {staff && (
          <label className={att.field}>
            <span className={ui.label}>{f.tab === 'history' ? 'Done by' : 'Created by'}</span>
            <select name="booked_by" defaultValue={f.booked_by ?? ''} className={ui.select}>
              <option value="">Anyone</option>
              {(staffList ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </label>
        )}
        <label className={att.field}>
          <span className={ui.label}>Code</span>
          <input name="code" defaultValue={f.code ?? ''} className={ui.input} placeholder="X-012" style={{ width: 110 }} />
        </label>
        {f.tab !== 'history' && (
          <label className={`${att.field} ${ui.check}`} style={{ alignSelf: 'center', fontWeight: 500 }}>
            <input type="checkbox" name="catch_up" value="1" defaultChecked={f.catch_up} /> Catch-ups for a missed class only
          </label>
        )}
        <div className={att.actions}>
          <button className={ui.primaryButton}>Show</button>
          <Link href={f.tab === 'list' ? '/extra-classes' : `/extra-classes?tab=${f.tab}`} className={ui.button}>Clear</Link>
          {f.tab !== 'attention' && <a href={extraHref(f, { page: 1 }, '/extra-classes/export')} className={ui.button} download>Export CSV</a>}
        </div>
      </form>

      {notReady ? <p className={ui.empty}>{NOT_READY}</p> : failed ? <p className={ui.empty}>The extra classes could not be loaded. Please try again.</p> : (
        <>
          <p className={att.caption}>
            {f.from && f.to ? `${formatDate(f.from)} to ${formatDate(f.to)}` : f.from ? `From ${formatDate(f.from)}` : 'All dates'}
            {f.tab === 'history' ? ' (when the change was made)' : ''}
          </p>
          {list && f.tab !== 'history' && <Tiles f={f} s={list.summary} />}

          <nav className={att.tabs} aria-label="Extra classes views">
            {tabs.map((t) => (
              <Link key={t} href={extraHref(f, { tab: t, page: 1 })} className={`${att.tab} ${f.tab === t ? att.tabOn : ''}`}
                aria-current={f.tab === t ? 'page' : undefined}>
                {TABS[t]}{t === 'attention' && toFix > 0 ? <span className={att.count}>{toFix}</span> : null}
              </Link>
            ))}
          </nav>
          <section className={att.panel}>
            {f.tab === 'list' && <ListView f={f} data={list} staff={staff} />}
            {f.tab === 'attention' && attention && <AttentionView a={attention} />}
            {f.tab === 'history' && <HistoryView f={f} data={tabRes.data as HistoryResult | null} subjects={subjectNames} />}
          </section>
        </>
      )}
    </div>
  );
}

function Tiles({ f, s }: { f: Filters; s: Summary }) {
  const tile = (status: ExtraStatus, label: string, warn?: boolean) => {
    const on = f.status === status;
    return (
      <Link href={extraHref(f, { tab: 'list', status: on ? null : status, page: 1 })} aria-current={on ? 'true' : undefined}
        className={`${att.tile} ${warn && s[status] > 0 ? att.tileWarn : ''}`} style={on ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 3px var(--brand-ring)' } : undefined}>
        <span>{label}</span><b>{s[status]}</b>
      </Link>
    );
  };
  const hours = Math.round((s.minutes_taught / 60) * 10) / 10;
  return (
    <div className={att.tiles}>
      {tile('upcoming', 'Upcoming')}
      {tile('live', 'Live now')}
      {tile('to_mark', 'Mark attendance', true)}
      {tile('done', 'Done')}
      {tile('no_show', 'No-shows', true)}
      {tile('cancelled', 'Cancelled')}
      <div className={att.tile}><span>Hours taught</span><b>{hours}</b><small>done classes</small></div>
    </div>
  );
}

function Pager({ f, total }: { f: Filters; total: number }) {
  if (total <= PAGE_SIZE) return <p className={att.legend}>{total} {total === 1 ? 'row' : 'rows'}</p>;
  const last = Math.ceil(total / PAGE_SIZE);
  return (
    <p className={att.pager}>
      {f.page > 1 ? <Link href={extraHref(f, { page: f.page - 1 })} className={ui.button}>← Previous</Link> : <span />}
      <span className={ui.muted}>{(f.page - 1) * PAGE_SIZE + 1}–{Math.min(f.page * PAGE_SIZE, total)} of {total}</span>
      {f.page < last ? <Link href={extraHref(f, { page: f.page + 1 })} className={ui.button}>Next →</Link> : <span />}
    </p>
  );
}

function ListView({ f, data, staff }: { f: Filters; data: ListResult | null; staff: boolean }) {
  if (!data) return <p className={ui.empty}>The extra classes could not be loaded.</p>;
  if (data.total === 0) {
    return (
      <p className={ui.empty}>
        No extra classes match these filters.{staff ? <> <Link href="/extra-classes/new" className={ui.link}>Create one</Link>.</> : null}
      </p>
    );
  }
  return (
    <>
      <div className={att.tableScroll}>
        <table className={ui.table}>
          <thead>
            <tr><th>When</th><th>Class</th><th>Students and result</th><th>Subject</th>{staff && <th>Teacher</th>}<th>Type</th><th>Status</th>{staff && <th>Created by</th>}</tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/extra-classes/${r.id}`} className={`${ui.link} ${styles.when}`}>
                    {ukDay(r.starts_at)}<small>{ukClock(r.starts_at)}–{ukClock(r.ends_at)} · {r.length_minutes} min</small>
                  </Link>
                </td>
                <td><Link href={`/extra-classes/${r.id}`} className={ui.link}>{r.code}</Link>{r.recorded_after && <div className={styles.sub}>recorded after</div>}</td>
                <td>
                  <div className={styles.who}>
                    {r.students.map((s) => (
                      <span key={s.id}>
                        {s.name} · <Result mark={s.mark} source={s.mark_source} cancelled={r.status === 'cancelled'} />
                        {s.missed_date && <span className={styles.sub}> · makes up {formatDate(s.missed_date)}</span>}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{r.subject}</td>
                {staff && <td>{r.teacher}</td>}
                <td>{KIND_LABEL[r.kind]}</td>
                <td>
                  <ExtraStatusPill status={r.status} />
                  {r.status === 'cancelled' && r.cancel_asked_by && <div className={styles.sub}>asked by {ASKED_BY[r.cancel_asked_by].toLowerCase()}</div>}
                </td>
                {staff && <td>{r.booked_by ?? '—'}<div className={styles.sub}>{formatDate(r.created_at.slice(0, 10))}</div></td>}
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
  if (attentionCount(a) === 0) return <p className={ui.empty}>Nothing needs attention. 🎉</p>;
  const item = (c: { id: string; code: string; starts_at: string }, extra: React.ReactNode, action: React.ReactNode) => (
    <li key={`${c.id}-${String(extra)}`}>
      <span><b>{c.code}</b> · {shortWhen(c.starts_at)} {extra}</span>
      {action}
    </li>
  );
  const open = (id: string, label = 'Open') => <Link href={`/extra-classes/${id}`} className={ui.button}>{label}</Link>;
  return (
    <div className={att.attention}>
      <section>
        <h3>Attendance to take <span className={att.count}>{a.to_mark.length}</span></h3>
        <p className={ui.hint}>The class is over, but attendance hasn&apos;t been saved (or still has unconfirmed check-ins).</p>
        {a.to_mark.length === 0 ? <p className={ui.empty}>None.</p> : (
          <ul className={att.items}>{a.to_mark.map((c) => item(c, <span className={ui.muted}>· {c.teacher} · {c.students}</span>, open(c.id, 'Take attendance')))}</ul>
        )}
      </section>
      <section>
        <h3>Needs a teacher <span className={att.count}>{a.needs_teacher.length}</span></h3>
        <p className={ui.hint}>Upcoming classes whose teacher has left or is on leave.</p>
        {a.needs_teacher.length === 0 ? <p className={ui.empty}>None.</p> : (
          <ul className={att.items}>{a.needs_teacher.map((c) => item(c, <span className={att.lowText}>· {c.teacher} is {c.teacher_status === 'left' ? 'no longer here' : 'on leave'}</span>, <Link href={`/extra-classes/${c.id}/edit`} className={ui.button}>Change teacher</Link>))}</ul>
        )}
      </section>
      <section>
        <h3>No Meet room yet <span className={att.count}>{a.no_meet_room.length}</span></h3>
        <p className={ui.hint}>Classes in the next 24 hours without a Meet room (it is also made when someone first joins).</p>
        {a.no_meet_room.length === 0 ? <p className={ui.empty}>None.</p> : (
          <ul className={att.items}>{a.no_meet_room.map((c) => item(c, <span className={ui.muted}>· {c.teacher}</span>, open(c.id)))}</ul>
        )}
      </section>
      <section>
        <h3>Student no longer active <span className={att.count}>{a.inactive_students.length}</span></h3>
        <p className={ui.hint}>Upcoming classes with a student who is paused or leaving. (Students who leave are taken off by themselves.)</p>
        {a.inactive_students.length === 0 ? <p className={ui.empty}>None.</p> : (
          <ul className={att.items}>{a.inactive_students.map((c) => item(c, <span className={att.lowText}>· {c.student} is {c.student_status}</span>, open(c.id)))}</ul>
        )}
      </section>
      <section>
        <h3>No-shows without a new class <span className={att.count}>{a.no_shows.length}</span></h3>
        <p className={ui.hint}>Every student was absent in the last 4 weeks, and no new class in that subject has been created since.</p>
        {a.no_shows.length === 0 ? <p className={ui.empty}>None.</p> : (
          <ul className={att.items}>{a.no_shows.map((c) => item(c, <span className={ui.muted}>· {c.students}</span>, <Link href={`/extra-classes/new?again=${c.id}`} className={ui.button}>Create again</Link>))}</ul>
        )}
      </section>
    </div>
  );
}

function HistoryView({ f, data, subjects }: { f: Filters; data: HistoryResult | null; subjects: Record<string, string> }) {
  if (!data) return <p className={ui.empty}>The history could not be loaded.</p>;
  if (data.total === 0) return <p className={ui.empty}>No changes match these filters.</p>;
  return (
    <>
      <div className={att.tableScroll}>
        <table className={ui.table}>
          <thead><tr><th>Changed</th><th>Class</th><th>What</th><th>Details</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>
            {data.rows.map((e) => (
              <tr key={e.id}>
                <td>{ukDay(e.at)} <span className={ui.muted}>{ukClock(e.at)}</span></td>
                <td>
                  <Link href={`/extra-classes/${e.extra_class_id}`} className={ui.link}>{e.code}</Link>
                  {e.starts_at && <div className={styles.sub}>{shortWhen(e.starts_at)}</div>}
                </td>
                <td>{EVENT_LABEL[e.event] ?? e.event}</td>
                <td className={att.wrapCell}>{eventText(e, subjects) || <span className={ui.muted}>—</span>}{!e.student && e.students ? <div className={styles.sub}>{e.students}</div> : null}</td>
                <td className={att.wrapCell}>{e.reason ?? <span className={ui.muted}>—</span>}</td>
                <td>{byText(e.by)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager f={f} total={data.total} />
    </>
  );
}
