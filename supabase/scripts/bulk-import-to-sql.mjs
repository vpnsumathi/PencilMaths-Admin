// Bulk import without the portal: turns the students spreadsheet into a SQL file to run in the Supabase SQL Editor.
//
//   node supabase/scripts/bulk-import-to-sql.mjs "C:\path\Student_Batches_By_Year.xlsx"
//
// It writes "<spreadsheet name>.import.sql" next to the spreadsheet. Open it, copy everything into the SQL Editor
// of the right project (Staging first!) and Run. As written it only CHECKS: it saves nothing and shows what would happen.
// When the result looks right, change the last `true` to `false` and Run again to import.
// Needs 20261102000001_bulk_import.sql in that database first. Nothing to install: plain Node.js.
//
// Same columns as Settings › Bulk import in the portal: Year, Batch, Student Name, Teacher Name, Batch Time (+ optional Subject).
// The portal page is the easier way and also makes each new student's Google Drive folder; after this script, open each
// new student and press "Create Drive folder".

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { basename } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node supabase/scripts/bulk-import-to-sql.mjs <spreadsheet.xlsx or .csv>');
  process.exit(1);
}

// ---- .xlsx reader (an .xlsx file is a zip of XML files); same approach as web/src/lib/lessons/xlsx.ts ----
function unzip(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Not an .xlsx file');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const skip = nameLength + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    files.set(name, () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    });
    p += 46 + skip;
  }
  return files;
}
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m);
const texts = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const column = (ref) => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function readXlsx(buf) {
  const files = unzip(buf);
  const read = (name) => files.get(name)?.() ?? '';
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const targets = new Map([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  return [...read('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const target = targets.get(attr(m[0], 'r:id')) ?? '';
    const rows = [];
    for (const row of read(target.startsWith('/') ? target.slice(1) : `xl/${target}`).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
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
    return { name: decode(attr(m[0], 'name') ?? ''), rows };
  });
}

// ---- .csv reader (quoted cells may hold commas and line breaks) ----
function readCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows;
}

// ---- Columns by heading (same rules as web/src/lib/import/rows.ts) ----
const HEADINGS = {
  year: /^(school )?year( group)?$/,
  batch: /^batch( name| no\.?| number)?$/,
  student: /^(student|student name|student's name|name)$/,
  teacher: /^(teacher|teacher name|teacher's name|tutor)$/,
  time: /^((batch|class) )?(time|times|timing|timings|schedule)$/,
  subject: /^subject$/,
};
const REQUIRED = ['year', 'batch', 'student', 'teacher', 'time'];

const buf = readFileSync(file);
const sheets = /\.csv$/i.test(file) ? [{ name: basename(file), rows: readCsv(buf.toString('utf8').replace(/^\uFEFF/, '')) }] : readXlsx(buf);
let result = null;
for (const sheet of sheets) {
  for (let at = 0; at < Math.min(10, sheet.rows.length) && !result; at++) {
    const cols = {};
    sheet.rows[at].forEach((cell, i) => {
      const h = cell.toLowerCase().replace(/\s+/g, ' ').trim();
      for (const f of Object.keys(HEADINGS)) if (cols[f] === undefined && HEADINGS[f].test(h)) { cols[f] = i; break; }
    });
    if (REQUIRED.every((f) => cols[f] !== undefined)) {
      const get = (cells, f) => (cols[f] === undefined ? '' : (cells[cols[f]] ?? '').trim());
      const rows = sheet.rows.slice(at + 1).map((cells, i) => ({
        row: at + i + 2, year: get(cells, 'year'), batch: get(cells, 'batch'), student: get(cells, 'student'),
        teacher: get(cells, 'teacher'), time: get(cells, 'time'), subject: get(cells, 'subject'),
      })).filter((r) => r.year || r.batch || r.student || r.teacher || r.time);
      result = { sheet: sheet.name, rows };
    }
  }
  if (result) break;
}
if (!result || result.rows.length === 0) {
  console.error('No student rows found. The first row needs the headings: Year, Batch, Student Name, Teacher Name, Batch Time.');
  process.exit(1);
}

const json = JSON.stringify(result.rows, null, 1);
if (json.includes('$rows$')) throw new Error('The spreadsheet contains the text $rows$, which this script cannot quote.');
const out = file.replace(/\.(xlsx|csv)$/i, '') + '.import.sql';
writeFileSync(out, `-- Bulk import of "${basename(file)}" (sheet "${result.sheet}", ${result.rows.length} students), made ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.
-- Run in the Supabase SQL Editor. Check you are in the right project (Staging or Production) first.
-- As written it only CHECKS and saves nothing: read "errors" (must be empty), "batches" and "students" in the result.
-- To import, change the last \`true\` below to \`false\` and Run again. Running it again later adds nothing twice.
-- New students have no Google Drive folder yet: open each one in the portal and press "Create Drive folder".
select jsonb_pretty(bulk_import($rows$${json}$rows$::jsonb, true));
`);
console.log(`${result.rows.length} students read from sheet "${result.sheet}".`);
console.log(`Wrote ${out}`);
console.log('Paste it into the Supabase SQL Editor (Staging first). It only checks until you change the last true to false.');
