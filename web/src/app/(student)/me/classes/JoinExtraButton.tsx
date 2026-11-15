'use client';

import { useFormStatus } from 'react-dom';
import styles from '../../student.module.css';
import { joinExtraClass } from './extraActions';

function Label() {
  const { pending } = useFormStatus();
  return <>{pending ? 'Opening your class…' : 'I\'m here, open class'}</>;
}

// Join an extra class at join time (from 15 minutes before the start to the end). Pressing it checks the student
// in and opens the class's Google Meet room. Pressing it twice does no harm: the first press is the one that counts.
export function JoinExtraButton({ id, back = '/me/classes' }: { id: string; back?: '/me' | '/me/classes' }) {
  return (
    <form action={joinExtraClass} className={styles.joinForm}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <button className={styles.join}><Label /></button>
    </form>
  );
}
