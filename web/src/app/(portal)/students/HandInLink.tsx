'use client';

import { useState } from 'react';
import ui from '@/components/ui.module.css';
import { resetHandInLink } from './actions';

// The student's private hand-in link, with Copy, Send on WhatsApp and Reset.
export function HandInLink({ studentId, firstName, url, hasFolder }: {
  studentId: string; firstName: string; url: string; hasFolder: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const message = `Hi! Use this link to hand in ${firstName}'s Pencil Maths homework: take a photo of each page and tap Hand in. ${url}`;

  return (
    <section className={ui.card} style={{ marginBottom: 16, maxWidth: 900 }}>
      <h2>WhatsApp hand-in link</h2>
      {!hasFolder && <p className={ui.hint}>⚠️ Create the Drive folder first, otherwise uploads will fail.</p>}
      <input readOnly value={url} className={ui.input} style={{ width: '100%', marginBottom: 10 }} aria-label="Hand-in link"
        onFocus={(e) => e.currentTarget.select()} />
      <div className={ui.formActions}>
        <button type="button" className={ui.button}
          onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
        {/* Opens WhatsApp with the message ready; you pick the family's group. */}
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className={ui.primaryButton}>
          Send on WhatsApp
        </a>
        <form action={resetHandInLink}
          onSubmit={(e) => { if (!confirm('Make a new link? The old one will stop working.')) e.preventDefault(); }}>
          <input type="hidden" name="id" value={studentId} />
          <button className={ui.dangerButton}>Reset link</button>
        </form>
      </div>
    </section>
  );
}