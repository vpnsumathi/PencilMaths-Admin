import { ProblemPage } from '@/components/ProblemPage';

// A student, batch, enquiry… that doesn't exist (any more), or that this login can't see
// (a teacher only sees their own batches and students). Shown inside the portal.
export default function PortalNotFound() {
  return (
    <ProblemPage look="inside" title="Not found" home={{ href: '/', label: 'Go to the dashboard' }}>
      This page doesn&apos;t exist. It may have been deleted, or your login may not have access to it.
    </ProblemPage>
  );
}
