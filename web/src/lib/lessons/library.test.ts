// Unit tests for the Lesson library delete helpers (library.ts). Run: cd web && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binNote, importCodesNote, usageReasons, usedByClasses, type LessonUsage } from './library.ts';

const unused = (over: Partial<LessonUsage> = {}): LessonUsage => ({
  lesson_id: 'l1', progress: [], homework: [], notes: [], trackers: [], used: false, ...over,
});
const b = (code: string) => ({ batch_id: code.toLowerCase(), code });

test('an unused lesson has no reasons', () => {
  assert.deepEqual(usageReasons(unused()), []);
  assert.deepEqual(usageReasons(unused({ homework: [{ homework_id: 'h', code: 'Y5-A001', slot: 1, has_file: true, sent: [], question_bank: 0 }] })), []);
});

test('each kind of use gets its own line, naming the classes', () => {
  const u = unused({
    used: true,
    progress: [{ ...b('B-001'), status: 'complete', closed: false }, { ...b('B-002'), status: 'in_progress', closed: false },
      { ...b('B-003'), status: 'complete', closed: true }],
    homework: [
      { homework_id: 'h1', code: 'Y5-A001', slot: 1, has_file: true, sent: [b('B-001'), b('B-003')], question_bank: 0 },
      { homework_id: 'h2', code: 'Y5-A002', slot: 2, has_file: false, sent: [], question_bank: 4 },
    ],
    notes: [{ batch_id: 'b-001', code: 'B-001', notes: 2 }, { batch_id: null, code: null, notes: 1 }],
    trackers: [b('B-002')],
  });
  assert.deepEqual(usageReasons(u), [
    'Completed in B-001, B-003',
    'In progress in B-002',
    'Hw-1 Y5-A001 sent to B-001, B-003',
    'Question bank work on Y5-A002',
    '2 class notes in B-001 about it',
    '1 personal note about it',
    'In the Lesson Tracker dates of B-002',
  ]);
});

test('the classes using a plan are listed once each, in order, and only from used lessons', () => {
  const used = unused({
    used: true, progress: [{ ...b('B-002'), status: 'complete', closed: false }], trackers: [b('B-001')],
    homework: [{ homework_id: 'h', code: 'Y5-A001', slot: 1, has_file: true, sent: [b('B-002'), b('B-004')], question_bank: 0 }],
    notes: [{ batch_id: null, code: null, notes: 1 }, { batch_id: 'b-003', code: 'B-003', notes: 1 }],
  });
  assert.deepEqual(usedByClasses([used, unused({ trackers: [b('B-009')] })]), ['B-001', 'B-002', 'B-003', 'B-004']);
  assert.deepEqual(usedByClasses([]), []);
});

test('the Drive bin note says what moved and what stayed', () => {
  assert.equal(binNote(null), '');
  assert.equal(binNote({ binned: 0, left: 0 }), '');
  assert.equal(binNote({ binned: 1, left: 0 }), '1 worksheet file moved to the Google Drive bin.');
  assert.match(binNote({ binned: 2, left: 1 }), /^2 worksheet files moved to the Google Drive bin\. 1 worksheet file couldn't be moved to the bin and is still in/);
  assert.match(binNote({ binned: 0, left: 3 }), /^3 worksheet files couldn't be moved to the bin and are still in/);
});

test('the import note lists removed and kept homework codes, at most 3 by name', () => {
  assert.equal(importCodesNote(0, []), '');
  assert.equal(importCodesNote(1, []), '1 homework code with an empty cell was removed.');
  assert.equal(importCodesNote(2, ['A (x)']), '2 homework codes with an empty cell were removed. Kept because already sent: A (x).');
  assert.equal(importCodesNote(0, ['A', 'B', 'C', 'D', 'E']), 'Kept because already sent: A; B; C and 2 more.');
});
