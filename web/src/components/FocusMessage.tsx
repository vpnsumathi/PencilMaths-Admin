'use client';

import { useEffect, useRef } from 'react';

type Props = {
  as?: 'p' | 'div';
  className?: string;
  role: 'status' | 'alert';
  // Changes each time the message is shown again (e.g. the result of a new save), so the page moves to it again.
  signal?: unknown;
  children: React.ReactNode;
};

// A "saved" or problem message that the page moves to as soon as it appears, so it is never missed
// below or above the part of the page the person is looking at. Screen readers read it out too.
export function FocusMessage({ as: Tag = 'p', className, role, signal, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }, [signal]);
  return (
    <Tag ref={ref as React.Ref<never>} tabIndex={-1} className={className} role={role} style={{ outline: 'none' }}>
      {children}
    </Tag>
  );
}
