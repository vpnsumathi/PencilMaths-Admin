// Unit tests for the Homework Tracker helpers (tracker.ts). Run: cd web && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellTitle, correctedAfter, defaultShow, filterRows, gridRows, hwDate, markText, monthOf, rates, rateTone,
  schoolYearChoices, schoolYearLabel, schoolYearOf, splitUpcoming, timing, upcomingLabel, waiting,
  type BatchSheet, type Cell, type StudentRow, type Upcoming,
} from './tracker.ts';

const row = (over: Partial<StudentRow>): StudentRow => ({
  sheet_id: 's', batch_id: 'b', title: 'Fractions', set_on: '2026-11-02', due_on: '2026-11-09', max_mark: 10,
  state: 'assigned', mark: null, received_on: null, marked_on: null, in_on: null, lesson_code: null, term: null,
  slot: null, hw_code: null, draft: false, sheets: [], handed: [], corrected: [], ...over,
});

const up = (over: Partial<Upcoming>): Upcoming => ({
  lesson_homework_id: 'lh', code: 'Y5-A001', slot: 1, lesson_code: 'Y5-T1L1', lesson: 'Place value', module: 'Number',
  term: 1, class_no: 1, planned_on: null, kind: 'upcoming', completed_on: null, behind: false, no_worksheet: false, ...over,
});

test('dates show as 16-Nov-2026 Mon', () => {
  assert.equal(hwDate('2026-11-16'), '16-Nov-2026 Mon');
  assert.equal(hwDate('2026-11-22'), '22-Nov-2026 Sun');
  assert.equal(hwDate(null), '—');
  assert.equal(monthOf('2026-11-16'), 'November 2026');
});

test('on time or late compared with the due date', () => {
  assert.deepEqual(timing('2026-11-09', '2026-11-09'), { label: 'On time', late: false });
  assert.deepEqual(timing('2026-11-11', '2026-11-09'), { label: 'Late by 2 days', late: true });
  assert.deepEqual(timing('2026-11-10', '2026-11-09'), { label: 'Late by 1 day', late: true });
  assert.equal(timing(null, '2026-11-09'), null);
  assert.equal(timing('2026-11-09', null), null, 'No due date: neither on time nor late');
});

test('how long something has waited', () => {
  assert.equal(waiting(row({ state: 'overdue', due_on: '2026-11-09' }), '2026-11-12'), '3 days overdue');
  assert.equal(waiting(row({ state: 'submitted', received_on: '2026-11-12' }), '2026-11-12'), 'waiting since today');
  assert.equal(waiting(row({ state: 'submitted', received_on: '2026-11-11' }), '2026-11-12'), 'waiting 1 day');
  assert.equal(waiting(row({ state: 'assigned' }), '2026-11-12'), null);
  assert.equal(correctedAfter('2026-11-10', '2026-11-13'), 'after 3 days');
  assert.equal(correctedAfter('2026-11-10', '2026-11-10'), 'same day');
});

test('marks', () => {
  assert.equal(markText(16, 20), '16 / 20 (80%)');
  assert.equal(markText(7, null), '7');
  assert.equal(markText(null, 20), '—');
});

test('rates and their colours', () => {
  const r = rates({ assigned: 0, overdue: 1, submitted: 1, corrected: 2, excused: 1, not_given: 0, due: 4, done: 3, timed: 3, on_time: 2, mark_pct: 75 });
  assert.deepEqual(r, { completed: 75, onTime: 67, mark: 75 });
  assert.equal(rates({ assigned: 1, overdue: 0, submitted: 0, corrected: 0, excused: 0, not_given: 0, due: 0, done: 0, timed: 0, on_time: 0, mark_pct: null }).completed, null,
    'Nothing due yet: no rate rather than 0%');
  assert.equal(rateTone(85), 'good');
  assert.equal(rateTone(70), null);
  assert.equal(rateTone(40), 'low');
});

