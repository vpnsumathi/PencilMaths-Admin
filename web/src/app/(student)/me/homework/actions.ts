'use server';

import { revalidatePath } from 'next/cache';
import { checkFile, targetProblem, uploadHandIn, type HandInResult } from '@/lib/homework/handin';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';

// Saves ONE file for one homework sheet, for the signed-in student. Called once per photo or PDF.
export async function handInMyFile(form: FormData): Promise<HandInResult> {
  const sheetId = String(form.get('sheet_id') ?? '');
  const part = Number(form.get('part')) || 1;

  if (!UUID.test(sheetId)) return { ok: false, error: 'Homework not found.' };
  const checked = checkFile(form.get('file'));
  if ('error' in checked) return { ok: false, error: checked.error };

  // The database works out who is signed in and checks the homework is theirs.
  const supabase = await createClient();
  const { data: target } = await supabase.rpc('my_handin_target', { p_sheet: sheetId });
  const problem = targetProblem(target, 'This homework is not one of yours.');
  if (problem) return { ok: false, error: problem };

  try {
    const saved = await uploadHandIn(target, checked, part);
    const { error } = await supabase.rpc('my_handin_record', { p_sheet: sheetId, ...saved });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error('handInMyFile failed:', e);
    return { ok: false, error: 'Sorry, the upload failed. Please try again.' };
  }

  revalidatePath('/me/homework');
  return { ok: true };
}
