// Runs in the browser: combines photos, PDFs and Word files into one PDF for a homework hand-in.
// pdf-lib is loaded only when a student presses Hand in, so pages stay light.

// Uploads go through Vercel, which takes about 4.5 MB per request. A hand-in bigger than this
// (many pages) is split into more than one PDF.
const LIMIT = 3.8 * 1024 * 1024;
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 18;

export function isWord(file: File) {
  return /\.(docx?|DOCX?)$/.test(file.name) || file.type.includes('word');
}

// Shrinks a photo to at most 1600px as a JPEG (usually 200–500 KB a page).
async function photoToJpeg(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} could not be read. Please take the photo again, or choose a JPG or PNG.`);
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs get a white page, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75));
  if (!blob) throw new Error(`${file.name} could not be read.`);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

// Returns one PDF (or a few, for very long hand-ins) holding every file in order, one photo per page.
// convertWord turns a Word file into PDF bytes (done on the server, through Google Drive).
export async function buildPdfs(
  files: File[],
  convertWord: (file: File) => Promise<Uint8Array>,
  onStep: (text: string) => void,
): Promise<File[]> {
  const { PDFDocument } = await import('pdf-lib');
  const out: File[] = [];
  let doc = await PDFDocument.create();
  let size = 0;

  const flush = async () => {
    if (doc.getPageCount() === 0) return;
    const data = await doc.save();
    out.push(new File([data as BlobPart], `homework-${out.length + 1}.pdf`, { type: 'application/pdf' }));
    doc = await PDFDocument.create();
    size = 0;
  };
  // Starts a new PDF first if this piece would push the current one over the upload limit.
  const makeRoom = async (bytes: number, name: string) => {
    if (bytes > LIMIT) throw new Error(`${name} is too big (about 4 MB max).`);
    if (size + bytes > LIMIT) await flush();
    size += bytes;
  };

  for (const [i, file] of files.entries()) {
    onStep(`Making PDF: ${i + 1} of ${files.length}…`);
    if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
      const photo = await photoToJpeg(file);
      await makeRoom(photo.bytes.length, file.name);
      const image = await doc.embedJpg(photo.bytes);
      const [w, h] = photo.width > photo.height ? [A4[1], A4[0]] : A4; // landscape photo, landscape page
      const scale = Math.min((w - 2 * MARGIN) / photo.width, (h - 2 * MARGIN) / photo.height);
      const page = doc.addPage([w, h]);
      const [dw, dh] = [photo.width * scale, photo.height * scale];
      page.drawImage(image, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh });
    } else {
      const bytes = isWord(file) ? await convertWord(file) : new Uint8Array(await file.arrayBuffer());
      await makeRoom(bytes.length, file.name);
      let source;
      try {
        source = await PDFDocument.load(bytes, { ignoreEncryption: true });
      } catch {
        throw new Error(`${file.name} could not be opened. Please choose a photo, PDF or Word file.`);
      }
      const pages = await doc.copyPages(source, source.getPageIndices());
      pages.forEach((p) => doc.addPage(p));
    }
  }
  await flush();
  return out;
}
