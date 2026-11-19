import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';
import { TermTabs } from '@/components/TermTabs';
import { formatTrackerDate, studentPlanRows, termTabs, type StudentPlanClass, type StudentPlanRow } from '@/lib/lessons/tracker';
import { todayInUk, yearLabel } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import styles from '../../student.module.css';
import lp from './lessonPlan.module.css';

export const metadata = { title: 'Lesson plan' };

type MyClass = StudentPlanClass & { batch_id: string; subject: string; year_group: number; tracker: boolean };

function StatusCell({ row }: { row: StudentPlanRow }) {
  if (row.status === 'complete') return <StatusBadge status={row.tone === 'bad' ? 'late' : row.tone === 'good' ? 'on_time' : 'active'} label="Completed" />;
  if (row.status === 'in_progress') return <StatusBadge status="in_progress" label="In progress" />;
  return <span className={styles.muted}>Not started</span>;
}

// The lesson plan of each class the student is in, with each lesson's planned date (once the class's Lesson Tracker
// is set), whether the class has done it, and when. Completed is green on or before its date, red after it.
// A family login sees the child chosen in the top bar. With more than one subject, tabs pick one (?subject=Maths).
export default async function MyLessonPlan({ searchParams }: { searchParams: Promise<{ subject?: string; term?: string }> }) {
  const { subject: asked, term: askedTerm } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_lesson_plan');
  if (error) console.error('my_lesson_plan failed:', error.message);
  const classes = (data ?? []) as MyClass[];
  const current = classes.find((c) => c.subject === asked) ?? classes[0];
  const today = todayInUk();
  const rows = current ? studentPlanRows(current, today) : [];
  // Opens on the term of the class's next lesson still in the plan, unless a term tab was chosen.
  const tabs = termTabs(rows.map((r) => ({ term: r.term, active: r.active, done: r.status === 'complete' })), askedTerm);

  return (
    <>
      <h1>Lesson plan</h1>
      <p className={styles.muted}>Every lesson of the year, when it is planned, and what your class has completed.</p>

      {classes.length > 1 && (
        <nav className={styles.tabs} aria-label="Subjects">
          {classes.map((c) => (
            <Link key={c.batch_id} href={`/me/lesson-plan?subject=${encodeURIComponent(c.subject)}`}
              className={`${styles.tab} ${c === current ? styles.tabActive : ''}`} aria-current={c === current ? 'page' : undefined}>
              {c.subject}
            </Link>
          ))}
        </nav>
      )}

      {error ? (
        <p className={styles.muted} style={{ marginTop: 16 }}>The lesson plan isn&apos;t available yet. Please try again later.</p>
      ) : !current ? (
        <p className={styles.muted} style={{ marginTop: 16 }}>You aren&apos;t in a class yet. Your lesson plan will appear here when you join one.</p>
      ) : rows.length === 0 ? (
        <p className={styles.muted} style={{ marginTop: 16 }}>Your {current.subject} class doesn&apos;t have a lesson plan here yet.</p>
      ) : (
        <>
          <p className={styles.subject} style={{ marginTop: classes.length > 1 ? 0 : 16 }}>{current.subject} · {yearLabel(current.year_group)}</p>
          {!current.tracker && (
            <p className={styles.muted} style={{ marginTop: 6 }}>Planned dates will appear here once your teacher has planned the year.</p>
          )}
          {[tabs.current].map((term) => {
            const inTerm = rows.filter((r) => r.term === term);
            return (
              <section key={term} className={`${styles.card} ${lp.term}`}>
                <TermTabs terms={tabs.terms} current={term}
                  href={(t) => `/me/lesson-plan?${classes.length > 1 ? `subject=${encodeURIComponent(current.subject)}&` : ''}term=${t}`} />
                <h2>Term {term}</h2>
                <div className={lp.wrap}>
                  <table className={lp.table}>
                    <thead>
                      <tr><th>Module</th><th>Lesson</th><th>Planned date</th><th>Status</th><th>Completed on</th></tr>
                    </thead>
                    <tbody>
                      {inTerm.map((r, i) => (
                        <tr key={r.id}>
                          <td className={lp.module}>{i === 0 || inTerm[i - 1].module !== r.module ? r.module : ''}</td>
                          <td>{r.name} <span className={lp.code}>{r.code}</span></td>
                          <td className={lp.nowrap}>{r.plannedOn ? formatTrackerDate(r.plannedOn) : ''}</td>
                          <td className={lp.nowrap}><StatusCell row={r} /></td>
                          <td className={lp.nowrap}>{r.completedOn ? formatTrackerDate(r.completedOn) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
