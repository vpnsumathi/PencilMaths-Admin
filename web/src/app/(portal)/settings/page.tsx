import Link from 'next/link';
import ui from '@/components/ui.module.css';
import { ShieldCheckIcon, UploadIcon } from '@/components/icons';
import { requireAdmin } from '@/lib/auth';
import styles from './settings.module.css';

export const metadata = { title: 'Settings' };

// Admin-only pages that set the portal up: who can sign in, and loading data in bulk.
const PAGES = [
  { href: '/settings/staff', label: 'Staff', icon: ShieldCheckIcon, text: 'Who can sign in to the portal, their role, and deactivating accounts.' },
  { href: '/settings/import', label: 'Bulk import', icon: UploadIcon, text: 'Add students, batches, teachers and class times from a spreadsheet.' },
];

export default async function SettingsPage() {
  await requireAdmin();
  return (
    <>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Settings</h1>
          <p className={ui.subtitle}>For admins only.</p>
        </div>
      </div>
      <div className={styles.grid}>
        {PAGES.map(({ href, label, icon: Icon, text }) => (
          <Link key={href} href={href} className={styles.tile}>
            <span className={styles.icon}><Icon size={22} /></span>
            <span>
              <strong>{label}</strong>
              <span className={styles.text}>{text}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
