'use client';

import { useEffect, useRef } from 'react';

// A box that opens scrolled to its end, so the newest message is in view, and scrolls there again when a new
// message arrives (last changes). With stay false (the person asked for older messages) it is left at the top.
export function ScrollToEnd({ className, last, stay = true, children }: {
  className?: string; last: string | null; stay?: boolean; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stay && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [last, stay]);
  return <div ref={ref} className={className}>{children}</div>;
}
