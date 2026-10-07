import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/icons';
import { requireAdmin } from '@/lib/auth';
import { addTopic, deleteTopic, moveTopic, renameTopic } from '../actions';
import styles from '../subjects.module.css';

export const metadata = { title: 'Curriculum' };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

type Topic = { id: string; name: string; position: number; year_group: number | null };

const YEARS = Array.from({ length: 13 }, (_, i) => i + 1);

export default async function CurriculumPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { ok, error: problem } = await searchParams;
  const { supabase } = await requireAdmin();

  const { data: subject } = await supabase.from('subjects').select('id, name').eq('id', id).maybeSingle();
  if (!subject) notFound();

  const { data: topics, error } = await supabase
    .from('curriculum_topics')
    .select('id, name, position, year_group')
    .eq('subject_id', id)
    .order('year_group', { ascending: true, nullsFirst: true })
    .order('position');
  if (error) throw error;

  // Group the topics: "All year groups" first, then Year 1, Year 2…
  const groups = new Map<number | null, Topic[]>();
  for (const t of topics as Topic[]) groups.set(t.year_group, [...(groups.get(t.year_group) ?? []), t]);

  return (
    <>
      <Link href="/subjects" className={styles.back}>← All subjects</Link>
      <h1 className={styles.title}>{subject.name} curriculum</h1>
      <p className={styles.lead}>
        The default lesson plan. A new batch gets a copy: its own year group&apos;s topics first, then the
        &ldquo;All year groups&rdquo; topics. Existing batches keep their own plan.
      </p>

      {ok && <p className={`${styles.alert} ${styles.alertOk}`} role="status">{ok}</p>}
      {problem && <p className={`${styles.alert} ${styles.alertError}`} role="alert">{problem}</p>}

      <form action={addTopic} className={styles.panel}>
        <input type="hidden" name="subject_id" value={subject.id} />
        <input name="name" placeholder="New topic name" required className={styles.input} aria-label="New topic name" />
        <select name="year_group" defaultValue="" className={styles.select} aria-label="Year group">
          <option value="">All year groups</option>
          {YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
        </select>
        <button className={styles.primaryButton}>Add topic</button>
      </form>

      {groups.size === 0 && <p className={styles.empty}>No topics yet. Add the first one above.</p>}

      {[...groups].map(([year, list]) => (
        <section key={year ?? 'all'} className={styles.group}>
          <h2>{year === null ? 'All year groups' : `Year ${year}`}</h2>
          <ol className={styles.topicList}>
            {list.map((t, i) => (
              <li key={t.id} className={styles.topic}>
                <span className={styles.number}>{i + 1}</span>
                <form action={renameTopic} className={`${styles.inline} ${styles.grow}`}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="subject_id" value={subject.id} />
                  <input name="name" defaultValue={t.name} required className={`${styles.input} ${styles.grow}`} aria-label={`Topic ${i + 1} name`} />
                  <button className={styles.button}>Save</button>
                </form>
                <div className={styles.inline}>
                  <TopicMoveForm id={t.id} subjectId={subject.id} direction="up" disabled={i === 0} />
                  <TopicMoveForm id={t.id} subjectId={subject.id} direction="down" disabled={i === list.length - 1} />
                  <form action={deleteTopic}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="subject_id" value={subject.id} />
                    <button className={styles.dangerButton}>Remove</button>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}

function TopicMoveForm(
  { id, subjectId, direction, disabled }: { id: string; subjectId: string; direction: 'up' | 'down'; disabled: boolean },
) {
  return (
    <form action={moveTopic}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="subject_id" value={subjectId} />
      <input type="hidden" name="direction" value={direction} />
      <button className={styles.iconButton} disabled={disabled} aria-label={`Move ${direction}`}>
        {direction === 'up' ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
      </button>
    </form>
  );
}
