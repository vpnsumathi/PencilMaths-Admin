'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import auth from './AuthCard.module.css';
import ui from './ui.module.css';

type Props = {
  title: string;
  children: React.ReactNode; // what happened and what to do, in a sentence or two
  // "page": a card of its own with the logo (sign-in, hand-in link, emails). "inside": inside the portal or
  // student area, so the menu stays and the person can go somewhere else.
  look: 'page' | 'inside';
  error?: Error & { digest?: string }; // the problem, when this is an error page
  reset?: () => void; // from Next.js: draws the page again
  home?: { href: string; label: string };
};

// The page shown instead of a page that failed to load ("Something went wrong") or doesn't exist ("Not found").
// Try again asks the server for the page again, so a passing problem (Supabase or Google Drive slow to answer)
// goes away without reloading the whole site. The reference matches the line in the Vercel logs.
export function ProblemPage({ title, children, look, error, reset, home }: Props) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  useEffect(() => {
    if (error) console.error(error);
  }, [error]);

  const retry = reset && (
    <button type="button" className={look === 'page' ? auth.submit : ui.primaryButton} disabled={retrying}
      onClick={() => startRetry(() => { router.refresh(); reset(); })}>
      {retrying ? 'Trying again…' : 'Try again'}
    </button>
  );
  const reference = error?.digest && <span>Reference: {error.digest}</span>;

  if (look === 'inside') {
    return (
      <section className={ui.card} role={error ? 'alert' : undefined} style={{ maxWidth: 560 }}>
        <h2>{title}</h2>
        <p style={{ margin: '0 0 16px', lineHeight: 1.5 }}>{children}</p>
        <div className={ui.formActions}>
          {retry}
          {home && <Link href={home.href} className={ui.button}>{home.label}</Link>}
        </div>
        {reference && <p className={ui.muted} style={{ margin: '16px 0 0', fontSize: 13 }}>{reference}</p>}
      </section>
    );
  }
  return (
    <main className={auth.page}>
      <section className={auth.card} role={error ? 'alert' : undefined}>
        <Image src="/logo.png" alt="Pencil Maths" width={181} height={60} priority className={auth.logo} />
        <h1 className={auth.title}>{title}</h1>
        <p className={auth.subtitle}>{children}</p>
        <div className={auth.form}>
          {retry}
          {home && <p className={auth.text}><Link href={home.href}>{home.label}</Link></p>}
        </div>
        {reference && <p className={auth.reason} style={{ marginTop: 16 }}>{reference}</p>}
      </section>
    </main>
  );
}
