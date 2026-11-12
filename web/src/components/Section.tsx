'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import s from './Section.module.css';

type Props = {
  id: string;
  title: string;
  // One short line next to the title, so a closed section still says what is in it ("3 notes · latest 11 Nov").
  summary?: React.ReactNode;
  // Open the first time the page is shown (e.g. Students and Homework on the batch page).
  defaultOpen?: boolean;
  // Open now whatever was chosen before (e.g. the Attendance register after choosing a date).
  forceOpen?: boolean;
  children: React.ReactNode;
};

const storageKey = (path: string, id: string) => `pm-section:${path}#${id}`;

// A card that opens and closes when its header is pressed (a native <details>, so it works with the keyboard and
// screen readers, and before any JavaScript has loaded). It remembers being opened or closed for the rest of the
// visit (this browser tab only), so a save that reloads the page doesn't fold it away again. A link to #<id>
// (the section bar at the top of the page, or an address with #<id>) opens it.
export function Section({ id, title, summary, defaultOpen = false, forceOpen = false, children }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(storageKey(pathname, id)); } catch { /* private mode: just use the default */ }
    if (forceOpen || window.location.hash === `#${id}`) el.open = true;
    else if (saved) el.open = saved === 'open';
    const onHash = () => { if (window.location.hash === `#${id}`) el.open = true; };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [pathname, id, forceOpen]);

  function remember(e: React.SyntheticEvent<HTMLDetailsElement>) {
    try { sessionStorage.setItem(storageKey(pathname, id), e.currentTarget.open ? 'open' : 'closed'); } catch { /* not saved: fine */ }
  }

  return (
    <details ref={ref} id={id} data-section="" className={s.section} open={defaultOpen || forceOpen} onToggle={remember}>
      <summary className={s.head}>
        <span className={s.text}>
          <h2 className={s.title}>{title}</h2>
          {summary && <span className={s.summary}>{summary}</span>}
        </span>
        <svg className={s.chevron} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className={s.body}>{children}</div>
    </details>
  );
}
