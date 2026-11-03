'use client';

import { ProblemPage } from '@/components/ProblemPage';

// Shown inside the student area, with the top bar still there, when a student or family page fails to load.
export default function StudentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ProblemPage look="inside" title="Sorry, something went wrong" error={error} reset={reset} home={{ href: '/me', label: 'Go to my dashboard' }}>
      This page could not be loaded. Please try again in a moment. If it keeps happening, please tell Pencil Maths.
    </ProblemPage>
  );
}
