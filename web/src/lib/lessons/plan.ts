import type { Sheet } from './xlsx';

// Reads a "Term Lesson Plan - Year N" spreadsheet: one sheet per term ("Term 1", "Term 2", "Term 3"),
// each with a header row Module · Lesson Code · Lesson · Hw - 1 · Hw - 2 · Hw - 3 and one lesson per row.
// An optional "Class No." column ("Class 1", "Class 2" …) gives the class each lesson is taught in, for the
// Lesson Tracker. Lessons with the same Class No. are taught together; an empty cell means no class date.

export type PlanLesson = {
  term: number; module: string; code: string; name: string; position: number; homework: string[];
  class_no: number | null;
};

// "Class 1", "class 01", "1" → 1. Empty → null. Anything else → undefined (a problem).
export function parseClassNo(cell: string | undefined): number | null | undefined {
  const value = (cell ?? '').trim();
  if (!value) return null;
  const m = /^(?:class\s*(?:no\.?\s*)?)?0*(\d{1,3})$/i.exec(value);
  const n = m ? Number(m[1]) : NaN;
  return n > 0 ? n : undefined;
}

// Codes are saved without spaces and in capitals: "Y5 - T1L1" → "Y5-T1L1", "y5-a001" → "Y5-A001".
export const cleanCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function readTermPlan(sheets: Sheet[]): { lessons: PlanLesson[]; problems: string[]; warnings: string[] } {
  const lessons: PlanLesson[] = [];
  const problems: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const sheet of sheets) {
    const term = Number(sheet.name.match(/^\s*term\s*([123])\s*$/i)?.[1]);
    if (!term) continue; // other sheets are ignored

    const headerAt = sheet.rows.findIndex((r) => r.some((c) => norm(c) === 'lessoncode'));
    if (headerAt < 0) {
      problems.push(`${sheet.name}: no "Lesson Code" heading found.`);
      continue;
    }
    const header = sheet.rows[headerAt].map(norm);
    const col = {
      module: header.indexOf('module'),
      code: header.indexOf('lessoncode'),
      name: header.indexOf('lesson'),
      hw: [header.indexOf('hw1'), header.indexOf('hw2'), header.indexOf('hw3')],
      classNo: header.indexOf('classno'),
    };
    if (col.module < 0 || col.name < 0) {
      problems.push(`${sheet.name}: the Module and Lesson headings are needed.`);
      continue;
    }

    let position = 0;
    let lastClass = 0;
    const classNos = new Set<number>();
    sheet.rows.slice(headerAt + 1).forEach((row, i) => {
      const code = cleanCode(row[col.code] ?? '');
      const name = (row[col.name] ?? '').trim();
      const moduleName = (row[col.module] ?? '').trim();
      if (!code && !name) return; // blank row
      const line = `${sheet.name}, row ${headerAt + i + 2}`;
      if (!code || !name || !moduleName) return void problems.push(`${line}: needs a module, lesson code and lesson name.`);
      if (seen.has(code)) return void problems.push(`${line}: lesson code ${code} is used twice.`);
      const classNo = col.classNo >= 0 ? parseClassNo(row[col.classNo]) : null;
      if (classNo === undefined) return void problems.push(`${line}: Class No. must be a number like "Class 12" (or left empty).`);
      if (classNo != null) {
        if (classNo < lastClass) warnings.push(`${line}: Class ${classNo} comes after Class ${lastClass}.`);
        lastClass = Math.max(lastClass, classNo);
        classNos.add(classNo);
      }
      seen.add(code);
      position += 1;
      lessons.push({
        term, module: moduleName, code, name, position,
        homework: col.hw.map((c) => (c >= 0 ? cleanCode(row[c] ?? '') : '')),
        class_no: classNo,
      });
    });
    // Gaps (Class 3 missing between 2 and 4) are allowed, but are usually a typing mistake.
    const sorted = [...classNos].sort((a, b) => a - b);
    const gaps: string[] = [];
    sorted.forEach((n, i) => {
      const before = sorted[i - 1];
      if (i > 0 && n - before > 1) gaps.push(n - before === 2 ? `${before + 1}` : `${before + 1}–${n - 1}`);
    });
    if (gaps.length) warnings.push(`${sheet.name}: no lesson has Class ${gaps.slice(0, 5).join(', ')}.`);
  }
  if (lessons.length === 0 && problems.length === 0) problems.push('No sheets named "Term 1", "Term 2" or "Term 3" were found.');

  const hw = lessons.flatMap((l) => l.homework.filter(Boolean));
  const twice = [...new Set(hw.filter((c, i) => hw.indexOf(c) !== i))];
  if (twice.length) problems.push(`Homework codes used more than once: ${twice.slice(0, 10).join(', ')}.`);
  return { lessons, problems, warnings };
}
