'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// The home page's only moving part (Help/12, section 3.2). It never asks the database on its own:
// - at: the next moment the page changes by itself (a check-in opening or closing): the page is fetched again once
//   then, so "Next class" turns into "I'm here, open class" without a reload;
// - after the phone or tab has been away for more than 5 minutes, the page is fetched again once when it comes back,
//   so a page left open overnight never shows yesterday.
export function ClassClock({ at }: { at: string | null }) {
  const router = useRouter();

  useEffect(() => {
    if (!at) return;
    const wait = new Date(at).getTime() - Date.now();
    if (wait <= 0 || wait > 86_400_000) return;
    const timer = setTimeout(() => router.refresh(), wait);
    return () => clearTimeout(timer);
  }, [at, router]);

  useEffect(() => {
    let hiddenAt = 0;
    const onChange = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000) { hiddenAt = 0; router.refresh(); }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [router]);

  return null;
}
