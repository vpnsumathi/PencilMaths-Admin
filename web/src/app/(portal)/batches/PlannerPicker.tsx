'use client';

import { usePathname, useRouter } from 'next/navigation';
import ui from '@/components/ui.module.css';

// Term and Module dropdowns for the batch's lesson plan. Choosing one shows that module's lessons.
// Changing the term picks that term's first module.
export function PlannerPicker({ modules, term, moduleName }: {
  modules: Record<number, string[]>; term: number; moduleName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (t: number, m: string) => router.push(`${pathname}?${new URLSearchParams({ term: String(t), module: m })}`, { scroll: false });

  return (
    <div className={ui.formActions} style={{ marginBottom: 12 }}>
      <label className={ui.formActions}>
        <span className={ui.label}>Term</span>
        <select value={term} className={ui.input} onChange={(e) => { const t = Number(e.target.value); go(t, modules[t]?.[0] ?? ''); }}>
          {Object.keys(modules).map(Number).map((t) => <option key={t} value={t}>Term {t}</option>)}
        </select>
      </label>
      <label className={ui.formActions}>
        <span className={ui.label}>Module</span>
        <select value={moduleName} className={ui.input} onChange={(e) => go(term, e.target.value)}>
          {(modules[term] ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
    </div>
  );
}
