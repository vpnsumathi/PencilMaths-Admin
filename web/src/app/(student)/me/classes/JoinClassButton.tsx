'use client';

import { useFormStatus } from 'react-dom';
import styles from '../../student.module.css';
import { joinClass } from './actions';

// The words change while the class is opening, so a press shows straight away that something is happening.
function Label({ checkIn }: { checkIn: boolean }) {
  const { pending } = useFormStatus();
  return <>{pending ? 'Opening your class…' : checkIn ? 'I\'m here, open class' : 'Open classroom'}</>;
}

// One button, two wordings. At check-in time it says "I'm here, open class": pressing it checks the student in,
// then opens Google Classroom. At other times it says "Open classroom" and only opens the class. Either way the
// database decides whether a press counts, so a page left open past class time can't check anyone in.
// Pressing it twice does no harm: the first press is the one that counts.
export function JoinClassButton({ batchId, checkIn }: { batchId: string; checkIn: boolean }) {
  return (
    <form action={joinClass} className={styles.joinForm}>
      <input type="hidden" name="batch_id" value={batchId} />
      <button className={styles.join}><Label checkIn={checkIn} /></button>
    </form>
  );
}
