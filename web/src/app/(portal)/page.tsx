import Link from 'next/link';
import { Suspense } from 'react';
import {
  AlertIcon, ClipboardCheckIcon, MailIcon, UsersIcon,
} from '@/components/icons';
import { getViewer } from '@/lib/auth';
import { BarChart } from './_dashboard/BarChart';
import { loadDashboard, NEW_DAYS, type AttentionItem } from './_dashboard/data';
import { HomeworkPanel, HomeworkPanelLoading } from './_dashboard/HomeworkPanel';
import { NextClass } from './_dashboard/NextClass';
import styles from './dashboard.module.css';

export const metadata = { title: 'Dashboard' };

const ATTENTION_ICONS: Record<string, typeof AlertIcon> = {
  student: UsersIcon, homework: ClipboardCheckIcon, enquiry: MailIcon, full: AlertIcon,
};
const TONE_LABEL = { danger: 'Overdue', warn: 'To do', info: 'FYI' };

function greeting() {
  const hour = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }));
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

// Kept to quick queries: attendance, classes logged, the homework hand-in percentages and the range filter
// were taken off on 3 Nov 2026 because they made the dashboard slow. The Homework section loads on its own
// and fills in when ready, so the rest of the page shows first.
export default async function Dashboard() {
  // A teacher sees the same dashboard, filled only with their own batches and students (database rules),
  // without enquiries.
  const [viewer, d] = await Promise.all([getViewer(), loadDashboard()]);
  const teacher = viewer?.kind === 'teacher';
  const firstName = viewer?.fullName.split(' ')[0] ?? '';
  const attention = teacher ? d.attention.filter((a) => a.kind !== 'enquiry') : d.attention;
  const longDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' });

  return (
    <>
      <header className={styles.top}>
        <div>
          <p className={styles.date}>{longDate}</p>
          <h1 className={styles.title}>{greeting()}{firstName && `, ${firstName}`}</h1>
        </div>
      </header>

      {/* ---------- A teacher's next class with Join class (fills in when ready, never holds up the page) ---------- */}
      {teacher && (
        <Suspense fallback={null}>
          <NextClass />
        </Suspense>
      )}

      {/* ---------- Headline tiles ---------- */}
      <section className={styles.kpis}>
        <Link href="/students" className={styles.kpi}>
          <span className={styles.kpiLabel}>{teacher ? 'My students' : 'Current students'}</span>
          <strong className={styles.kpiValue}>{d.studentCounts.current}</strong>
          <span className={styles.kpiSub}>
            {d.studentCounts.active} active · {d.studentCounts.trial} trial
            {d.studentCounts.newInRange > 0 && <> · <b className={styles.up} title={`Started in the last ${NEW_DAYS} days`}>+{d.studentCounts.newInRange} new</b></>}
          </span>
        </Link>

        <Link href="/batches" className={styles.kpi}>
          <span className={styles.kpiLabel}>{teacher ? 'My batches' : 'Open batches'}</span>
          <strong className={styles.kpiValue}>{d.placesSummary.batches}</strong>
          <span className={styles.kpiSub}>
            {d.placesSummary.filled} of {d.placesSummary.seats} places used
            {d.placesSummary.rate !== null && ` (${d.placesSummary.rate}%)`}
          </span>
        </Link>

        {!teacher && (
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Open enquiries</span>
            <strong className={styles.kpiValue}>{d.enquirySummary.open}</strong>
            <span className={styles.kpiSub}>
              {d.enquirySummary.conversion === null ? 'No decisions yet' : `${d.enquirySummary.conversion}% convert to enrolment`}
            </span>
          </div>
        )}
      </section>

      {/* ---------- Needs attention ---------- */}
      <article className={`${styles.card} ${styles.attentionCard}`}>
        <h2>Needs attention <span className={styles.count}>{attention.length}</span></h2>
        <p className={styles.cardSub}>Click an item to sort it out</p>
        {attention.length === 0 ? (
          <p className={styles.allClear}>Nothing needs attention. 🎉</p>
        ) : (
          <ul className={styles.attention}>
            {attention.slice(0, 7).map((a, i) => <AttentionRow key={i} item={a} />)}
          </ul>
        )}
        {attention.length > 7 && <p className={styles.more}>+{attention.length - 7} more</p>}
      </article>

      {/* ---------- Homework: numbers, marking queue, falling behind (fills in when ready) ---------- */}
      <Suspense fallback={<HomeworkPanelLoading />}>
        <HomeworkPanel teacher={teacher} />
      </Suspense>

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
        {!teacher && <article className={styles.card}>
          <h2>Enquiry pipeline</h2>
          <p className={styles.cardSub}>
            Open enquiries at each stage · {d.enquirySummary.enrolled} enrolled, {d.enquirySummary.lost} not proceeding so far
          </p>
          <BarChart bars={d.pipeline} orientation="rows" max={Math.max(...d.pipeline.map((b) => b.value ?? 0), 1)} ariaLabel="Enquiries by stage" />
        </article>}
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
