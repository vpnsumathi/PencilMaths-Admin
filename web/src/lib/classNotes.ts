import 'server-only';
import { findOrCreateFolder } from '@/lib/google/drive';

// Class notes and documents on the batch page, shown to the batch's students in /me/notes.
// Files go to Google Drive: PencilMaths / Class notes / <batch code>. See Help/22-class-notes.md and
// supabase/migrations/20261111000002_class_notes.sql.

export const NOTES_NOT_READY = 'The database is not ready for this yet: run 20261111000002_class_notes.sql in Supabase first.';

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

// The class_notes table is not there yet: the database script has not been run on this Supabase project.
export function notesTableMissing(error: { code?: string } | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST200';
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
