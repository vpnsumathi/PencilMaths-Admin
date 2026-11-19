// Unit tests for the Class Schedule's matching and the check-in from Google Meet (liveClass.ts, guide 21 sections
// 12 to 15). Run: npm test   (Node's own test runner; nothing to install)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLive, classTimes, familyAccounts, isFinal, meetFindings, teacherStretches, ukMoment, ukNow, type Expected, type InCall,
} from './liveClass.ts';

const WINDOW = { before_minutes: 15, after_minutes: 60, late_minutes: 10 };
const expected: Expected[] = [
  { id: 't1', kind: 'teacher', name: 'Tom Teacher' },
  { id: 's1', kind: 'student', name: 'Sam One' },
  { id: 's2', kind: 'student', name: 'Kim Two' },
];
const person = (over: Partial<InCall>): InCall => ({
  participantId: 'conferenceRecords/c1/participants/p1', googleId: null, name: 'Someone', kind: 'anonymous',
  joinedAt: null, leftAt: null, ...over,
});
const links = [
  { google_user_id: 'g-tom', student_id: null, teacher_id: 't1' },
  { google_user_id: 'g-sam', student_id: 's1', teacher_id: null },
];

describe('UK times', () => {
  it('reads a winter (GMT) time', () => assert.equal(ukMoment('2026-11-16', '16:00').toISOString(), '2026-11-16T16:00:00.000Z'));
  it('reads a summer (BST) time', () => assert.equal(ukMoment('2026-07-06', '16:00').toISOString(), '2026-07-06T15:00:00.000Z'));
  it('reads the day the clocks go back', () => assert.equal(ukMoment('2026-10-25', '16:00').toISOString(), '2026-10-25T16:00:00.000Z'));
  it('reads the day the clocks go forward', () => assert.equal(ukMoment('2026-03-29', '16:00').toISOString(), '2026-03-29T15:00:00.000Z'));
  it('gives the check-in time of a class', () => {
    const t = classTimes('2026-11-16', '16:00', WINDOW);
    assert.equal(t.opens.toISOString(), '2026-11-16T15:45:00.000Z');
    assert.equal(t.closes.toISOString(), '2026-11-16T17:00:00.000Z');
    assert.equal(ukNow(t.starts).minute, 16 * 60);
  });
});

describe('matching the people in the calls', () => {
  it('takes the first join over every call of the class', () => {
    const live = buildLive(expected, [
      person({ participantId: 'conferenceRecords/c1/participants/a', googleId: 'g-sam', kind: 'signed_in', joinedAt: '2026-11-16T16:04:00Z', leftAt: '2026-11-16T16:20:00Z' }),
      person({ participantId: 'conferenceRecords/c2/participants/b', googleId: 'g-sam', kind: 'signed_in', joinedAt: '2026-11-16T16:25:00Z', leftAt: null }),
    ], links);
    const sam = live.people.find((p) => p.id === 's1')!;
    assert.equal(sam.joinedAt, '2026-11-16T16:04:00Z');
    assert.equal(sam.state, 'in_meet');
    assert.deepEqual(sam.participantIds, ['conferenceRecords/c1/participants/a', 'conferenceRecords/c2/participants/b']);
  });
  it('compares join times as times, not as text', () => {
    const live = buildLive(expected, [
      person({ participantId: 'conferenceRecords/c1/participants/a', googleId: 'g-sam', kind: 'signed_in', joinedAt: '2026-11-16T16:04:00.5Z' }),
      person({ participantId: 'conferenceRecords/c1/participants/b', googleId: 'g-sam', kind: 'signed_in', joinedAt: '2026-11-16T16:04:00.123456Z' }),
    ], links);
    assert.equal(live.people.find((p) => p.id === 's1')!.joinedAt, '2026-11-16T16:04:00.123456Z');
  });
  it('recognises a phone caller who rejoined the same call by name', () => {
    const live = buildLive(expected, [
      person({ participantId: 'conferenceRecords/c1/participants/x', kind: 'phone', name: '+44 ••• 123', joinedAt: '2026-11-16T16:01:00Z', leftAt: '2026-11-16T16:10:00Z' }),
      person({ participantId: 'conferenceRecords/c1/participants/y', kind: 'phone', name: '+44 ••• 123', joinedAt: '2026-11-16T16:12:00Z' }),
    ], links, new Map(), [{ participant_name: 'conferenceRecords/c1/participants/x', kind: 'phone', display_name: '+44 ••• 123', student_id: 's2', teacher_id: null }]);
    const kim = live.people.find((p) => p.id === 's2')!;
    assert.equal(kim.joinedAt, '2026-11-16T16:01:00Z');
    assert.equal(kim.state, 'in_meet');
    assert.equal(live.guests.length, 0);
  });
  it('shows everyone as unknown when Meet could not be asked', () => {
    assert.ok(buildLive(expected, null, links).people.every((p) => p.state === 'unknown'));
  });
});

