'use server';

import { revalidatePath } from 'next/cache';
import {
  batchNotesFolder, cleanFileName, NOTE_MAX_BYTES, NOTE_MAX_MB, noteFileType, NOTES_NOT_READY, notesTableMissing, readTopic,
  studentNotesFolder,
} from '@/lib/classNotes';
import { getViewer, requireStaffOrTeacher } from '@/lib/auth';
import { redirectWith, text } from '@/lib/form';
import { fileInfo, startBrowserUpload, trashFile, uploadFile } from '@/lib/google/drive';
import { MAX_BYTES } from '@/lib/homework/handin';
import { UUID } from '@/lib/options';
import { siteUrl } from '@/lib/siteUrl';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// Class notes and documents, from the batch page (ClassNotesSection) and the student page (StudentNotesCard).
// Adding one with a file takes three steps, like marking a sheet (see mark/actions.ts):
// 1. startNoteUpload checks the file and gets a Google Drive upload address in the note's folder;
// 2. the browser sends the file straight to Drive (big files are fine);
// 3. saveClassNote checks the file really arrived in that folder and saves the note.
// If the browser can't reach Drive directly, uploadNoteViaServer is the fallback (4 MB max).
// Staff and the batch's own teacher only: the database rules decide which batches and students a teacher may use.

export type Step<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// Who a note is for: a batch (batchId) and, optionally, some of its students (studentIds; none = the whole
// batch). No batch = a personal note for the chosen students (staff only).
export type NoteTarget = { batchId: string | null; studentIds: string[] };

// Checks this login may add a note for the target, and works out its Drive folder:
// one student = that student's own folder; otherwise the batch's Class notes folder.
async function loadTarget(target: NoteTarget) {
  const batchId = target.batchId || null;
  const studentIds = [...new Set(target.studentIds ?? [])];
  if (batchId && !UUID.test(batchId)) return { error: 'Batch not found.' } as const;
  if (!studentIds.every((s) => UUID.test(s))) return { error: 'Student not found.' } as const;
  if (!batchId && studentIds.length === 0) return { error: 'Choose who the note is for.' } as const;

  const supabase = await createClient();
  const [viewer, { data: batch }, { data: students }] = await Promise.all([
    getViewer(),
    batchId ? supabase.from('batches').select('id, code').eq('id', batchId).maybeSingle() : Promise.resolve({ data: null }),
    // A teacher only gets their own students back (database rules), so anyone else counts as not found.
    studentIds.length ? supabase.from('students').select('id').in('id', studentIds) : Promise.resolve({ data: [] }),
  ]);
  if (!viewer) return { error: 'Only staff and teachers can add class notes. Sign in again.' } as const;
  if (batchId && !batch) return { error: 'Batch not found.' } as const;
  if (!batchId && viewer.kind !== 'staff') return { error: 'Choose one of your classes for the note.' } as const;
  if ((students ?? []).length !== studentIds.length) return { error: 'Student not found.' } as const;

  const folder = async () => {
    if (studentIds.length === 1) {
      // Teachers can't read or add student folders, so after the checks above the server does it for them.
      return studentNotesFolder(studentIds[0], viewer.kind === 'staff' ? supabase : createAdminClient());
    }
    return batchNotesFolder(batch!.code);
  };
  return { supabase, batchId, studentIds, folder } as const;
}

function checkFile(name: string, size: number) {
  if (!noteFileType(name)) return 'That kind of file can\'t be added. Use a PDF, Word, PowerPoint or Excel file, or a photo.';
  if (!(size > 0)) return 'The file is empty.';
  if (size > NOTE_MAX_BYTES) return `The file is too big (${NOTE_MAX_MB} MB max). Put it in Google Drive and paste its link instead.`;
  return null;
}

export async function startNoteUpload(target: NoteTarget, file: { name: string; size: number }): Promise<Step<{ uploadUrl: string; name: string; type: string }>> {
  const problem = checkFile(file.name, file.size);
  if (problem) return { ok: false, error: problem };
  const found = await loadTarget(target);
  if ('error' in found) return { ok: false, error: found.error! };
  try {
    const folder = await found.folder();
    const name = cleanFileName(file.name);
    const type = noteFileType(name)!;
    const uploadUrl = await startBrowserUpload(folder.id, name, type, file.size, await siteUrl());
    return { ok: true, uploadUrl, name, type };
  } catch (e) {
    console.error('startNoteUpload failed:', e);
    return { ok: false, error: 'Could not reach Google Drive. Try again in a moment.' };
  }
}

// Fallback when the browser can't send to Drive itself: the file comes through our server instead.
export async function uploadNoteViaServer(target: NoteTarget, form: FormData): Promise<Step<{ driveFileId: string; name: string }>> {
  const file = form.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Choose a file.' };
  const problem = checkFile(file.name, file.size);
  if (problem) return { ok: false, error: problem };
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'Google Drive could not be reached from this browser, and the file is too big to send another way (4 MB max). Try again, or paste a Drive link instead.' };
  }
  const found = await loadTarget(target);
  if ('error' in found) return { ok: false, error: found.error! };
  try {
    const folder = await found.folder();
    const name = cleanFileName(file.name);
    const uploaded = await uploadFile(folder.id, name, noteFileType(name)!, await file.arrayBuffer());
    return { ok: true, driveFileId: uploaded.id, name };
  } catch (e) {
    console.error('uploadNoteViaServer failed:', e);
    return { ok: false, error: 'Could not upload the file to Google Drive.' };
  }
}

