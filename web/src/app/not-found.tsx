import type { Metadata } from 'next';
import { ProblemPage } from '@/components/ProblemPage';

export const metadata: Metadata = { title: 'Not found' };

// An address that doesn't exist, or a homework hand-in link that no longer works (reset, or the student has left).
export default function NotFound() {
  return (
    <ProblemPage look="page" title="Page not found" home={{ href: '/', label: 'Go to Pencil Maths' }}>
      This link doesn&apos;t work. It may be mistyped or out of date. If it is a homework link, please ask Pencil
      Maths for the latest one.
    </ProblemPage>
  );
}
