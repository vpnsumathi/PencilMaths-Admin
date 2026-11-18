import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findOrCreateFolder } from '@/lib/google/drive';
import { ensureStudentDriveFolder } from '@/lib/students/driveFolder';

// Class notes and documents on the batch page and the student page, shown to students in /me/notes.
// A note is for the whole batch, for a few chosen students, or (staff only) a personal note for one student.
// Files go to Google Drive: PencilMaths / Class notes / <batch code>, or, for a note for one student, that
// student's own folder: PencilMaths / Students / <code name> / Class notes.
// See Help/22-class-notes.md, 20261111000002_class_notes.sql and 20261117000001_class_notes_for_students.sql.

export const NOTES_NOT_READY = 'The database is not ready for this yet: run 20261111000002_class_notes.sql and 20261117000001_class_notes_for_students.sql in Supabase first.';

// Files are sent straight from the browser to Drive, so they can be bigger than the 4 MB that goes through
// our server. 50 MB covers long slide decks.
export const NOTE_MAX_BYTES = 50 * 1024 * 1024;
export const NOTE_MAX_MB = 50;

// Accepted documents: PDF, Word, PowerPoint, Excel and photos.
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', gif: 'image/gif',
};

// The file's type, worked out from its name (some phones and computers send no type, or a vague one).
// null: not a kind of document we accept.
export function noteFileType(name: string) {
  return TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

// A file name made safe for Drive and Windows, keeping its extension; at most 120 characters.
export function cleanFileName(name: string) {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 120) return clean || 'Document';
  const dot = clean.lastIndexOf('.');
  const ext = dot > 0 ? clean.slice(dot) : '';
  return clean.slice(0, 120 - ext.length) + ext;
}

// PencilMaths / Class notes / <batch code>: made the first time, remembered after that (folderIds.ts).
export async function batchNotesFolder(batchCode: string) {
  const root = await findOrCreateFolder('PencilMaths');
  const notes = await findOrCreateFolder('Class notes', root.id);
  return findOrCreateFolder(batchCode.replace(/[\\/:*?"<>|]/g, '-'), notes.id);
}

// A student's own Class notes folder (PencilMaths / Students / <code name> / Class notes), made the first time.
// The student's folder is made too if they don't have one yet. `client` must be able to read and add the
// student's folder row: the staff login, or the full-rights connection after a teacher's access was checked.
export async function studentNotesFolder(studentId: string, client: SupabaseClient) {
  await ensureStudentDriveFolder(studentId, client);
  const { data } = await client
    .from('file_links').select('external_id')
    .eq('student_id', studentId).eq('owner_type', 'student_folder').eq('provider', 'google_drive')
    .maybeSingle();
  if (!data?.external_id) throw new Error('The student\'s Google Drive folder was not found.');
  return findOrCreateFolder('Class notes', data.external_id);
}

// The class notes scripts have not been run on this Supabase project yet (a table, column or function is missing).
export function notesTableMissing(error: { code?: string } | null) {
  return ['42P01', '42703', '42883', 'PGRST200', 'PGRST202', 'PGRST205'].includes(error?.code ?? '');
}

// What a note is for, as the form sends it: "topic:<id>" (curriculum topic), "lesson:<id>" (Lesson library)
// or "" (the whole class).
export function readTopic(value: string): { topic_id: string | null; lesson_id: string | null } | null {
  if (!value) return { topic_id: null, lesson_id: null };
  const [kind, id] = value.split(':');
  if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) return null;
  if (kind === 'topic') return { topic_id: id, lesson_id: null };
  if (kind === 'lesson') return { topic_id: null, lesson_id: id };
  return null;
}
