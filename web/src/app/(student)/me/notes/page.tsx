import Link from 'next/link';
import { formatDay } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import styles from '../../student.module.css';
import notes from './notes.module.css';

export const metadata = { title: 'Class notes and documents' };

type Note = {
  id: string; title: string; body: string | null; created_at: string; batch_id: string; subject: string;
  topic: string | null; has_file: boolean; is_link: boolean; file_name: string | null;
};

// The class notes and documents teachers have shared with the student's classes, newest first.
// With more than one class, tabs pick one subject (?subject=Maths); "All" shows everything.
export default async function MyClassNotes({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { subject: asked } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_class_notes');
  if (error) console.error('my_class_notes failed:', error.message);
  const all = (data ?? []) as Note[];

  const subjects = [...new Set(all.map((n) => n.subject))].sort();
  const subject = asked && subjects.includes(asked) ? asked : null;
  const shown = subject ? all.filter((n) => n.subject === subject) : all;

  return (
    <>
      <h1>Class notes and documents</h1>
      <p className={styles.muted}>Notes, worksheets and documents your teachers have shared with your class.</p>

      {subjects.length > 1 && (
        <nav className={styles.tabs} aria-label="Subjects">
          {[null, ...subjects].map((s) => (
            <Link key={s ?? 'all'} href={s ? `/me/notes?subject=${encodeURIComponent(s)}` : '/me/notes'}
              className={`${styles.tab} ${subject === s ? styles.tabActive : ''}`} aria-current={subject === s ? 'page' : undefined}>
              {s ?? 'All'} <span className={styles.count}>{s ? all.filter((n) => n.subject === s).length : all.length}</span>
            </Link>
          ))}
        </nav>
      )}

      {shown.length === 0 && <p className={styles.muted} style={{ marginTop: 16 }}>No class notes yet. Your teacher will add them here.</p>}
      <div className={notes.list}>
        {shown.map((n) => (
          <article key={n.id} className={styles.card}>
            <p className={styles.subject}>{n.subject}{n.topic ? ` · ${n.topic}` : ''}</p>
            <h3>{n.title}</h3>
            <p className={styles.muted}>Added {formatDay(n.created_at)}</p>
            {n.body && <p className={notes.body}>{n.body}</p>}
            {n.has_file && (
              <p className={styles.sheets}>
                <a href={`/me/notes/${n.id}`} target="_blank" rel="noreferrer" className={styles.sheet}>
                  {n.is_link ? '🔗 Open link' : `📄 ${n.file_name ?? 'Open document'}`}
                </a>
              </p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
