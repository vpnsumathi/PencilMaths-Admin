'use client';

import { useEffect, useRef } from 'react';

// On the student form: each subject's batch list only shows batches for the chosen year group.
// Batch options carry data-year. Changing the year clears a chosen batch from another year;
// a batch already saved for this student stays visible when the page opens.
export function YearBatchFilter() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = marker.current?.closest('form');
    const year = form?.querySelector<HTMLSelectElement>('select[name="year_group"]');
    if (!form || !year) return;
    const batchLists = Array.from(form.querySelectorAll<HTMLSelectElement>('select[name^="batch_"]'));

    const apply = (clearOtherYears: boolean) => {
      for (const list of batchLists) {
        if (clearOtherYears && list.selectedOptions[0]?.dataset.year && list.selectedOptions[0].dataset.year !== year.value) {
          list.value = '';
        }
        for (const option of Array.from(list.options)) {
          if (!option.dataset.year) continue; // "No batch yet"
          // No year chosen yet: show every batch. Otherwise only that year's (plus the one already chosen).
          const show = !year.value || option.dataset.year === year.value || option.selected;
          option.hidden = !show;
          option.disabled = !show;
        }
      }
    };
    apply(false);
    const onChange = () => apply(true);
    year.addEventListener('change', onChange);
    return () => year.removeEventListener('change', onChange);
  }, []);

  return <span ref={marker} hidden />;
}
