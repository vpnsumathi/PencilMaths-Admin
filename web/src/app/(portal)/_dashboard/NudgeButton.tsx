'use client';

import { useState } from 'react';
import { FocusMessage } from '@/components/FocusMessage';
import ui from '@/components/ui.module.css';
import type { Behind } from './homework';

// Opens WhatsApp with a friendly reminder about a student's overdue homework. With a parent's phone number
// it opens that chat; without one you pick the family's group. A message then confirms what was opened.
export function NudgeButton({ student }: { student: Behind }) {
  const [sent, setSent] = useState(0);
  const list = student.titles.map((t) => `• ${t}`).join('\n');
  const message = `Hi${student.parent ? ` ${student.parent}` : ''}, a quick reminder from Pencil Maths: `
    + `${student.firstName} has ${student.overdue} homework${student.overdue === 1 ? '' : 's'} not handed in yet:\n${list}\n`
    + `Please hand ${student.overdue === 1 ? 'it' : 'them'} in with the hand-in link when you can. Thank you!`;
  const href = `https://wa.me/${student.phone ?? ''}?text=${encodeURIComponent(message)}`;

  return (
    <>
      <a href={href} target="_blank" rel="noreferrer" className={ui.primaryButton} onClick={() => setSent((n) => n + 1)}>
        WhatsApp nudge
      </a>
      {sent > 0 && (
        <FocusMessage role="status" signal={sent} className={`${ui.alert} ${ui.alertOk}`}>
          WhatsApp opened with a reminder for {student.firstName}&apos;s family.
          {!student.phone && <> No parent phone is saved, so pick {student.group ? <>the group <b>{student.group}</b></> : 'the family’s group'}.</>}
        </FocusMessage>
      )}
    </>
  );
}
