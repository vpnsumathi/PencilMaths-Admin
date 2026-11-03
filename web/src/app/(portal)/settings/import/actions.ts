'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { readImportFile } from '@/lib/import/rows';
import { ensureStudentDriveFolder } from '@/lib/students/driveFolder';
import { UUID } from '@/lib/options';

// What the database function bulk_import sends back (see supabase/migrations/20261102000001_bulk_import.sql).
export type ImportReport = {
  ok: boolean;
  saved: boolean;
  dry_run: boolean;
  errors: { row: number | null; message: string }[];
  warnings: { row: number | null; message: string }[];
  teachers: { name: string; action: 'new' | 'existing'; code?: string; matched?: string }[];
  batches: { batch: string; teacher: string; times: string; action: 'new' | 'existing'; changes: string[] }[];
  students: { row: number; student: string; year: number; batch: string; status: 'new' | 'existing'; place: 'added' | 'moved' | 'unchanged'; from: string | null }[];
  new_student_ids: string[];
};
export type ImportState = { report?: ImportReport; problem?: string; fileName?: string; rows?: number; at?: number };

const MAX_BYTES = 5 * 1024 * 1024;

// "Check file" (saves nothing) and "Import" both send the chosen file; the button pressed sets mode.
// The same database function does both, so the check shows exactly what the import will do.
export async function bulkImport(_prev: ImportState, form: FormData): Promise<ImportState> {
  const { supabase } = await requireAdmin('/');
  const save = form.get('mode') === 'import';
  const file = form.get('file');
  const at = Date.now();
  if (!(file instanceof File) || file.size === 0) return { problem: 'Choose the spreadsheet first.', at };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { problem: 'Choose an Excel file (.xlsx) or a .csv file.', at };
  if (file.size > MAX_BYTES) return { problem: 'That file is too big (5 MB at most).', at };

  const read = readImportFile(file.name, await file.arrayBuffer());
  if ('error' in read) return { problem: read.error, fileName: file.name, at };

  const { data, error } = await supabase.rpc('bulk_import', { p_rows: read.rows, p_dry_run: !save });
  if (error) {
    console.error('bulkImport failed:', error.code, error.message, error.details, error.hint);
    // P0001 = a message raised on purpose (e.g. "Only admins can bulk import."). Anything else: the script may be missing.
    const problem = error.code === 'P0001' ? error.message
      : error.code === 'PGRST202' ? 'The database is not ready for Bulk import yet: run 20261102000001_bulk_import.sql in Supabase first.'
      // Admin-only page, so the database's own message is shown: it says what went wrong.
      : `Could not ${save ? 'import' : 'check'} the file. Database message: ${error.message}${error.details ? ` (${error.details})` : ''}${error.code ? ` [${error.code}]` : ''}`;
    return { problem, fileName: file.name, at };
  }

  const report = data as ImportReport;
  if (report.saved) {
    revalidatePath('/students');
    revalidatePath('/batches');
    revalidatePath('/teachers');
    revalidatePath('/');
  }
  return { report, fileName: file.name, rows: read.rows.length, at };
}

// Makes Google Drive folders for students just imported, a few at a time (the page calls this until all are done),
// so a long list never runs into the server's time limit. Returns how many worked.
export async function makeDriveFolders(ids: string[]): Promise<{ made: number; failed: number }> {
  await requireAdmin('/');
  let made = 0;
  let failed = 0;
  for (const id of ids.slice(0, 10)) {
    if (!UUID.test(id)) { failed++; continue; }
    try {
      await ensureStudentDriveFolder(id);
      made++;
    } catch (e) {
      console.error('makeDriveFolders failed for', id, e);
      failed++;
    }
  }
  return { made, failed };
}
