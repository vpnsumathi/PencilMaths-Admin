'use server';

import { wordToPdf } from '@/lib/google/drive';
import { UUID } from '@/lib/options';
import { createClient } from '@/lib/supabase/server';
import { checkFile } from './handin';

const CODE = /^[0-9a-f]{32}$/;

export type ConvertResult = { ok: true; pdf: string } | { ok: false; error: string };

// Turns one Word file into a PDF (base64) so the hand-in form can add it to the homework's single PDF.
// Only for someone who may hand in this homework: the WhatsApp link's code, or the signed-in student.
export async function convertWordToPdf(form: FormData): Promise<ConvertResult> {
  const code = String(form.get('code') ?? '');
  const sheetId = String(form.get('sheet_id') ?? '');
  if (!UUID.test(sheetId) || (code && !CODE.test(code))) return { ok: false, error: 'Homework not found.' };

  const checked = checkFile(form.get('file'));
  if ('error' in checked) return { ok: false, error: checked.error };
  if (checked.ext !== 'doc' && checked.ext !== 'docx') return { ok: false, error: 'Only Word files need converting.' };

  const supabase = await createClient();
  const { data: target } = code
    ? await supabase.rpc('handin_target', { p_code: code, p_sheet: sheetId })
    : await supabase.rpc('my_handin_target', { p_sheet: sheetId });
  if (!target) return { ok: false, error: 'Homework not found.' };

  try {
    const pdf = await wordToPdf(checked.file.name, checked.type, await checked.file.arrayBuffer());
    return { ok: true, pdf: Buffer.from(pdf).toString('base64') };
  } catch (e) {
    console.error('convertWordToPdf failed:', e);
    return { ok: false, error: `Could not turn ${checked.file.name} into a PDF. Save it as a PDF and try again.` };
  }
}
