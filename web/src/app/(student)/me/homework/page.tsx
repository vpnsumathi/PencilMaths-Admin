import Link from 'next/link';
import { HandInForm } from '@/app/h/[code]/HandInForm';
import { formatDate } from '@/lib/format';
import { todayInUk } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import styles from '../../student.module.css';
import { handInMyFile } from './actions';

export const metadata = { title: 'My homework' };

type Homework = {
  sheet_id: string; title: string; subject: string; set_on: string; due_on: string | null;
  max_mark: number | null; status: string; mark: number | null; files: number;
  sheets?: { id: string; label: string | null }[];
  handed?: { id: string; label: string | null }[];
  corrected?: { id: string; label: string | null }[];
};

// Links to the homework sheet(s) staff attached.
function Sheets({ h }: { h: Homework }) {
  if (!h.sheets?.length) return null;
  return (
    <p className={styles.sheets}>
      {h.sheets.map((f) => (
        <a key={f.id} href={`/me/homework/file/${f.id}`} target="_blank" rel="noreferrer" className={styles.sheet}>
          📄 {f.label ?? 'Homework sheet'}
        </a>
      ))}
    </p>
  );
}

const TABS = [
  { key: 'todo', label: 'To hand in' },
  { key: 'handed', label: 'Handed in' },
  { key: 'marked', label: 'Marked' },
] as const;

// The files the student handed in, newest last. The date and time at the start of the Drive name is
// left out here ("2026-10-20 23.30 Fractions.pdf" shows as "Fractions.pdf").
function HandedFiles({ h }: { h: Homework }) {
  if (!h.handed?.length) return null;
  return (
    <div className={styles.handed}>
      <p className={styles.handedTitle}>Your handed-in file{h.handed.length === 1 ? '' : 's'}:</p>
      <p className={styles.sheets}>
        {h.handed.map((f) => (
          <a key={f.id} href={`/me/homework/file/${f.id}`} target="_blank" rel="noreferrer" className={styles.sheet}>
            📎 {(f.label ?? 'Handed-in file').replace(/^\d{4}-\d{2}-\d{2} \d{2}\.\d{2} /, '')}
          </a>
        ))}
      </p>
    </div>
  );
}

// The corrected sheet(s) the teacher uploaded after marking.
function CorrectedFiles({ h }: { h: Homework }) {
  if (!h.corrected?.length) return null;
  return (
    <div className={styles.handed}>
      <p className={styles.handedTitle}>Corrected by your teacher:</p>
      <p className={styles.sheets}>
        {h.corrected.map((f) => (
          <a key={f.id} href={`/me/homework/file/${f.id}`} target="_blank" rel="noreferrer" className={styles.sheet}>
            ✏️ {(f.label ?? 'Corrected sheet').replace(/^\d{4}-\d{2}-\d{2} \d{2}\.\d{2} /, '')}
          </a>
        ))}
      </p>
    </div>
  );
}

// The student's homework from the last 90 days, in three tabs: to hand in (the default), handed in, and marked.
// ?tab=handed or ?tab=marked opens the other tabs (the dashboard links use these).
export default async function MyHomework({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: asked } = await searchParams;
  const tab = TABS.some((t) => t.key === asked) ? asked : 'todo';
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_homework');
  const homework = (data ?? []) as Homework[];
  const today = todayInUk();

  const toDo = homework.filter((h) => h.status === 'pending');
  const handedIn = homework.filter((h) => h.status === 'received' || h.status === 'excused');
  const marked = homework.filter((h) => h.status === 'marked');

  return (
    <>
      <h1>My homework</h1>
      <p className={styles.muted}>Take a photo of each page, or choose a PDF or Word file, then press Hand in.</p>

      <nav className={styles.tabs} aria-label="Homework">
        {TABS.map((t) => {
          const count = { todo: toDo.length, handed: handedIn.length, marked: marked.length }[t.key];
          return (
            <Link key={t.key} href={t.key === 'todo' ? '/me/homework' : `/me/homework?tab=${t.key}`}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`} aria-current={tab === t.key ? 'page' : undefined}>
              {t.label} <span className={styles.count}>{count}</span>
            </Link>
          );
        })}
      </nav>

      {tab === 'todo' && <>
      {toDo.length === 0 && <p className={styles.muted}>Nothing to hand in right now. 🎉</p>}
      {toDo.map((h) => (
        <article key={h.sheet_id} className={styles.card} style={{ marginBottom: 12 }}>
          <p className={styles.subject}>{h.subject}</p>
          <h3>{h.title}</h3>
          <Sheets h={h} />
          <p className={styles.muted}>
            {h.due_on
              ? <span className={h.due_on < today ? styles.overdue : undefined}>
                  {h.due_on < today ? 'Overdue: was due' : 'Due'} {formatDate(h.due_on)}
                </span>
              : `Set ${formatDate(h.set_on)}`}
          </p>
          <HandInForm action={handInMyFile} sheetId={h.sheet_id} title={h.title} />
        </article>
      ))}

      </>}

      {tab === 'handed' && <>
      {handedIn.length === 0 && <p className={styles.muted}>Nothing waiting to be marked.</p>}
      {handedIn.map((h) => (
        <article key={h.sheet_id} className={`${styles.card} ${h.status === 'received' ? styles.done : ''}`} style={{ marginBottom: 12 }}>
          <p className={styles.subject}>{h.subject}</p>
          <h3>{h.title}</h3>
          <Sheets h={h} />
          <p className={styles.muted}>
            {h.status === 'excused'
              ? 'Excused'
              : <><strong className={styles.marked}>✓ Handed in</strong> · waiting to be marked · {h.files} file{h.files === 1 ? '' : 's'}</>}
          </p>
          <HandedFiles h={h} />
          <CorrectedFiles h={h} />
          {h.status === 'received' && <HandInForm action={handInMyFile} sheetId={h.sheet_id} title={h.title} label="Add more pages" />}
        </article>
      ))}

      </>}

      {tab === 'marked' && <>
      {marked.length === 0 && <p className={styles.muted}>Nothing marked yet.</p>}
      {marked.map((h) => (
        <article key={h.sheet_id} className={`${styles.card} ${styles.done}`} style={{ marginBottom: 12 }}>
          <p className={styles.subject}>{h.subject}</p>
          <h3>{h.title}</h3>
          <Sheets h={h} />
          <p className={styles.marked}>
            ✅ {h.mark !== null ? `${h.mark}${h.max_mark ? ` / ${h.max_mark}` : ''}` : 'Marked'}
          </p>
          <HandedFiles h={h} />
          <CorrectedFiles h={h} />
        </article>
      ))}
      </>}
    </>
  );
}
