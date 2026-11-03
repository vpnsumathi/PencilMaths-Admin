import { redirect } from 'next/navigation';

// Staff moved under Settings (2 Nov 2026). Old links and bookmarks still work.
export default function OldStaffPage() {
  redirect('/settings/staff');
}
