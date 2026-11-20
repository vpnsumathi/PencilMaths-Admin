import Link from 'next/link';
import { Suspense } from 'react';
import { getViewer } from '@/lib/auth';
import { formatClock } from '@/lib/format';
import { loadSummary, loadToday } from './_dashboard/load';
import { readShow } from './_dashboard/model';
import { Summary, SummaryLoading } from './_dashboard/Summary';
import { TeacherExtras } from './_dashboard/TeacherExtras';
import { Today, TodayLoading } from './_dashboard/Today';
import styles from './dashboard.module.css';

// The Dashboard, the landing page (guide 28). It answers three questions in order: what is happening today, what
// needs me now, and how is the school doing this week. Every number links to the page that sorts it out.
// Speed: once the login check is done, two database calls start side by side (dashboard_today and dashboard_summary,
// each one small ready-made answer) and the header is sent at once; Today and the rest fill in as each call
// returns, inside their own <Suspense>. Nothing asks Google while the page is made; the Meet check for live
// classes runs after the page has been sent (Today.tsx).
// A teacher sees the same page filled only with their own batches, students and extra classes (the database
// functions check who is asking), with their next class and Join class in the Today band.

export const metadata = { title: 'Dashboard' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function greeting(now: Date) {
  const hour = Number(now.toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }));
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export default async function Dashboard({ searchParams }: Props) {
  // Who is asking first (shared with the portal layout, so no extra lookup). Anyone who isn't staff or a teacher,
  // such as a student just after login, is sent on by the layout (a student to /me), so the page asks for nothing.
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  if (!viewer) return null;
  // Both calls start now, side by side; each part below waits only for its own.
  const today = loadToday();
  const summary = loadSummary();
  const teacher = viewer.kind === 'teacher';
  const firstName = viewer.fullName.split(' ')[0] ?? '';
  const now = new Date();
  const longDate = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' });

  return (
    <>
      <header className={styles.top}>
        <div>
          <p className={styles.date}>{longDate} · updated {formatClock(now.toISOString())}</p>
          <h1 className={styles.title}>{greeting(now)}{firstName && `, ${firstName}`}</h1>
        </div>
        {!teacher && (
          <nav className={styles.actions} aria-label="Quick actions">
            <Link href="/students/new" className={styles.action}>Add student</Link>
            <Link href="/enquiries/new" className={styles.action}>Add enquiry</Link>
            <Link href="/extra-classes/new" className={styles.action}>Create extra class</Link>
          </nav>
        )}
      </header>

      <Suspense fallback={<TodayLoading />}>
        <Today data={today} teacher={teacher} />
      </Suspense>

      {/* A teacher's extra classes to mark and what the office changed (guide 24). */}
      {teacher && (
        <Suspense fallback={null}>
          <TeacherExtras />
        </Suspense>
      )}

      <Suspense fallback={<SummaryLoading />}>
        <Summary data={summary} show={readShow(params.show)} />
      </Suspense>
    </>
  );
}
