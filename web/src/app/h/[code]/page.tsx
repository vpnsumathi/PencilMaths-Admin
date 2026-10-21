import { notFound } from 'next/navigation';
import { formatDate } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { handInFile } from './actions';
import { HandInForm } from './HandInForm';
import styles from './handin.module.css';

export const metadata = { title: 'Hand in homework' };

type Homework = {
  sheet_id: string; title: string; subject: string; set_on: string; due_on: string | null;
  max_mark: number | null; status: string; mark: number | null; files: number;
};

// Public page opened from the family's WhatsApp link. No sign-in: the code in the address is the key.
export default async function HandInPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[0-9a-f]{32}$/.test(code)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc('handin_page', { p_code: code });
  if (!data) notFound(); // wrong code, reset link, or student has left

  const homework = data.homework as Homework[];
  const toDo = homework.filter((h) => h.status === 'pending');
  const done = homework.filter((h) => h.status !== 'pending');

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <p className={styles.brand}>Pencil Maths</p>
        <h1>Hi {data.first_name} 👋</h1>
        <p className={styles.muted}>Hand in your homework here: take a photo of each page, or choose a PDF or Word file.</p>
      </header>

      <h2>To hand in</h2>
      {toDo.length === 0 && <p className={styles.muted}>Nothing to hand in right now. 🎉</p>}
      {toDo.map((h) => (
        <article key={h.sheet_id} className={styles.card}>
          <p className={styles.subject}>{h.subject}</p>
          <h3>{h.title}</h3>
          <p className={styles.muted}>{h.due_on ? `Due ${formatDate(h.due_on)}` : `Set ${formatDate(h.set_on)}`}</p>
          <HandInForm action={handInFile} code={code} sheetId={h.sheet_id} title={h.title} />
        </article>
      ))}

      {done.length > 0 && (
        <>
          <h2>Handed in</h2>
          {done.map((h) => (
            <article key={h.sheet_id} className={styles.card}>
              <p className={styles.subject}>{h.subject}</p>
              <h3>{h.title}</h3>
              <p className={styles.muted}>
                {h.status === 'marked' && h.mark !== null
                  ? `✅ Marked: ${h.mark}${h.max_mark ? ` / ${h.max_mark}` : ''}`
                  : h.status === 'excused'
                    ? 'Excused'
                    : `📥 Received · ${h.files} file${h.files === 1 ? '' : 's'}`}
              </p>
              {h.status === 'received' && <HandInForm action={handInFile} code={code} sheetId={h.sheet_id} title={h.title} label="Add more pages" />}
            </article>
          ))}
        </>
      )}
    </main>
  );
}