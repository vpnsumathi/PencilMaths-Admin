import 'server-only';
import { isTeacher } from '@/lib/auth';
import { fileInfo, findOrCreateFolder, trashFile } from '@/lib/google/drive';
import { cleanName } from '@/lib/homework/handin';
import { todayInUk } from '@/lib/options';
import { ensureStudentDriveFolder } from '@/lib/students/driveFolder';
import { createAdminClient } from '@/lib/supabase/admin';
import type { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

// The student's Drive Homework folder (made if missing), where corrected sheets go.
// student_drive_folder works for staff and for the student's own teacher, and refuses anyone else.
export async function studentHomeworkFolder(supabase: Supabase, studentId: string) {
  const first = await supabase.rpc('student_drive_folder', { p_student: studentId });
  if (first.error) throw new Error(first.error.message);
  let folderId = first.data;
  if (!folderId) {
    // No Drive folder yet. Staff make it as usual; for a teacher (just checked above) the full-rights connection does.
    await ensureStudentDriveFolder(studentId, (await isTeacher()) ? createAdminClient() : undefined);
    ({ data: folderId } = await supabase.rpc('student_drive_folder', { p_student: studentId }));
  }
  if (!folderId) throw new Error('No Drive folder');
  return findOrCreateFolder('Homework', folderId as string);
}

// e.g. "2026-10-24 18.30 Digits and their places · Hw-1 (Y5-A001) - corrected.pdf"
export function correctionName(title: string, ext: string) {
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/London' }).slice(0, 16).replace(':', '.');
  return `${stamp} ${cleanName(title)} - corrected.${ext}`;
}

// Records an uploaded corrected sheet so the student sees it. One corrected sheet per student per homework:
// a new one replaces the earlier one in the app. The earlier file stays in the student's Drive Homework folder.
export async function recordCorrection(
  supabase: Supabase, sheetId: string, studentId: string, uploaded: { id: string; webViewLink: string }, name: string,
) {
  const { data: added, error } = await supabase.from('file_links').insert({
    owner_type: 'homework_correction', owner_id: sheetId, student_id: studentId, provider: 'google_drive',
    external_id: uploaded.id, url: uploaded.webViewLink, label: name,
  }).select('id').single();
  if (error) throw new Error(error.message);
  await supabase.from('file_links').delete()
    .eq('owner_type', 'homework_correction').eq('owner_id', sheetId).eq('student_id', studentId).neq('id', added.id);
}

// A marked sheet the browser uploaded: checks it is really in the student's Homework folder.
export async function checkMarkedFile(supabase: Supabase, studentId: string, driveFileId: string) {
  if (!/^[\w-]{10,}$/.test(driveFileId)) throw new Error('not a Drive file id');
  const homework = await studentHomeworkFolder(supabase, studentId);
  const info = await fileInfo(driveFileId);
  if (info.trashed || !info.parents?.includes(homework.id)) throw new Error('uploaded file is not in the Homework folder');
  return info;
}

// Sends a marked sheet (already in the student's Homework folder) to the student: it becomes their corrected
// sheet, the mark is saved if given, and any unsent "Save & close" copy is cleared (its file goes to the Drive bin).
// Returns a message if something failed, otherwise null.
export async function sendMarkedSheet(
  supabase: Supabase, sheetId: string, studentId: string, file: { id: string; name: string }, mark: number | null,
) {
  try {
    const info = await checkMarkedFile(supabase, studentId, file.id);
    await recordCorrection(supabase, sheetId, studentId, info, file.name);
  } catch (e) {
    console.error('sendMarkedSheet file failed:', e);
    return 'The marked sheet could not be sent. Try again.';
  }

  if (mark !== null) {
    const { error } = await supabase.from('homework_results').upsert(
      { sheet_id: sheetId, student_id: studentId, status: 'marked', mark, marked_on: todayInUk() },
      { onConflict: 'sheet_id,student_id' },
    );
    if (error) {
      console.error('sendMarkedSheet mark failed:', error.message);
      return 'The marked sheet was sent, but the mark could not be saved. Enter it on the homework page.';
    }
  }

  const { data: draft } = await supabase.from('homework_markups').select('draft_file_id')
    .eq('sheet_id', sheetId).eq('student_id', studentId).maybeSingle();
  if (draft?.draft_file_id) {
    await supabase.from('homework_markups')
      .update({ draft_file_id: null, draft_name: null, draft_mark: null, draft_saved_at: null })
      .eq('sheet_id', sheetId).eq('student_id', studentId);
    if (draft.draft_file_id !== file.id) await trashFile(draft.draft_file_id).catch((e) => console.error('trash draft failed:', e));
  }
  return null;
}
