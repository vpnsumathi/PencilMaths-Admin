'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ui from '@/components/ui.module.css';
import { createMissingDriveFolders } from './actions';

export type MissingFolder = { id: string; name: string };

// On the Students list (staff only): students who have no Google Drive folder can't hand in homework
// ("Your homework folder is not ready yet"). One press makes all the missing folders, 5 at a time.
export function MissingFolders({ students }: { students: MissingFolder[] }) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; failed: number; running: boolean } | null>(null);
  const total = students.length;

  async function run() {
    const ids = students.map((s) => s.id);
    const p = { done: 0, failed: 0, running: true };
    setProgress({ ...p });
    for (let i = 0; i < ids.length; i += 5) {
      try {
        const r = await createMissingDriveFolders(ids.slice(i, i + 5));
        p.done += r.made;
        p.failed += r.failed;
      } catch {
        p.failed += Math.min(5, ids.length - i);
      }
      setProgress({ ...p });
    }
    setProgress({ ...p, running: false });
    // The result shows in the page's usual green or red message (this box goes once every folder exists).
    const made = `${p.done} Drive folder${p.done === 1 ? '' : 's'} created.`;
    const query: Record<string, string> = p.failed
      ? { error: `${made} ${p.failed} could not be made: check the Google Drive connection and try again.` }
      : { ok: `${made} These students can hand in homework now.` };
    router.replace(`/students?${new URLSearchParams(query)}`);
  }

  const shown = students.slice(0, 8);
  return (
    <div className={`${ui.alert} ${ui.alertWarn}`} style={{ marginBottom: 16 }}>
      <p style={{ margin: '0 0 8px' }}>
        <strong>{total} student{total === 1 ? ' has' : 's have'} no Google Drive folder</strong>, so they can&apos;t hand in homework yet:{' '}
        {shown.map((s, i) => (
          <span key={s.id}>{i > 0 && ', '}<Link href={`/students/${s.id}`} className={ui.link}>{s.name}</Link></span>
        ))}
        {total > shown.length && ` and ${total - shown.length} more`}.
      </p>
      <button type="button" className={ui.primaryButton} onClick={run} disabled={progress?.running}>
        {progress?.running ? `Creating folders… ${progress.done + progress.failed} of ${total}` : `Create missing folder${total === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}
