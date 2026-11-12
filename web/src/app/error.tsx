'use client';

import { ProblemPage } from '@/components/ProblemPage';

// Shown for a page outside the portal and the student area (sign-in, the WhatsApp hand-in link, email links),
// and when the portal or student area itself can't load (their menus need the database too).
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ProblemPage look="page" title="Sorry, something went wrong" error={error} reset={reset}>
      This page could not be loaded. Please try again in a moment. If it keeps happening, please tell Pencil Maths.
    </ProblemPage>
  );
}
