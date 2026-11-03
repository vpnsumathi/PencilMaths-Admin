'use client';

import { ProblemPage } from '@/components/ProblemPage';

// Shown inside the portal, with the menu still there, when a staff or teacher page fails to load
// (for example Supabase or Google Drive didn't answer in time).
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ProblemPage look="inside" title="Something went wrong" error={error} reset={reset} home={{ href: '/', label: 'Go to the dashboard' }}>
      This page could not be loaded. Try again in a moment. If it keeps happening, send the reference below to
      the admin.
    </ProblemPage>
  );
}