test('filter chips', () => {
  const rows = [row({ state: 'assigned' }), row({ state: 'overdue' }), row({ state: 'submitted' }), row({ state: 'corrected' }),
    row({ state: 'corrected', draft: true }), row({ state: 'not_given' }), row({ state: 'excused' })];
  assert.equal(filterRows(rows, 'action').length, 4, 'Needs action: overdue, submitted, not given, marked but not sent');
  assert.equal(filterRows(rows, 'assigned').length, 2, 'Assigned includes Overdue');
  assert.equal(filterRows(rows, 'corrected').length, 2);
  assert.equal(filterRows(rows, 'all').length, 7);
  assert.equal(filterRows(rows, 'upcoming').length, 0);
  assert.equal(defaultShow(rows), 'action');
  assert.equal(defaultShow([row({ state: 'corrected' })]), 'all', 'Nothing to act on: opens on All');
});

test('upcoming: not sent, the next 14 days, and later', () => {
  const items = [
    up({ kind: 'not_sent', completed_on: '2026-11-10' }),
    up({ code: 'A', planned_on: '2026-11-12', behind: true }),
    up({ code: 'B', planned_on: '2026-11-20' }),
    up({ code: 'C', planned_on: '2026-12-30' }),
  ];
  const s = splitUpcoming(items, '2026-11-16');
  assert.equal(s.notSent.length, 1);
  assert.deepEqual(s.soon.map((u) => u.code), ['A', 'B']);
  assert.deepEqual(s.later.map((u) => u.code), ['C']);
  const noTracker = splitUpcoming([up({ code: 'X' }), up({ code: 'Y' })], '2026-11-16');
  assert.equal(noTracker.soon.length, 2, 'No tracker: the plan is listed without dates');
  assert.equal(upcomingLabel(items[0], '2026-11-16'), 'Not sent: lesson completed 10-Nov-2026 Tue');
  assert.equal(upcomingLabel(items[1], '2026-11-16'), 'Lesson behind plan: planned 12-Nov-2026 Thu');
  assert.equal(upcomingLabel(items[2], '2026-11-16'), 'Expected 20-Nov-2026 Fri');
  assert.equal(upcomingLabel(up({ planned_on: '2026-11-16' }), '2026-11-16'), 'Expected today');
  assert.equal(upcomingLabel(up({}), '2026-11-16'), 'No date yet');
});

test('the batch grid puts each cell under its homework and student', () => {
  const sheets: BatchSheet[] = [
    { id: 'h2', title: 'Decimals', set_on: '2026-11-09', due_on: '2026-11-12', max_mark: 10, lesson_code: null, slot: null, hw_code: null },
    { id: 'h1', title: 'Fractions', set_on: '2026-11-02', due_on: null, max_mark: null, lesson_code: null, slot: null, hw_code: null },
  ];
  const cells: Cell[] = [[0, 0, 'corrected', 8, '2026-11-13', '2026-11-14', false], [1, 1, 'not_given', null, null, null, false]];
  const students = [{ id: 'a' }, { id: 'b' }] as never;
  const rows = gridRows({ students, sheets, cells });
  assert.equal(rows[0].cells[0]?.[2], 'corrected');
  assert.equal(rows[0].cells[1], null, 'No cell: set before they joined');
  assert.equal(rows[1].cells[1]?.[2], 'not_given');
  assert.equal(cellTitle(cells[0], sheets[0]), 'Decimals · Corrected 8 / 10 (80%) · in 13-Nov-2026 Fri (late by 1 day) · corrected 14-Nov-2026 Sat');
});

test('school years run from 1 September to 31 August', () => {
  assert.equal(schoolYearOf('2026-08-31'), 2025);
  assert.equal(schoolYearOf('2026-09-01'), 2026);
  assert.equal(schoolYearOf('2027-01-15'), 2026);
  assert.equal(schoolYearLabel(2026), '2026-27');
  assert.equal(schoolYearLabel(2099), '2099-00');
  // The year shown is offered even with no homework yet; newest first.
  assert.deepEqual(schoolYearChoices([{ year: 2024, sheets: 3 }, { year: 2025, sheets: 9 }], 2026).map((y) => y.year), [2026, 2025, 2024]);
  assert.deepEqual(schoolYearChoices([{ year: 2025, sheets: 9 }], 2025).map((y) => y.year), [2025]);
});
