'use server';

import { revalidatePath } from 'next/cache';
import { checkFile, targetProblem, uploadHandIn, type HandInResult } from '@/lib/homework/handin';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

const CODE = /^[0-9a-f]{32}$/;

// Saves ONE file for one homework sheet. The page calls it once per photo or PDF.
export async function handInFile(form: FormData): Promise<HandInResult> {
  const code = String(form.get('code') ?? '');
  const sheetId = String(form.get('sheet_id') ?? '');
  const part = Number(form.get('part')) || 1;
  const parts = Number(form.get('parts')) || 1;
  const name = String(form.get('name') ?? '');

  if (!CODE.test(code) || !UUID.test(sheetId)) return { ok: false, error: 'This link is not valid.' };
  const checked = checkFile(form.get('file'));
  if ('error' in checked) return { ok: false, error: checked.error };

  // Not signed in: the database functions check the code and homework belong together.
  const supabase = await createClient();
  const { data: target } = await supabase.rpc('handin_target', { p_code: code, p_sheet: sheetId });
  const problem = targetProblem(target, 'This homework is not on this link.');
  if (problem) return { ok: false, error: problem };

  try {
    const saved = await uploadHandIn(target, checked, part, name, parts);
    const { error } = await supabase.rpc('handin_record', { p_code: code, p_sheet: sheetId, ...saved });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error('handInFile failed:', e);
    return { ok: false, error: 'Sorry, the upload failed. Please try again.' };
  }

  revalidatePath(`/h/${code}`);
  return { ok: true };
}
