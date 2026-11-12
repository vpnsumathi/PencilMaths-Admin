'use client';

import { useRef } from 'react';
import { switchStudent } from './actions';
import styles from './student.module.css';

export type LinkedStudent = { id: string; first_name: string; last_name: string; current: boolean };

// Family login: the child being shown, with a list to switch to a brother or sister.
export function StudentSwitcher({ students }: { students: LinkedStudent[] }) {
  const form = useRef<HTMLFormElement>(null);
  const current = students.find((s) => s.current) ?? students[0];
  return (
    <form ref={form} action={switchStudent}>
      <select name="student_id" defaultValue={current.id} className={styles.switcher}
        aria-label="Switch child" title="Switch child" onChange={() => form.current?.requestSubmit()}>
        {students.map((s) => (
          <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
        ))}
      </select>
      <noscript><button className={styles.signOut}>Switch</button></noscript>
    </form>
  );
}
