import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { planClasses, trackLessons, type SavedClass, type ViewLesson } from './tracker.ts';
import { DATE_FORMAT, trackerWorkbook, type ExcelLesson } from './trackerExcel.ts';

// Reads the workbook back from the zip itself, not with the library that wrote it.
const excelSerial = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000 + 25569;

describe('Lesson Tracker Excel export', async () => {
  const plan: ViewLesson[] = [
    { id: 'a', term: 1, classNo: 1, active: true, completedOn: '2026-11-16' },
    { id: 'b', term: 1, classNo: 1, active: true, completedOn: null },
    { id: 'c', term: 1, classNo: null, active: true, completedOn: null },
    { id: 'd', term: 2, classNo: 1, active: true, completedOn: null },
  ];
  const planned = planClasses(plan.map((l) => ({ term: l.term, classNo: l.classNo, done: false })), '2026-11-16', [1, 4]);
  const saved: SavedClass[] = planned.classes.map((c) => ({
    term: c.term, classNo: c.classNo, state: c.state, plannedOn: c.plannedOn,
    lessonIds: plan.filter((l) => l.term === c.term && l.classNo === c.classNo).map((l) => l.id),
  }));
  const { byLesson, summary } = trackLessons(plan, saved, '2026-11-20');
  const lessons: ExcelLesson[] = plan.map((l, i) => ({
    term: l.term, module: 'Number', code: `L${i + 1}`, name: `Lesson ${i + 1}`, class_no: l.classNo, active: true,
    homework: i === 0 ? ['H1', '', 'H3'] : ['', '', ''], status: l.completedOn ? 'Completed' : 'Not started',
    completedOn: l.completedOn, track: byLesson.get(l.id)!,
  }));
  const file = await trackerWorkbook({
    heading: 'TB-1 · Maths · Year 5', lessons, summary, today: '2026-11-20',
    tracker: { startOn: '2026-11-16', weekdays: [1, 4], scope: 'whole_year', setAt: '2026-11-16T09:00:00Z', setBy: 'Admin' },
  });
  const zip = unzipSync(new Uint8Array(file));
  const xml = (name: string) => strFromU8(zip[name]);

  it('has a Summary sheet and one sheet per term, in order', () => {
    const names = [...xml('xl/workbook.xml').matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(names, ['Summary', 'Term 1', 'Term 2']);
  });

  it('stores planned and completed dates as real Excel dates with the app format', () => {
    const term1 = xml('xl/worksheets/sheet2.xml');
    // Class 1 of Term 1 is on Mon 16 Nov 2026; both lessons with Class 1 share it. Term 2 Class 1 follows on Thu 19 Nov.
    assert.equal([...term1.matchAll(new RegExp(`<v>${excelSerial('2026-11-16')}</v>`, 'g'))].length, 3); // 2 planned + 1 completed
    assert.match(xml('xl/worksheets/sheet3.xml'), new RegExp(`<v>${excelSerial('2026-11-19')}</v>`));
    assert.ok(xml('xl/styles.xml').includes(`formatCode="${DATE_FORMAT}"`));
  });

  it('keeps the template columns and text', () => {
    const strings = xml('xl/sharedStrings.xml');
    for (const text of ['Module', 'Lesson Code', 'Hw - 1', 'Hw - 3', 'Class No.', 'Planned date', 'Class 1', 'H1', 'H3', 'On time'])
      assert.ok(strings.includes(`>${text}<`), `missing "${text}"`);
    assert.ok(xml('xl/worksheets/sheet2.xml').includes('<pane'), 'header rows stay in view when scrolling');
  });

  it('colours completed-on-time lessons green', () => {
    assert.match(xml('xl/styles.xml'), /DCFCE7/i);
  });
});
