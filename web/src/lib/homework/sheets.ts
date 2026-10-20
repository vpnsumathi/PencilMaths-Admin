import 'server-only';
import { findOrCreateFolder, uploadFile } from '@/lib/google/drive';
import { createClient } from '@/lib/supabase/server';
import { fileKind, MAX_BYTES } from './handin';

// The homework sheet itself (the worksheet students work from), attached by staff.
// Stored as file_links rows: owner_type 'homework_sheet', owner_id = the homework id.

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Reads the optional "sheet_file" upload and "sheet_url" link from a form and attaches them.
// Returns a message if something was wrong, or null when all went well (or nothing was given).
// With blankTitle, a homework given neither gets a blank one-page PDF with just that title
// (a stand-in until topic homework templates are built).
export async function attachSheetFiles(
  supabase: Supabase, sheetId: string, form: FormData, blankTitle?: string,
): Promise<string | null> {
  let file = form.get('sheet_file');
  const url = String(form.get('sheet_url') ?? '').trim();
  if (blankTitle && !url && !(file instanceof File && file.size > 0)) file = await blankPdf(blankTitle);

  if (file instanceof File && file.size > 0) {
    const kind = fileKind(file);
    if (!kind) return 'The homework file must be a PDF, Word file or photo.';
    if (file.size > MAX_BYTES) return `${file.name} is too big (4 MB max). Upload it to Google Drive and paste its link instead.`;
    try {
      const root = await findOrCreateFolder('PencilMaths');
      const folder = await findOrCreateFolder('Homework sheets', root.id);
      const uploaded = await uploadFile(folder.id, file.name, kind.type, await file.arrayBuffer());
      const { error } = await supabase.from('file_links').insert({
        owner_type: 'homework_sheet', owner_id: sheetId, provider: 'google_drive',
        external_id: uploaded.id, url: uploaded.webViewLink, label: file.name,
      });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error('attachSheetFiles upload failed:', e);
      return 'Could not upload the homework file to Google Drive.';
    }
  }

  if (url) {
    if (!/^https?:\/\/\S+$/i.test(url)) return 'The homework link must start with https://';
    const { error } = await supabase.from('file_links').insert({
      owner_type: 'homework_sheet', owner_id: sheetId, provider: 'external_link', url, label: 'Homework link',
    });
    if (error) {
      console.error('attachSheetFiles link failed:', error.message);
      return 'Could not save the homework link.';
    }
  }
  return null;
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
