'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Shows new messages without a live connection: the page reloads its data every 30 seconds while it is on
// screen (never in a hidden tab), and straight away when the person comes back to the tab.
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      // Don't refresh while something is being typed: a refresh keeps the box, but this keeps it calm.
      const typing = document.activeElement instanceof HTMLTextAreaElement && document.activeElement.value !== '';
      if (document.visibilityState === 'visible' && !typing) router.refresh();
    };
    const timer = setInterval(tick, seconds * 1000);
    const onShow = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
  }, [router, seconds]);
  return null;
}
