'use client';

import { useState } from 'react';
import { FocusMessage } from '@/components/FocusMessage';
import styles from '../dashboard.module.css';

// What the nudge needs about a student falling behind (dashboard_summary(), staff only).
export type NudgeStudent = {
  firstName: string; overdue: number; titles: string[]; phone: string | null; group: string | null; parent: string | null;
};

// Opens WhatsApp with a friendly reminder about a student's overdue homework. With a parent's phone number
// it opens that chat; without one you pick the family's group. A message then confirms what was opened.
export function NudgeButton({ student }: { student: NudgeStudent }) {
  const [sent, setSent] = useState(0);
  const list = student.titles.map((t) => `• ${t}`).join('\n');
  const message = `Hi${student.parent ? ` ${student.parent}` : ''}, a quick reminder from Pencil Maths: `
    + `${student.firstName} has ${student.overdue} homework${student.overdue === 1 ? '' : 's'} not submitted yet:\n${list}\n`
    + `Please submit ${student.overdue === 1 ? 'it' : 'them'} with the homework link when you can. Thank you!`;
  const href = `https://wa.me/${student.phone ?? ''}?text=${encodeURIComponent(message)}`;

  return (
    <>
      <a href={href} target="_blank" rel="noreferrer" className={styles.nudge} onClick={() => setSent((n) => n + 1)}>
        WhatsApp nudge
      </a>
      {sent > 0 && (
        <FocusMessage role="status" signal={sent} className={styles.nudgeSent}>
          WhatsApp opened for {student.firstName}&apos;s family.
          {!student.phone && <> No parent phone is saved, so pick {student.group ? <>the group <b>{student.group}</b></> : 'the family’s group'}.</>}
        </FocusMessage>
      )}
    </>
  );
}
