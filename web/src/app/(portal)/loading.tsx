import { PageSkeleton } from '@/components/Skeleton';

// Shown inside the portal (the menu stays) from the moment a link is clicked until the new page is ready.
export default function Loading() {
  return <PageSkeleton />;
}
