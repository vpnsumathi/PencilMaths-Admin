'use client';

import { useEffect, useRef } from 'react';

// On the Homework Tracker filters: choosing a Year, Batch or Student shows the result straight away.
// A new Year clears Batch and Student; a new Batch clears Student, so the choices always fit together.
// Without JavaScript the form still works with its Show button.
export function AutoSubmit() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = marker.current?.closest('form');
    if (!form) return;
    const field = (name: string) => form.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
    const onChange = (e: Event) => {
      const name = (e.target as HTMLSelectElement | null)?.name;
      if (name !== 'year' && name !== 'batch' && name !== 'student') return;
      if (name === 'year') { const b = field('batch'); if (b) b.value = ''; }
      if (name === 'year' || name === 'batch') { const s = field('student'); if (s) s.value = ''; }
      form.requestSubmit();
    };
    form.addEventListener('change', onChange);
    return () => form.removeEventListener('change', onChange);
  }, []);

  return <span ref={marker} hidden />;
}
