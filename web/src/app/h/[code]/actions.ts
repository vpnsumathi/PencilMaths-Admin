'use server';

import { revalidatePath } from 'next/cache';
import { findOrCreateFolder, uploadFile } from '@/lib/google/drive';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

const CODE = /^[0-9a-f]{32}$/;
// Accepted file types: photos, PDF and Word.
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
// Some phones send Word files without a type, so it is worked out from the file name instead.
const BY_EXTENSION = Object.fromEntries(Object.entries(TYPES).map(([type, ext]) => [ext, type]));
const MAX_BYTES = 4 * 1024 * 1024; // Vercel accepts requests up to about 4.5 MB

export type HandInResult = { ok: true } | { ok: false; error: string };

// Saves ONE file for one homework sheet. The page calls it once per photo or PDF.
export async function handInFile(form: FormData): Promise<HandInResult> {
  const code = String(form.get('code') ?? '');
  const sheetId = String(form.get('sheet_id') ?? '');
  const part = Number(form.get('part')) || 1;
  const file = form.get('file');

  if (!CODE.test(code) || !UUID.test(sheetId)) return { ok: false, error: 'This link is not valid.' };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose a photo, PDF or Word file.' };
  const type = TYPES[file.type] ? file.type : BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''];
  const ext = type ? TYPES[type] : undefined;
  if (!type || !ext) return { ok: false, error: 'Only photos (JPG, PNG, HEIC), PDF and Word files can be handed in.' };
  if (file.size > MAX_BYTES) return { ok: false, error: `${file.name} is too big (4 MB max).` };

  // Not signed in: the database functions check the code and homework belong together.
  const supabase = await createClient();
  const { data: target } = await supabase.rpc('handin_target', { p_code: code, p_sheet: sheetId });
  if (!target) return { ok: false, error: 'This homework is not on this link.' };
  if (!target.folder_id) return { ok: false, error: 'Your homework folder is not ready yet. Please tell Pencil Maths.' };
  if (target.files >= 20) return { ok: false, error: 'This homework already has the maximum number of files.' };

  try {
    const homework = await findOrCreateFolder('Homework', target.folder_id);
    // e.g. "2026-10-11 14.05 Maths - Practice sheet 1 (2).jpg"
    const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/London' }).slice(0, 16).replace(':', '.');
    const name = `${stamp} ${target.subject} - ${target.title} (${part}).${ext}`;
    const uploaded = await uploadFile(homework.id, name, type, await file.arrayBuffer());

    const { error } = await supabase.rpc('handin_record', {
      p_code: code, p_sheet: sheetId, p_file_id: uploaded.id, p_url: uploaded.webViewLink, p_label: name,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error('handInFile failed:', e);
    return { ok: false, error: 'Sorry, the upload failed. Please try again.' };
  }

  revalidatePath(`/h/${code}`);
  return { ok: true };
}