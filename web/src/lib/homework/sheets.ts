import 'server-only';
import { findOrCreateFolder, trashFile, uploadFile } from '@/lib/google/drive';
import { fileKind, MAX_BYTES } from './handin';

// The homework sheet itself (the worksheet students work from), attached by staff.
// Stored as file_links rows: owner_type 'homework_sheet', owner_id = the homework id.
// The upload to Google Drive happens first; the database then records the homework and its files in one go
// (set_homework, complete_topic), so a homework is never saved halfway.

// One file_links row to record, as the database functions expect it.
export type SheetFile = { provider: 'google_drive' | 'external_link'; external_id: string | null; url: string; label: string };
// files: what to record. uploaded: Drive files made now (put in the Drive bin if the save then fails).
// problem: a message if the file or link could not be used (the homework is still set without it).
export type PreparedSheets = { files: SheetFile[]; uploaded: string[]; problem: string | null };

// Reads the optional "sheet_file" upload and "sheet_url" link from a form, and uploads the file to Drive.
// Nothing is saved in the database here.
// With blankTitle, a homework given neither gets a blank one-page PDF with just that title
// (a stand-in until topic homework templates are built).
export async function prepareSheetFiles(form: FormData, blankTitle?: string): Promise<PreparedSheets> {
  const out: PreparedSheets = { files: [], uploaded: [], problem: null };
  let file = form.get('sheet_file');
  const url = String(form.get('sheet_url') ?? '').trim();
  if (blankTitle && !url && !(file instanceof File && file.size > 0)) file = await blankPdf(blankTitle);

  if (file instanceof File && file.size > 0) {
    const kind = fileKind(file);
    if (!kind) out.problem = 'The homework file must be a PDF, Word file or photo.';
    else if (file.size > MAX_BYTES) out.problem = `${file.name} is too big (4 MB max). Upload it to Google Drive and paste its link instead.`;
    else {
      try {
        const root = await findOrCreateFolder('PencilMaths');
        const folder = await findOrCreateFolder('Homework sheets', root.id);
        const uploaded = await uploadFile(folder.id, file.name, kind.type, await file.arrayBuffer());
        out.uploaded.push(uploaded.id);
        out.files.push({ provider: 'google_drive', external_id: uploaded.id, url: uploaded.webViewLink, label: file.name });
      } catch (e) {
        console.error('prepareSheetFiles upload failed:', e);
        out.problem = 'Could not upload the homework file to Google Drive.';
      }
    }
  }

  if (url) {
    if (!/^https?:\/\/\S+$/i.test(url)) out.problem ??= 'The homework link must start with https://';
    else out.files.push({ provider: 'external_link', external_id: null, url, label: 'Homework link' });
  }
  return out;
}

// The save failed after the upload: move the files just uploaded to the Drive bin, so nothing is left over.
export async function discardUploads(prepared: PreparedSheets) {
  await Promise.all(prepared.uploaded.map((id) => trashFile(id).catch((e) => console.error('discardUploads failed:', e))));
}

// A one-page A4 PDF with only the homework title at the top.
async function blankPdf(title: string) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  // The built-in font only has basic Latin letters, so anything else is left out.
  const safe = title.replace(/[^\x20-\x7E]/g, '').slice(0, 80);
  page.drawText(safe, { x: 48, y: 780, size: 18, font });
  const name = `${title.replace(/[\\/:*?"<>|]/g, '').trim() || 'Homework'}.pdf`;
  return new File([(await doc.save()) as BlobPart], name, { type: 'application/pdf' });
}
