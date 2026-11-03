import 'server-only';
import { readXlsx, type Sheet } from '@/lib/lessons/xlsx';

// Reads a Bulk import spreadsheet (.xlsx or .csv) into rows for the database function bulk_import.
// Columns are found by their heading, in any order (the sample file: Year, Batch, Student Name, Teacher Name, Batch Time).
// Subject is optional (Maths when there is no Subject column or the cell is empty).

export type ImportRow = { row: number; year: string; batch: string; student: string; teacher: string; time: string; subject: string };
type Field = Exclude<keyof ImportRow, 'row'>;

export const MAX_ROWS = 1000;

const HEADINGS: Record<Field, RegExp> = {
  year: /^(school )?year( group)?$/,
  batch: /^batch( name| no\.?| number)?$/,
  student: /^(student|student name|student's name|name)$/,
  teacher: /^(teacher|teacher name|teacher's name|tutor)$/,
  time: /^((batch|class) )?(time|times|timing|timings|schedule)$/,
  subject: /^subject$/,
};
const REQUIRED: Field[] = ['year', 'batch', 'student', 'teacher', 'time'];
const LABEL: Record<Field, string> = { year: 'Year', batch: 'Batch', student: 'Student Name', teacher: 'Teacher Name', time: 'Batch Time', subject: 'Subject' };

const clean = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// Splits CSV text into rows, allowing "quoted, cells" and line breaks inside quotes.
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
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

// The heading row (within the first 10 rows) and which column holds each field, or the fields that are missing.
function findColumns(sheet: Sheet) {
  let best: { at: number; columns: Partial<Record<Field, number>> } | null = null;
  for (let at = 0; at < Math.min(10, sheet.rows.length); at++) {
    const columns: Partial<Record<Field, number>> = {};
    sheet.rows[at].forEach((cell, i) => {
      const heading = clean(cell);
      for (const field of Object.keys(HEADINGS) as Field[]) {
        if (columns[field] === undefined && HEADINGS[field].test(heading)) { columns[field] = i; break; }
      }
    });
    if (!best || Object.keys(columns).length > Object.keys(best.columns).length) best = { at, columns };
  }
  return best;
}

export function readImportFile(name: string, data: ArrayBuffer): { rows: ImportRow[]; sheet: string } | { error: string } {
  let sheets: Sheet[];
  try {
    sheets = /\.csv$/i.test(name)
      ? [{ name, rows: readCsv(new TextDecoder().decode(data).replace(/^﻿/, '')) }]
      : readXlsx(data);
  } catch (e) {
    console.error('readImportFile failed:', e);
    return { error: 'Could not read that file. Save it from Excel as .xlsx (or .csv) and try again.' };
  }

  // The first sheet that has all the columns.
  let missing: Field[] = REQUIRED;
  for (const sheet of sheets) {
    const found = findColumns(sheet);
    if (!found) continue;
    const lacking = REQUIRED.filter((f) => found.columns[f] === undefined);
    if (lacking.length < missing.length) missing = lacking;
    if (lacking.length) continue;

    const cell = (cells: string[], f: Field) => (found.columns[f] === undefined ? '' : (cells[found.columns[f]!] ?? '').trim());
    const rows = sheet.rows.slice(found.at + 1).map((cells, i) => ({
      row: found.at + i + 2, // the spreadsheet's own row number
      year: cell(cells, 'year'),
      batch: cell(cells, 'batch'),
      student: cell(cells, 'student'),
      teacher: cell(cells, 'teacher'),
      time: cell(cells, 'time'),
      subject: cell(cells, 'subject'),
    })).filter((r) => r.year || r.batch || r.student || r.teacher || r.time);

    if (rows.length === 0) return { error: `The sheet "${sheet.name}" has headings but no student rows.` };
    if (rows.length > MAX_ROWS) return { error: `The file has ${rows.length} rows. Import at most ${MAX_ROWS} at a time.` };
    return { rows, sheet: sheet.name };
  }
  return { error: `The file needs these column headings: ${missing.map((f) => `"${LABEL[f]}"`).join(', ')} (first row of the sheet).` };
}
