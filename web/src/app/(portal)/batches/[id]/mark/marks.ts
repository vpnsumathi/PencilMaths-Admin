import { degrees, LineCapStyle, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// The teacher's marks on a handed-in sheet. Positions are fractions of the page as shown (0 = left/top,
// 1 = right/bottom); widths and sizes are fractions of the page width. So the same marks draw on screen
// at any size, and are written into the PDF at the same place.
type Line = { p: number; c: string; w: number; pts: number[] }; // pts = [x1, y1, x2, y2, ...]
type Shape = { p: number; c: string; s: number; x: number; y: number };
export type Mark =
  | ({ t: 'pen' } & Line) | ({ t: 'hl' } & Line)
  | ({ t: 'text'; text: string } & Shape)
  | ({ t: 'tick' } & Shape) | ({ t: 'cross' } & Shape);
export type Drawings = { v: 1; marks: Mark[] };

export const HIGHLIGHT = '#facc15';
const HIGHLIGHT_OPACITY = 0.35;

// Ticks and crosses as lines, centred on (0, 0), one unit across.
const SHAPES: Record<'tick' | 'cross', number[][]> = {
  tick: [[-0.45, 0.02, -0.12, 0.38, 0.5, -0.45]],
  cross: [[-0.4, -0.4, 0.4, 0.4], [-0.4, 0.4, 0.4, -0.4]],
};

function shapeLines(m: Extract<Mark, { t: 'tick' | 'cross' }>, w: number, h: number) {
  return SHAPES[m.t].map((line) => line.map((v, i) => (i % 2 === 0 ? m.x * w + v * m.s * w : m.y * h + v * m.s * w)));
}

// Draws one page's marks on the see-through layer over the page (w × h canvas pixels).
export function drawMarks(ctx: CanvasRenderingContext2D, marks: Mark[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const m of marks) {
    ctx.globalAlpha = m.t === 'hl' ? HIGHLIGHT_OPACITY : 1;
    ctx.strokeStyle = m.c;
    ctx.fillStyle = m.c;
    if (m.t === 'pen' || m.t === 'hl') {
      ctx.lineWidth = m.w * w;
      ctx.beginPath();
      ctx.moveTo(m.pts[0] * w, m.pts[1] * h);
      if (m.pts.length === 2) ctx.lineTo(m.pts[0] * w + 0.01, m.pts[1] * h); // a dot
      for (let i = 2; i < m.pts.length; i += 2) ctx.lineTo(m.pts[i] * w, m.pts[i + 1] * h);
      ctx.stroke();
    } else if (m.t === 'text') {
      ctx.font = `${m.s * w}px Helvetica, Arial, sans-serif`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(m.text, m.x * w, m.y * h + m.s * w * 0.85);
    } else {
      ctx.lineWidth = m.s * w * 0.12;
      for (const line of shapeLines(m, w, h)) {
        ctx.beginPath();
        ctx.moveTo(line[0], line[1]);
        for (let i = 2; i < line.length; i += 2) ctx.lineTo(line[i], line[i + 1]);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

// The mark under a point (for the eraser), searching from the top-most. Returns its index or -1.
export function markAt(marks: Mark[], page: number, x: number, y: number, aspect: number) {
  const near = 0.015;
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    if (m.p !== page) continue;
    if (m.t === 'pen' || m.t === 'hl') {
      for (let j = 0; j < m.pts.length; j += 2) {
        const x1 = m.pts[j], y1 = m.pts[j + 1];
        const x2 = m.pts[j + 2] ?? x1, y2 = m.pts[j + 3] ?? y1;
        if (segmentDistance(x, y * aspect, x1, y1 * aspect, x2, y2 * aspect) < near + m.w / 2) return i;
      }
    } else if (m.t === 'text') {
      const width = m.text.length * m.s * 0.55;
      if (x >= m.x - near && x <= m.x + width + near && y * aspect >= m.y * aspect - near && y * aspect <= m.y * aspect + m.s + near) return i;
    } else if (Math.hypot(x - m.x, (y - m.y) * aspect) < m.s * 0.6) {
      return i;
    }
  }
  return -1;
}

function segmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// One page as shown on screen at scale 1 (pdf.js "viewport"): its size, and how to turn a point on
// screen into a point in the PDF. This handles pages that are turned sideways.
export type PageView = { width: number; height: number; toPdf: (x: number, y: number) => number[] };

function hexColour(c: string) {
  const n = parseInt(c.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Helvetica only has Western European letters; anything else is shown as "?".
function writable(text: string) {
  return text.replace(/[^\x20-\x7E\xA0-\xFF€–—‘’“”]/g, '?');
}

// Writes the marks into a copy of the original PDF. The marks become part of the page (like ink),
// and stay sharp at any zoom because they are lines, not pictures.
export async function markedPdf(original: ArrayBuffer, marks: Mark[], views: PageView[]) {
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  for (const m of marks) {
    const page = pages[m.p];
    const view = views[m.p];
    if (!page || !view) continue;
    const { width: w, height: h, toPdf } = view;
    const path = (pts: number[]) => {
      let d = '';
      for (let i = 0; i < pts.length; i += 2) {
        const [x, y] = toPdf(pts[i], pts[i + 1]);
        d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${(-y).toFixed(2)} `; // drawSvgPath turns y upside down
      }
      if (pts.length === 2) { const [x, y] = toPdf(pts[0] + 0.01, pts[1]); d += `L${x.toFixed(2)} ${(-y).toFixed(2)}`; }
      return d;
    };
    const line = { x: 0, y: 0, borderColor: hexColour(m.c), borderLineCap: LineCapStyle.Round };

    if (m.t === 'pen' || m.t === 'hl') {
      const pts = m.pts.map((v, i) => (i % 2 === 0 ? v * w : v * h));
      page.drawSvgPath(path(pts), { ...line, borderWidth: m.w * w, borderOpacity: m.t === 'hl' ? HIGHLIGHT_OPACITY : 1 });
    } else if (m.t === 'text') {
      const size = m.s * w;
      const [x, y] = toPdf(m.x * w, m.y * h + size * 0.85);
      // The text runs left to right as seen on screen, even on a page that is turned.
      const [x0, y0] = toPdf(0, 0);
      const [x1, y1] = toPdf(1, 0);
      const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
      page.drawText(writable(m.text), { x, y, size, font, color: hexColour(m.c), rotate: degrees(angle) });
    } else {
      for (const pts of shapeLines(m, w, h)) page.drawSvgPath(path(pts), { ...line, borderWidth: m.s * w * 0.12 });
    }
  }
  return pdf.save();
}

// Hand-ins are usually one PDF, but older ones can be a photo. A photo becomes a one-page PDF to mark.
export async function asPdf(bytes: ArrayBuffer): Promise<ArrayBuffer | null> {
  const head = new Uint8Array(bytes.slice(0, 8));
  const starts = (...b: number[]) => b.every((v, i) => head[i] === v);
  if (starts(0x25, 0x50, 0x44, 0x46)) return bytes; // %PDF
  const isJpg = starts(0xff, 0xd8, 0xff);
  const isPng = starts(0x89, 0x50, 0x4e, 0x47);
  if (!isJpg && !isPng) return null;
  const pdf = await PDFDocument.create();
  const image = isJpg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  const width = 595; // A4 width in PDF units
  const height = (width * image.height) / image.width;
  pdf.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  const saved = await pdf.save();
  return saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;
}