describe('what is saved from Meet', () => {
  const live = buildLive(expected, [
    person({ participantId: 'conferenceRecords/c1/participants/t', googleId: 'g-tom', kind: 'signed_in', joinedAt: '2026-11-16T16:03:00Z', leftAt: '2026-11-16T17:01:00Z' }),
    person({ participantId: 'conferenceRecords/c1/participants/s', googleId: 'g-sam', kind: 'signed_in', joinedAt: '2026-11-16T15:58:00Z' }),
    person({ participantId: 'conferenceRecords/c1/participants/o', googleId: 'g-other', kind: 'signed_in', joinedAt: '2026-11-16T16:00:00Z' }),
    person({ participantId: 'conferenceRecords/c1/participants/n', kind: 'anonymous', name: 'iPad', joinedAt: '2026-11-16T16:00:00Z' }),
  ], links);
  it('gives each student seen their first join, and nothing for a student not seen', () => {
    assert.deepEqual(meetFindings(live).students, [{ id: 's1', first_join: '2026-11-16T15:58:00Z' }]);
  });
  it('gives the teacher\'s first join and last leave', () => {
    const t = meetFindings(live).teacher!;
    assert.equal(t.first_join, '2026-11-16T16:03:00Z');
    assert.equal(t.last_leave, '2026-11-16T17:01:00Z');
  });
  it('counts people nobody can be sure of, but not an account linked to someone outside the class', () => {
    assert.equal(meetFindings(live).unknown, 2);
    assert.equal(meetFindings(live, new Set(['g-other'])).unknown, 1);
  });
});

describe('when a class is final', () => {
  const closes = new Date('2026-11-16T17:00:00Z');
  const ended = [{ name: 'c1', startTime: '2026-11-16T15:55:00Z', endTime: '2026-11-16T17:02:00Z' }];
  const going = [{ name: 'c1', startTime: '2026-11-16T15:55:00Z' }];
  it('not while check-in is still open', () => assert.equal(isFinal(ended, closes, new Date('2026-11-16T16:59:00Z')), false));
  it('when check-in has closed and every call has ended', () => assert.equal(isFinal(ended, closes, new Date('2026-11-16T17:05:00Z')), true));
  it('when nobody started the room', () => assert.equal(isFinal([], closes, new Date('2026-11-16T17:05:00Z')), true));
  it('not while a call is still going on after the class', () => assert.equal(isFinal(going, closes, new Date('2026-11-16T17:30:00Z')), false));
  it('on a later day, even if Google still shows the call going on', () => assert.equal(isFinal(going, closes, new Date('2026-11-17T09:00:00Z')), true));
});

describe('the teacher\'s minutes and drop-outs', () => {
  const now = new Date('2026-11-16T18:00:00Z');
  it('adds up the stretches and counts each gap as a drop-out', () => {
    assert.deepEqual(teacherStretches([
      { startTime: '2026-11-16T16:00:00Z', endTime: '2026-11-16T16:20:00Z' },
      { startTime: '2026-11-16T16:22:00Z', endTime: '2026-11-16T17:00:00Z' },
    ], now), { minutes: 58, drops: 1 });
  });
  it('counts a laptop and a phone at the same time once', () => {
    assert.deepEqual(teacherStretches([
      { startTime: '2026-11-16T16:00:00Z', endTime: '2026-11-16T17:00:00Z' },
      { startTime: '2026-11-16T16:10:00Z', endTime: '2026-11-16T16:30:00Z' },
    ], now), { minutes: 60, drops: 0 });
  });
  it('counts a stretch still going on up to now', () => {
    assert.deepEqual(teacherStretches([{ startTime: '2026-11-16T17:30:00Z', endTime: null }], now), { minutes: 30, drops: 0 });
  });
  it('gives nothing for no stretches', () => assert.deepEqual(teacherStretches([], now), { minutes: 0, drops: 0 }));
});

describe('a parent\'s Google account shared by brothers and sisters', () => {
  const kids = [{ id: 's1', familyId: 'f1' }, { id: 's3', familyId: 'f2' }];
  const parent = person({ googleId: 'g-parent', kind: 'signed_in', joinedAt: '2026-11-16T16:00:00Z' });
  it('counts an account linked to a brother or sister outside the class as unidentified', () => {
    const r = familyAccounts(kids, [parent], [], [{ google_user_id: 'g-parent', students: { family_id: 'f1' } }]);
    assert.equal(r.knownElsewhere.has('g-parent'), false);
  });
  it('still counts an account linked to an unrelated child outside the class as known', () => {
    const r = familyAccounts(kids, [parent], [], [{ google_user_id: 'g-parent', students: { family_id: 'f9' } }]);
    assert.equal(r.knownElsewhere.has('g-parent'), true);
  });
  it('flags an account linked to one of two brothers or sisters in the same class', () => {
    const both = [{ id: 's1', familyId: 'f1' }, { id: 's2', familyId: 'f1' }];
    const r = familyAccounts(both, [parent], [{ google_user_id: 'g-parent', student_id: 's1', teacher_id: null }], []);
    assert.equal(r.shared, 1);
  });
  it('doesn\'t flag an only child\'s account', () => {
    const r = familyAccounts(kids, [parent], [{ google_user_id: 'g-parent', student_id: 's1', teacher_id: null }], []);
    assert.equal(r.shared, 0);
  });
});