export type NoteFields = {
  title: string; body: string; topic: string; link: string;
  // The file the browser already uploaded (steps 1 and 2), if any.
  driveFileId?: string; fileName?: string;
};

export async function saveClassNote(target: NoteTarget, fields: NoteFields): Promise<Step<{ message: string }>> {
  const title = fields.title.replace(/\s+/g, ' ').trim();
  const body = fields.body.trim();
  const link = fields.link.trim();
  const topic = readTopic(fields.topic);
  const driveFileId = fields.driveFileId ?? '';

  const found = await loadTarget(target);
  if ('error' in found) return { ok: false, error: found.error! };

  // The browser says where it uploaded the file: check it really is in this note's folder first.
  // Only a file that passed this check is ever put in the Drive bin below.
  let uploaded: { id: string; webViewLink: string } | null = null;
  if (driveFileId) {
    try {
      if (!/^[\w-]{10,}$/.test(driveFileId)) throw new Error('not a Drive file id');
      const [folder, info] = await Promise.all([found.folder(), fileInfo(driveFileId)]);
      if (info.trashed || !info.parents?.includes(folder.id)) throw new Error('uploaded file is not in the note\'s folder');
      uploaded = info;
    } catch (e) {
      console.error('saveClassNote file check failed:', e);
      return { ok: false, error: 'The file could not be found in Google Drive. Try adding it again.' };
    }
  }
  // Nothing is saved, so the file just uploaded goes to the Drive bin instead of being left behind.
  const fail = async (error: string) => {
    if (uploaded) await trashFile(uploaded.id).catch((e) => console.error('saveClassNote: could not bin upload:', e));
    return { ok: false, error } as const;
  };

  if (!title) return fail('Give the note a title.');
  if (title.length > 200) return fail('The title is too long (200 characters max).');
  if (body.length > 5000) return fail('The note text is too long (5,000 characters max).');
  if (!topic) return fail('Choose the topic again.');
  if (!found.batchId && (topic.topic_id || topic.lesson_id)) return fail('A note that is not for a class can\'t have a topic.');
  if (link && !/^https?:\/\/\S+$/i.test(link)) return fail('The link must start with https://');
  if (link && uploaded) return fail('Add a file or a link, not both. Add the other as a second note.');
  if (!body && !link && !uploaded) return fail('Add some text, a file or a link.');

  const file = uploaded
    ? { p_provider: 'google_drive', p_external_id: uploaded.id, p_url: uploaded.webViewLink, p_file_name: cleanFileName(fields.fileName ?? 'Document') }
    : link ? { p_provider: 'external_link', p_external_id: null, p_url: link, p_file_name: null }
    : { p_provider: null, p_external_id: null, p_url: null, p_file_name: null };

  // The note and its students are saved together, or not at all (add_class_note).
  const { error } = await found.supabase.rpc('add_class_note', {
    p_batch: found.batchId, p_title: title, p_body: body || null, p_topic: topic.topic_id, p_lesson: topic.lesson_id,
    ...file, p_students: found.studentIds.length ? found.studentIds : null,
  });
  if (error) {
    console.error('saveClassNote failed:', error.message);
    // P0001: a message from the database meant for people (e.g. a student who is not in the batch).
    return fail(notesTableMissing(error) ? NOTES_NOT_READY : error.code === 'P0001' ? error.message : 'Could not save the note.');
  }

  if (found.batchId) revalidatePath(`/batches/${found.batchId}`);
  for (const s of found.studentIds) revalidatePath(`/students/${s}`);
  const who = found.studentIds.length === 0 ? 'Students in this batch'
    : found.studentIds.length === 1 ? 'The student' : `The ${found.studentIds.length} chosen students`;
  return { ok: true, message: `"${title}" added. ${who} can see it now under Class Notes/Documents.` };
}

// Removes a note, from the batch page or a student page (`back`). Its uploaded file stays in Google Drive.
export async function removeClassNote(form: FormData) {
  const noteId = text(form, 'note_id');
  const back = text(form, 'back');
  // Only back to a batch or student page of this app.
  const path = /^\/(batches|students)\/[0-9a-f-]{36}$/i.test(back) ? back : '/batches';
  if (!UUID.test(noteId)) redirectWith(path, 'error', 'Note not found.');

  await requireStaffOrTeacher();
  const supabase = await createClient();
  // .select('id') returns the removed row: none means the database rules said no (or it was already gone).
  const { data, error } = await supabase.from('class_notes').delete().eq('id', noteId).select('id, batch_id');
  if (error || data.length === 0) {
    console.error('removeClassNote failed:', error?.message ?? 'no rows deleted');
    redirectWith(path, 'error', 'Could not remove the note.');
  }
  revalidatePath(path);
  if (data[0].batch_id) revalidatePath(`/batches/${data[0].batch_id}`);
  redirectWith(path, 'ok', 'Note removed. Students no longer see it. An uploaded file is still in Google Drive.');
}
