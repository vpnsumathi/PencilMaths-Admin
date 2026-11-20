import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inboxTime, linkify, reach, sentLabel, studentsWord, type Audiences } from './messages.ts';

test('linkify turns web addresses into links and leaves the rest as text', () => {
  assert.deepEqual(linkify('See https://ukpmadmin.com/me/homework. Thanks'), [
    { text: 'See ' }, { text: 'https://ukpmadmin.com/me/homework', href: 'https://ukpmadmin.com/me/homework' }, { text: '. Thanks' },
  ]);
  assert.deepEqual(linkify('No links here'), [{ text: 'No links here' }]);
  assert.deepEqual(linkify('(http://a.test/x)'), [{ text: '(' }, { text: 'http://a.test/x', href: 'http://a.test/x' }, { text: ')' }]);
  assert.deepEqual(linkify('javascript:alert(1) www.x.test'), [{ text: 'javascript:alert(1) www.x.test' }]);
});

test('sentLabel uses UK time and says Today / Yesterday', () => {
  const now = new Date('2026-11-20T15:00:00Z');
  assert.equal(sentLabel('2026-11-20T09:05:00Z', now), 'Today 9:05 AM');
  assert.equal(sentLabel('2026-11-19T17:40:00Z', now), 'Yesterday 5:40 PM');
  assert.equal(sentLabel('2026-11-16T17:40:00Z', now), 'Mon 16 Nov, 5:40 PM');
  assert.equal(sentLabel('2025-11-16T17:40:00Z', now), '16 Nov 2025, 5:40 PM');
  // British Summer Time: 08:30 UTC in July is 9:30 AM in the UK.
  assert.equal(sentLabel('2026-07-01T08:30:00Z', new Date('2026-07-01T12:00:00Z')), 'Today 9:30 AM');
});

test('inboxTime is short', () => {
  const now = new Date('2026-11-20T15:00:00Z');
  assert.equal(inboxTime('2026-11-20T14:18:00Z', now), '2:18 PM');
  assert.equal(inboxTime('2026-11-19T10:00:00Z', now), 'Yesterday');
  assert.equal(inboxTime('2026-11-17T10:00:00Z', now), 'Tue');
  assert.equal(inboxTime('2026-11-02T10:00:00Z', now), '2 Nov');
});

test('reach counts who a message goes to', () => {
  const a: Audiences = { all: 40, years: [{ year: 9, count: 14 }], batches: [{ id: 'b1', code: 'B-012', subject: 'Maths', year: 9, teacher: 'Ms Shah', count: 6 }] };
  assert.equal(reach({ kind: 'all' }, a), 40);
  assert.equal(reach({ kind: 'year', year: 9 }, a), 14);
  assert.equal(reach({ kind: 'year', year: 5 }, a), 0);
  assert.equal(reach({ kind: 'batch', batch: 'b1' }, a), 6);
  assert.equal(reach({ kind: 'students', students: ['x', 'y', 'x'] }, a), 2);
  assert.equal(studentsWord(1), '1 student');
  assert.equal(studentsWord(6), '6 students');
});
