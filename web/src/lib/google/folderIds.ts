import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Remembers the Drive id of each folder the app makes (table drive_folders, server only), keyed
// "<parent id>/<name>". Saves a search of Drive by name on every upload, and stops two uploads at the
// same moment from making two folders with the same name.
// If the table is not there yet (SQL not run) or the secret key is missing, this switches itself off
// and the app simply searches Drive by name as before.

const memory = new Map<string, string>();
let off = false;

function missingTable(error: { code?: string } | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}
function client() {
  if (off || !process.env.SUPABASE_SECRET_KEY) return null;
  return createAdminClient();
}

export async function savedFolderId(key: string): Promise<string | null> {
  const hit = memory.get(key);
  if (hit) return hit;
  const db = client();
  if (!db) return null;
  const { data, error } = await db.from('drive_folders').select('folder_id').eq('key', key).maybeSingle();
  if (error) {
    if (missingTable(error)) off = true;
    else console.error('drive_folders read failed:', error.message);
    return null;
  }
  if (data) memory.set(key, data.folder_id);
  return data?.folder_id ?? null;
}

// Saves the id unless another request saved one first. Returns the id that is now saved (theirs or ours).
export async function saveFolderId(key: string, folderId: string): Promise<string> {
  const db = client();
  if (!db) return folderId;
  const { error } = await db.from('drive_folders').upsert({ key, folder_id: folderId }, { onConflict: 'key', ignoreDuplicates: true });
  if (error) {
    if (missingTable(error)) off = true;
    else console.error('drive_folders save failed:', error.message);
    return folderId;
  }
  const { data } = await db.from('drive_folders').select('folder_id').eq('key', key).maybeSingle();
  const winner = data?.folder_id ?? folderId;
  memory.set(key, winner);
  return winner;
}

// A saved folder Drive no longer has (deleted or in the bin): forget it, so the next try searches again.
export async function forgetFolderId(folderId: string) {
  for (const [k, v] of memory) if (v === folderId) memory.delete(k);
  const db = client();
  if (!db) return;
  const { error } = await db.from('drive_folders').delete().eq('folder_id', folderId);
  if (error && !missingTable(error)) console.error('drive_folders forget failed:', error.message);
}
