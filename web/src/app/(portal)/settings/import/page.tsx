import Link from 'next/link';
import ui from '@/components/ui.module.css';
import { requireAdmin } from '@/lib/auth';
import { ImportForm } from './ImportForm';

export const metadata = { title: 'Bulk import' };

export default async function BulkImportPage() {
  await requireAdmin();
  return (
    <>
      <Link href="/settings" className={ui.back}>← Settings</Link>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>Bulk import</h1>
          <p className={ui.subtitle}>
            Add students, batches, teachers and class times from a spreadsheet. Check the file first: nothing is saved until you press Import.
          </p>
        </div>
      </div>
      <ImportForm />
    </>
  );
}
