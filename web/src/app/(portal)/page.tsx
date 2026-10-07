import Link from 'next/link';
import {
  AlertIcon, CalendarIcon, ClipboardCheckIcon, MailIcon, UsersIcon,
} from '@/components/icons';
import { createClient } from '@/lib/supabase/server';
import { BarChart } from './_dashboard/BarChart';
import { loadDashboard, RANGES, type AttentionItem } from './_dashboard/data';
import { Sparkline } from './_dashboard/Sparkline';
import styles from './dashboard.module.css';

export const metadata = { title: 'Dashboard' };

type Props = { searchParams: Promise<{ range?: string }> };

const ATTENTION_ICONS: Record<string, typeof AlertIcon> = {
  class: CalendarIcon, student: UsersIcon, homework: ClipboardCheckIcon, enquiry: MailIcon, full: AlertIcon,
};
const TONE_LABEL = { danger: 'Overdue', warn: 'To do', info: 'FYI' };

function greeting() {
  const hour = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }));
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export default async function Dashboard({ searchParams }: Props) {
  const { range } = await searchParams;
  const days = RANGES.find((r) => String(r.days) === range)?.days ?? 28;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: me }, d] = await Promise.all([
    supabase.from('staff').select('full_name').eq('id', user!.id).maybeSingle(),
    loadDashboard(days),
  ]);
  const firstName = me?.full_name?.split(' ')[0] ?? '';
  const rangeLabel = RANGES.find((r) => r.days === days)!.label;
  const longDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' });

  return (
    <>
      <header className={styles.top}>
        <div>
          <p className={styles.date}>{longDate}</p>
          <h1 className={styles.title}>{greeting()}{firstName && `, ${firstName}`}</h1>
        </div>
        {/* Range filter: scopes attendance, homework, classes and "new students" below. */}
        <nav className={styles.range} aria-label="Date range">
          {RANGES.map((r) => (
            <Link key={r.days} href={`/?range=${r.days}`} className={r.days === days ? styles.rangeOn : ''} aria-current={r.days === days ? 'true' : undefined}>
              {r.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* ---------- Headline tiles ---------- */}
      <section className={styles.kpis}>
        <Link href="/students" className={styles.kpi}>
          <span className={styles.kpiLabel}>Current students</span>
          <strong className={styles.kpiValue}>{d.studentCounts.current}</strong>
          <span className={styles.kpiSub}>
            {d.studentCounts.active} active · {d.studentCounts.trial} trial
            {d.studentCounts.newInRange > 0 && <> · <b className={styles.up}>+{d.studentCounts.newInRange} new</b></>}
          </span>
        </Link>

        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Attendance · {rangeLabel}</span>
          <div className={styles.kpiRow}>
            <strong className={styles.kpiValue}>{d.attendanceSummary.rate ?? '–'}{d.attendanceSummary.rate !== null && '%'}</strong>
            <Sparkline values={d.attendanceTrend.map((b) => b.value)} />
          </div>
          <span className={styles.kpiSub}>
            {d.attendanceSummary.present} present · {d.attendanceSummary.late} late · {d.attendanceSummary.absent} absent
          </span>
        </div>

        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Homework handed in</span>
          <strong className={styles.kpiValue}>{d.homeworkSummary.rate ?? '–'}{d.homeworkSummary.rate !== null && '%'}</strong>
          <span className={styles.kpiSub}>{d.homeworkSummary.toMark} waiting to be marked</span>
        </div>

        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Classes logged · {rangeLabel}</span>
          <strong className={styles.kpiValue}>
            {d.classSummary.logged}<small> / {d.classSummary.expected}</small>
          </strong>
          <span className={styles.meter} aria-hidden="true">
            <span style={{ width: `${d.classSummary.expected ? (100 * d.classSummary.logged) / d.classSummary.expected : 0}%` }} />
          </span>
          <span className={styles.kpiSub}>
            {d.classSummary.missing ? <b className={styles.down}>{d.classSummary.missing} not logged yet</b> : 'All classes logged'}
          </span>
        </div>

        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Open enquiries</span>
          <strong className={styles.kpiValue}>{d.enquirySummary.open}</strong>
          <span className={styles.kpiSub}>
            {d.enquirySummary.conversion === null ? 'No decisions yet' : `${d.enquirySummary.conversion}% convert to enrolment`}
          </span>
        </div>
      </section>

      {/* ---------- Attendance trend + needs attention ---------- */}
      <section className={styles.mainGrid}>
        <article className={styles.card}>
          <h2>Attendance rate</h2>
          <p className={styles.cardSub}>
            Present or late, as a share of all attendance marks · {days === 7 ? 'per day' : 'per week'}
          </p>
          <BarChart bars={d.attendanceTrend} orientation="columns" max={100} unit="%" ariaLabel="Attendance rate over time"
            emptyText="No classes logged in this range yet." />
        </article>

        <article className={styles.card}>
          <h2>Needs attention <span className={styles.count}>{d.attention.length}</span></h2>
          <p className={styles.cardSub}>Click an item to sort it out</p>
          {d.attention.length === 0 ? (
            <p className={styles.allClear}>Nothing needs attention. 🎉</p>
          ) : (
            <ul className={styles.attention}>
              {d.attention.slice(0, 7).map((a, i) => <AttentionRow key={i} item={a} />)}
            </ul>
          )}
          {d.attention.length > 7 && <p className={styles.more}>+{d.attention.length - 7} more</p>}
        </article>
      </section>

      {/* ---------- Students ---------- */}
      <section className={styles.pair}>
        <article className={styles.card}>
          <h2>Students by subject</h2>
          <p className={styles.cardSub}>Current students taking each subject (a student can take several)</p>
          <BarChart bars={d.bySubject} orientation="rows" max={Math.max(...d.bySubject.map((b) => b.value ?? 0), 1)} ariaLabel="Students by subject" />
        </article>
        <article className={styles.card}>
          <h2>Students by year group</h2>
          <p className={styles.cardSub}>Current students in each school year</p>
          <BarChart bars={d.byYear} orientation="columns" max={Math.max(...d.byYear.map((b) => b.value ?? 0), 1)} ariaLabel="Students by year group" />
        </article>
      </section>

      {/* ---------- Batches + enquiries ---------- */}
      <section className={styles.pair}>
        <article className={styles.card}>
          <h2>Batch places</h2>
          <p className={styles.cardSub}>
            {d.placesSummary.filled} of {d.placesSummary.seats} places used across {d.placesSummary.batches} open batches
            {d.placesSummary.rate !== null && ` (${d.placesSummary.rate}%)`} · click a batch to open it
          </p>
          <BarChart bars={d.places} orientation="rows" max={Math.max(...d.places.map((b) => b.max ?? 0), 1)} ariaLabel="Places used per batch"
            emptyText="No open batches." />
        </article>
        <article className={styles.card}>
          <h2>Enquiry pipeline</h2>
          <p className={styles.cardSub}>
            Open enquiries at each stage · {d.enquirySummary.enrolled} enrolled, {d.enquirySummary.lost} not proceeding so far
          </p>
          <BarChart bars={d.pipeline} orientation="rows" max={Math.max(...d.pipeline.map((b) => b.value ?? 0), 1)} ariaLabel="Enquiries by stage" />
        </article>
      </section>
    </>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const Icon = ATTENTION_ICONS[item.kind] ?? AlertIcon;
  return (
    <li>
      <Link href={item.href} className={styles.attentionItem}>
        <span className={`${styles.attentionIcon} ${styles[item.tone]}`}><Icon size={16} /></span>
        <span className={styles.attentionText}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </span>
        <span className={`${styles.pill} ${styles[item.tone]}`}>{TONE_LABEL[item.tone]}</span>
      </Link>
    </li>
  );
}
