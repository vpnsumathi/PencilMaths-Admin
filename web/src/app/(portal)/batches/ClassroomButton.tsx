'use client';

import { useFormStatus } from 'react-dom';

// A Google Classroom button on the batch page, greyed out while Google is being asked, so it can't be pressed twice.
export function ClassroomButton({ label, busy, className }: { label: string; busy: string; className: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? busy : label}</button>;
}
