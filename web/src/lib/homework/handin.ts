import 'server-only';
import { findOrCreateFolder, uploadFile } from '@/lib/google/drive';

// Shared by the WhatsApp hand-in link (/h/<code>) and the student login (/me/homework).

// Accepted file types: photos, PDF and Word.
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
// Some phones send Word files without a type, so it is worked out from the file name instead.
const BY_EXTENSION = Object.fromEntries(Object.entries(TYPES).map(([type, ext]) => [ext, type]));
export const MAX_BYTES = 4 * 1024 * 1024; // Vercel accepts requests up to about 4.5 MB

export type HandInResult = { ok: true } | { ok: false; error: string };
export type HandInTarget = { title: string; subject: string; folder_id: string | null; files: number };
export type CheckedFile = { file: File; type: string; ext: string };

// Checks the uploaded file. Returns the file with its type, or a message for the family.
export function checkFile(file: FormDataEntryValue | null): CheckedFile | { error: string } {
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a photo, PDF or Word file.' };
  const kind = fileKind(file);
  if (!kind) return { error: 'Only photos (JPG, PNG, HEIC), PDF and Word files can be handed in.' };
  if (file.size > MAX_BYTES) return { error: `${file.name} is too big (4 MB max).` };
  return { file, ...kind };
}

// The file's type and extension if it is a photo, PDF or Word file, otherwise null.
export function fileKind(file: File) {
  const type = TYPES[file.type] ? file.type : BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''];
  return type && TYPES[type] ? { type, ext: TYPES[type] } : null;
}

// Checks the homework can take another file. Returns a message, or null if all is well.
export function targetProblem(target: HandInTarget | null, wrongHomework: string) {
  if (!target) return wrongHomework;
  if (!target.folder_id) return 'Your homework folder is not ready yet. Please tell Pencil Maths.';
  if (target.files >= 20) return 'This homework already has the maximum number of files.';
  return null;
}

// Uploads the file into the student's Drive Homework folder and returns what to record in the database.
// `chosenName` is the name the student typed when handing in (optional).
export async function uploadHandIn(target: HandInTarget, { file, type, ext }: CheckedFile, part: number, chosenName?: string, parts = 1) {
  const homework = await findOrCreateFolder('Homework', target.folder_id!);
  // e.g. "2026-10-11 14.05 Maths - Practice sheet 1 (2).jpg", or "2026-10-11 14.05 My fractions answers.pdf"
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/London' }).slice(0, 16).replace(':', '.');
  const clean = cleanName(chosenName);
  const name = clean
    ? `${stamp} ${clean}${parts > 1 ? ` (${part})` : ''}.${ext}`
    : `${stamp} ${target.subject} - ${target.title} (${part}).${ext}`;
  const uploaded = await uploadFile(homework.id, name, type, await file.arrayBuffer());
  return { p_file_id: uploaded.id, p_url: uploaded.webViewLink, p_label: name };
}

// A typed file name made safe: no characters Drive or Windows dislike, at most 80 characters.
export function cleanName(name: string | undefined | null) {
  return (name ?? '').replace(/\.(pdf|jpe?g|png|docx?)$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}
