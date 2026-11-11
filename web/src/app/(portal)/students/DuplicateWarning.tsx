'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import ui from '@/components/ui.module.css';
import { STUDENT_STATUSES, yearLabel } from '@/lib/options';
import { findStudentMatches, type StudentMatch } from './duplicates';

// On the Add student form: when the first name, last name and year group typed match a student already in the
// app, shows them (with a link) and asks for a tick before the new student can be added. Two children can share
// a name, so it warns instead of refusing.
export function DuplicateWarning() {
  const ref = useRef<HTMLDivElement>(null);
  const [matches, setMatches] = useState<StudentMatch[]>([]);

  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let asked = 0;
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const data = new FormData(form);
        const call = ++asked;
        const found = await findStudentMatches(String(data.get('first_name') ?? ''), String(data.get('last_name') ?? ''),
          Number(data.get('year_group'))).catch(() => []);
        if (call === asked) setMatches(found); // only the latest answer counts
      }, 400);
    };
    const onEdit = (e: Event) => {
      const name = (e.target as HTMLInputElement | null)?.name;
      if (name === 'first_name' || name === 'last_name' || name === 'year_group') check();
    };
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);
    return () => { clearTimeout(timer); form.removeEventListener('input', onEdit); form.removeEventListener('change', onEdit); };
  }, []);

  return (
    <div ref={ref} aria-live="polite" className={ui.full}>
      {matches.length > 0 && (
        <div className={`${ui.alert} ${ui.alertWarn}`} role="alert" style={{ margin: '4px 0 0' }}>
          <strong>
            {matches.length === 1 ? 'A student with this name and year group is already in the app:' : `${matches.length} students with this name and year group are already in the app:`}
          </strong>
          <ul style={{ margin: '6px 0 10px', paddingLeft: 18 }}>
            {matches.map((m) => (
              <li key={m.id}>
                <Link href={`/students/${m.id}`} target="_blank" className={ui.link}>{m.code} {m.first_name} {m.last_name}</Link>
                {' '}· {yearLabel(m.year_group)} · {STUDENT_STATUSES[m.status] ?? m.status}
              </li>
            ))}
          </ul>
          <label className={ui.check} style={{ fontWeight: 500 }}>
            <input type="checkbox" name="confirm_duplicate" value="yes" required />
            This is a different student. Add them anyway.
          </label>
        </div>
      )}
    </div>
  );
}
