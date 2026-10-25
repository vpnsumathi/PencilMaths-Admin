import type { Sheet } from './xlsx';

// Reads a "Term Lesson Plan - Year N" spreadsheet: one sheet per term ("Term 1", "Term 2", "Term 3"),
// each with a header row Module · Lesson Code · Lesson · Hw - 1 · Hw - 2 · Hw - 3 and one lesson per row.

export type PlanLesson = { term: number; module: string; code: string; name: string; position: number; homework: string[] };

// Codes are saved without spaces and in capitals: "Y5 - T1L1" → "Y5-T1L1", "y5-a001" → "Y5-A001".
export const cleanCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function readTermPlan(sheets: Sheet[]): { lessons: PlanLesson[]; problems: string[] } {
  const lessons: PlanLesson[] = [];
  const problems: string[] = [];
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
    };
    if (col.module < 0 || col.name < 0) {
      problems.push(`${sheet.name}: the Module and Lesson headings are needed.`);
      continue;
    }

    let position = 0;
    sheet.rows.slice(headerAt + 1).forEach((row, i) => {
      const code = cleanCode(row[col.code] ?? '');
      const name = (row[col.name] ?? '').trim();
      const moduleName = (row[col.module] ?? '').trim();
      if (!code && !name) return; // blank row
      const line = `${sheet.name}, row ${headerAt + i + 2}`;
      if (!code || !name || !moduleName) return void problems.push(`${line}: needs a module, lesson code and lesson name.`);
      if (seen.has(code)) return void problems.push(`${line}: lesson code ${code} is used twice.`);
      seen.add(code);
      position += 1;
      lessons.push({
        term, module: moduleName, code, name, position,
        homework: col.hw.map((c) => (c >= 0 ? cleanCode(row[c] ?? '') : '')),
      });
    });
  }
  if (lessons.length === 0 && problems.length === 0) problems.push('No sheets named "Term 1", "Term 2" or "Term 3" were found.');

  const hw = lessons.flatMap((l) => l.homework.filter(Boolean));
  const twice = [...new Set(hw.filter((c, i) => hw.indexOf(c) !== i))];
  if (twice.length) problems.push(`Homework codes used more than once: ${twice.slice(0, 10).join(', ')}.`);
  return { lessons, problems };
}
