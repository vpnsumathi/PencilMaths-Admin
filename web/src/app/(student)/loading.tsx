import { PageSkeleton } from '@/components/Skeleton';

// Shown in the student area (the top bar stays) from the moment a link is clicked until the page is ready.
export default function Loading() {
  return <PageSkeleton rows={4} />;
}
