import Link from 'next/link';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/icons';
import { requireAdmin } from '@/lib/auth';
import { addSubject, moveSubject, renameSubject, setSubjectActive } from './actions';
import styles from './subjects.module.css';

export const metadata = { title: 'Subjects' };

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

export default async function SubjectsPage({ searchParams }: Props) {
  const { ok, error: problem } = await searchParams;
  const { supabase } = await requireAdmin();

  // curriculum_topics(count) counts each subject's topics in the same query.
  const { data: subjects, error } = await supabase
    .from('subjects')
    .select('id, name, active, curriculum_topics(count)')
    .order('sort')
    .order('name');
  if (error) throw error;

  return (
    <>
      <h1 className={styles.title}>Subjects</h1>
      <p className={styles.lead}>The subjects Pencil Maths teaches, in the order they appear across the portal.</p>

      {ok && <p className={`${styles.alert} ${styles.alertOk}`} role="status">{ok}</p>}
      {problem && <p className={`${styles.alert} ${styles.alertError}`} role="alert">{problem}</p>}

      <form action={addSubject} className={styles.panel}>
        <input name="name" placeholder="New subject name" required className={styles.input} aria-label="New subject name" />
        <button className={styles.primaryButton}>Add subject</button>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Order</th><th>Name</th><th>Curriculum</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {subjects.map((s, i) => (
              <tr key={s.id}>
                <td>
                  <div className={styles.inline}>
                    <MoveForm id={s.id} direction="up" disabled={i === 0} />
                    <MoveForm id={s.id} direction="down" disabled={i === subjects.length - 1} />
                  </div>
                </td>
                <td>
                  <form action={renameSubject} className={styles.inline}>
                    <input type="hidden" name="id" value={s.id} />
                    <input name="name" defaultValue={s.name} required className={styles.input} aria-label={`Name of ${s.name}`} />
                    <button className={styles.button}>Save</button>
                  </form>
                </td>
                <td>
                  <Link href={`/subjects/${s.id}`} className={styles.link}>
                    {s.curriculum_topics[0]?.count ?? 0} topics →
                  </Link>
                </td>
                <td>
                  <span className={s.active ? styles.active : styles.inactive}>{s.active ? 'On' : 'Off'}</span>
                </td>
                <td>
                  <form action={setSubjectActive}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="active" value={String(!s.active)} />
                    <button className={s.active ? styles.dangerButton : styles.button}>
                      {s.active ? 'Turn off' : 'Turn on'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MoveForm({ id, direction, disabled }: { id: string; direction: 'up' | 'down'; disabled: boolean }) {
  return (
    <form action={moveSubject}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button className={styles.iconButton} disabled={disabled} aria-label={`Move ${direction}`}>
        {direction === 'up' ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
      </button>
    </form>
  );
}
