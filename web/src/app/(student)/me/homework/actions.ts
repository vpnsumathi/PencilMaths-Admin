'use server';

import { revalidatePath } from 'next/cache';
import { checkFile, targetProblem, saveHandIn, type HandInResult } from '@/lib/homework/handin';
import { UUID } from '@/lib/options';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// Saves ONE file for one homework sheet, for the signed-in student. Called once per photo or PDF.
export async function handInMyFile(form: FormData): Promise<HandInResult> {
  const sheetId = String(form.get('sheet_id') ?? '');
  const part = Number(form.get('part')) || 1;
  const parts = Number(form.get('parts')) || 1;
  const name = String(form.get('name') ?? '');

  if (!UUID.test(sheetId)) return { ok: false, error: 'Homework not found.' };
  const checked = checkFile(form.get('file'));
  if ('error' in checked) return { ok: false, error: checked.error };

  // The database works out who is signed in and checks the homework is theirs.
  const supabase = await createClient();
  const [{ data: target }, { data: studentId }] = await Promise.all([
    supabase.rpc('my_handin_target', { p_sheet: sheetId }),
    supabase.rpc('current_student_id'),
  ]);
  const problem = targetProblem(target, 'This homework is not one of yours.');
  if (problem || !studentId) return { ok: false, error: problem ?? 'Homework not found.' };

  try {
    // The server records the hand-in with the student's hand-in code, which only it can read.
    const { data: student, error } = await createAdminClient()
      .from('students').select('handin_code').eq('id', studentId).single();
    if (error || !student) throw new Error(error?.message ?? 'Student not found');
    await saveHandIn(student.handin_code, sheetId, target, checked, part, name, parts);
  } catch (e) {
    console.error('handInMyFile failed:', e);
    return { ok: false, error: 'Sorry, the upload failed. Please try again.' };
  }

  revalidatePath('/me/homework');
  return { ok: true };
}
