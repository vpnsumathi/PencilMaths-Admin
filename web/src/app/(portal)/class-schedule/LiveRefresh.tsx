'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import ui from '@/components/ui.module.css';

// Refreshes the Class Schedule page every 30 seconds while a class is on, only while the page is on screen
// (no refreshing in a hidden tab). The Refresh button does it straight away.
export function LiveRefresh({ active, updatedAt }: { active: boolean; updatedAt: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [clock, setClock] = useState('');

  useEffect(() => {
    setClock(new Date(updatedAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London' }));
  }, [updatedAt]);

  useEffect(() => {
    if (!active) return;
    const tick = () => { if (document.visibilityState === 'visible') start(() => router.refresh()); };
    const timer = setInterval(tick, 30_000);
    const onShow = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
  }, [active, router]);

  return (
    <span className={ui.stamp} aria-live="polite">
      {pending ? 'Updating…' : clock && `Updated ${clock}`}
      {active ? ' · updates every 30 seconds' : ''}{' '}
      <button type="button" className={ui.button} onClick={() => start(() => router.refresh())} disabled={pending}>Refresh</button>
    </span>
  );
}
