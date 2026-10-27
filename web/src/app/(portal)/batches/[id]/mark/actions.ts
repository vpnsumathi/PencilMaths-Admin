'use server';

import { revalidatePath } from 'next/cache';
import { startBrowserUpload, trashFile, uploadFile } from '@/lib/google/drive';
import { checkMarkedFile, correctionName, sendMarkedSheet, studentHomeworkFolder } from '@/lib/homework/corrections';
import { MAX_BYTES } from '@/lib/homework/handin';
import { UUID } from '@/lib/options';
import { siteUrl } from '@/lib/siteUrl';
import { createClient } from '@/lib/supabase/server';

// The marking page (a new tab from the batch page's homework list) saves in three steps:
// 1. startMarkedUpload checks the mark and gets a Google Drive upload address for the marked PDF;
// 2. the browser sends the PDF straight to Drive (no size limit from our server);
// 3. finishMarking checks the file arrived, saves the mark and the drawings, and shows it to the student;
//    or, for Save & close, saveMarkingDraft keeps it unsent until Send is pressed on the batch page.
// If the browser can't reach Drive directly, uploadMarkedViaServer is the fallback (4 MB max).
// "sending" is false for Save & close, which doesn't need a mark yet.

type Ids = { batchId: string; sheetId: string; studentId: string };
export type Step<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// The homework (in this batch) and the student's result. Also checks the mark if one was typed.
async function load(ids: Ids, mark: number | null, sending = true) {
  if (![ids.batchId, ids.sheetId, ids.studentId].every((v) => UUID.test(v))) return { error: 'Homework not found.' } as const;
  const supabase = await createClient();
  const [{ data: sheet }, { data: result }] = await Promise.all([
    supabase.from('homework_sheets').select('id, title, max_mark').eq('id', ids.sheetId).eq('batch_id', ids.batchId).maybeSingle(),
    supabase.from('homework_results').select('status').eq('sheet_id', ids.sheetId).eq('student_id', ids.studentId).maybeSingle(),
  ]);
  if (!sheet || !result) return { error: 'Homework not found.' } as const;
  if (sending && mark === null && result.status !== 'marked') return { error: 'Enter a mark, then Save & send.' } as const;
  if (mark !== null && !(Number.isFinite(mark) && mark >= 0)) return { error: 'The mark must be 0 or more.' } as const;
  if (mark !== null && sheet.max_mark !== null && mark > sheet.max_mark) return { error: `The mark can't be more than ${sheet.max_mark}.` } as const;
  return { supabase, sheet } as const;
}

export async function startMarkedUpload(ids: Ids, mark: number | null, size: number, sending: boolean): Promise<Step<{ uploadUrl: string; name: string }>> {
  const found = await load(ids, mark, sending);
  if ('error' in found) return { ok: false, error: found.error! };
  try {
    const homework = await studentHomeworkFolder(found.supabase, ids.studentId);
    const name = correctionName(found.sheet.title, 'pdf');
    const uploadUrl = await startBrowserUpload(homework.id, name, 'application/pdf', size, await siteUrl());
    return { ok: true, uploadUrl, name };
  } catch (e) {
    console.error('startMarkedUpload failed:', e);
    return { ok: false, error: 'Could not reach Google Drive. Try again in a moment.' };
  }
}

// Fallback when the browser can't send to Drive itself: the PDF comes through our server instead.
export async function uploadMarkedViaServer(ids: Ids, mark: number | null, form: FormData, sending: boolean): Promise<Step<{ driveFileId: string; name: string }>> {
  const found = await load(ids, mark, sending);
  if ('error' in found) return { ok: false, error: found.error! };
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'The marked sheet is empty.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'The marked sheet is too big to send this way (4 MB max). Use Download, then upload it on the homework page.' };
  try {
    const homework = await studentHomeworkFolder(found.supabase, ids.studentId);
    const name = correctionName(found.sheet.title, 'pdf');
    const uploaded = await uploadFile(homework.id, name, 'application/pdf', await file.arrayBuffer());
    return { ok: true, driveFileId: uploaded.id, name };
  } catch (e) {
    console.error('uploadMarkedViaServer failed:', e);
    return { ok: false, error: 'Could not upload the marked sheet to Google Drive.' };
  }
}

type Saved = { mark: number | null; driveFileId: string; name: string; sourceFileId: string; drawings: unknown };

// Save & send: the student sees the marked sheet (and the mark) straight away.
export async function finishMarking(ids: Ids, saved: Saved): Promise<Step<{ message: string }>> {
  const found = await load(ids, saved.mark);
  if ('error' in found) return { ok: false, error: found.error! };
  if (!UUID.test(saved.sourceFileId)) return { ok: false, error: 'The marked sheet was not found.' };

  const problem = await sendMarkedSheet(found.supabase, ids.sheetId, ids.studentId, { id: saved.driveFileId, name: saved.name }, saved.mark);
  if (problem) return { ok: false, error: problem };
  await keepDrawings(found.supabase, ids, saved, null);

  revalidatePath(`/batches/${ids.batchId}`);
  revalidatePath('/');
  return {
    ok: true,
    message: saved.mark !== null
      ? 'Mark and marked sheet sent. The student can see them now.'
      : 'Marked sheet sent. The student can see it now.',
  };
}

// Save & close: the marked sheet waits (not shown to the student) until Send is pressed on the batch page.
export async function saveMarkingDraft(ids: Ids, saved: Saved): Promise<Step<{ message: string }>> {
  const found = await load(ids, saved.mark, false);
  if ('error' in found) return { ok: false, error: found.error! };
  if (!UUID.test(saved.sourceFileId)) return { ok: false, error: 'The marked sheet was not found.' };
  const { supabase } = found;

  try {
    await checkMarkedFile(supabase, ids.studentId, saved.driveFileId);
  } catch (e) {
    console.error('saveMarkingDraft file failed:', e);
    return { ok: false, error: 'The marked sheet could not be saved. Try again.' };
  }
  const { data: before } = await supabase.from('homework_markups').select('draft_file_id')
    .eq('sheet_id', ids.sheetId).eq('student_id', ids.studentId).maybeSingle();
  const error = await keepDrawings(supabase, ids, saved, { id: saved.driveFileId, name: saved.name });
  if (error) return { ok: false, error: 'The marked sheet could not be saved. Try again.' };
  // An earlier unsent copy is replaced by this one.
  if (before?.draft_file_id && before.draft_file_id !== saved.driveFileId) {
    await trashFile(before.draft_file_id).catch((e) => console.error('trash draft failed:', e));
  }

  revalidatePath(`/batches/${ids.batchId}`);
  return { ok: true, message: 'Saved. It is not sent yet: press Send next to the student on the batch page.' };
}

// Keeps the drawings (so the sheet can be reopened and changed) and the unsent copy, if any.
async function keepDrawings(supabase: Awaited<ReturnType<typeof createClient>>, ids: Ids, saved: Saved, draft: { id: string; name: string } | null) {
  const { error } = await supabase.from('homework_markups').upsert({
    sheet_id: ids.sheetId, student_id: ids.studentId, source_file_id: saved.sourceFileId, data: saved.drawings,
    updated_at: new Date().toISOString(),
    draft_file_id: draft?.id ?? null, draft_name: draft?.name ?? null,
    draft_mark: draft ? saved.mark : null, draft_saved_at: draft ? new Date().toISOString() : null,
  }, { onConflict: 'sheet_id,student_id' });
  if (error) console.error('keepDrawings failed:', error.message);
  return error;
}
