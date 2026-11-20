import { yearLabel, yearShort } from '@/lib/options';
import { BarChart, type ChartBar } from './BarChart';
import styles from './charts.module.css';

// Students by subject and by year group, for the students listed above (so a filter narrows the charts too).
// Moved here from the Dashboard on 21 Nov 2026: they are reference, not daily (guide 28). Folded away by default.
export function StudentCharts({ students, subjects }: {
  students: { year_group: number; subject_ids: string[] | null }[];
  subjects: { id: string; name: string }[];
}) {
  if (students.length === 0) return null;
  const bySubject: ChartBar[] = subjects.map((sub) => {
    const n = students.filter((s) => (s.subject_ids ?? []).includes(sub.id)).length;
    return { key: sub.id, label: sub.name, value: n, display: String(n), detail: `${n} student${n === 1 ? '' : 's'}` };
  }).filter((b) => b.value > 0);
  const years = students.map((s) => s.year_group);
  const byYear: ChartBar[] = [];
  for (let y = Math.min(...years); y <= Math.max(...years); y++) {
    const n = years.filter((v) => v === y).length;
    byYear.push({ key: `y${y}`, label: yearShort(y), value: n, display: String(n), detail: yearLabel(y) });
  }
  const top = (bars: ChartBar[]) => Math.max(...bars.map((b) => b.value ?? 0), 1);
  return (
    <details className={styles.charts}>
      <summary>Students by subject and year group</summary>
      <div className={styles.chartPair}>
        <section>
          <h2>By subject</h2>
          <p className={styles.muted}>A student can take several subjects</p>
          <BarChart bars={bySubject} orientation="rows" max={top(bySubject)} ariaLabel="Students by subject" />
        </section>
        <section>
          <h2>By year group</h2>
          <p className={styles.muted}>Each student once, in their school year</p>
          <BarChart bars={byYear} orientation="columns" max={top(byYear)} ariaLabel="Students by year group" />
        </section>
      </div>
    </details>
  );
}
