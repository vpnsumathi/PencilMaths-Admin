import 'server-only';
import { inflateRawSync } from 'node:zlib';

// A small reader for .xlsx spreadsheets: returns each sheet's name and its cells as rows of text.
// An .xlsx file is a zip of XML files, so this unzips the few it needs and reads the cell values.
// Good enough for plain tables (no formulas are worked out; their last saved value is used).

export type Sheet = { name: string; rows: string[][] };

// Zip entries by name. Only "stored" (0) and "deflate" (8) are used by Excel.
function unzip(buf: Buffer) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Not an .xlsx file');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const files = new Map<string, () => string>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged .xlsx file');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const skip = nameLength + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    files.set(name, () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return data.toString('utf8');
      if (method === 8) return inflateRawSync(data).toString('utf8');
      throw new Error('Unsupported .xlsx compression');
    });
    p += 46 + skip;
  }
  return files;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m);
// All <t> texts inside a piece of XML, joined (rich text is split into several runs).
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

// "C12" → column index 2 (A = 0).
function column(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsx(data: ArrayBuffer): Sheet[] {
  const files = unzip(Buffer.from(data));
  const read = (name: string) => files.get(name)?.() ?? '';

  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const targets = new Map(
    [...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]),
  );

  return [...read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = decode(attr(m[0], 'name') ?? '');
    const target = targets.get(attr(m[0], 'r:id')) ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const rows: string[][] = [];
    for (const row of read(path).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], 'r');
        const type = attr(c[1], 't');
        const body = c[2] ?? '';
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const value = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? texts(body) : decode(v ?? '');
        cells[ref ? column(ref) : cells.length] = value.trim();
      }
      rows.push(Array.from(cells, (x) => x ?? ''));
    }
    return { name, rows };
  });
}
