// Unit tests for the Dashboard's working out (model.ts, guide 28). Run: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  change, classState, itemHref, liveStatus, liveSummary, nextUp, pickLive, rankNeeds, readShow, timeline,
  type LiveClass, type SummaryData, type TodayClass,
} from './model.ts';

const cls = (over: Partial<TodayClass>): TodayClass => ({
  kind: 'batch', id: 'b1', code: 'Y7-MA-1', name: null, subject: 'Maths', teacher: 'Ms Patel', start: '17:30', end: null,
  has_room: true, expected: 10, checked_in: 9, taken: false, meet: null, teacher_meet: null, ...over,
});
const clock = (iso: string) => iso.slice(11, 16);
const start = new Date('2026-11-19T17:30:00Z');

describe('classState', () => {
  it('is later, soon, live, then done after the check-in time', () => {
    assert.equal(classState({ start: '17:30', end: null }, 17 * 60).state, 'later');
    assert.equal(classState({ start: '17:30', end: null }, 17 * 60 + 20).state, 'soon');
    assert.equal(classState({ start: '17:30', end: null }, 17 * 60 + 30).state, 'live');
    assert.equal(classState({ start: '17:30', end: null }, 18 * 60 + 30).state, 'live');
    assert.equal(classState({ start: '17:30', end: null }, 18 * 60 + 31).state, 'done');
  });
  it('an extra class is live until its own end', () => {
    assert.equal(classState({ start: '17:30', end: '18:00' }, 18 * 60 + 1).state, 'done');
  });
});

describe('liveStatus', () => {
  const seen = { state: 'seen' as const, checked_at: '2026-11-19T17:41:00Z', final: false, unknown_guests: 0 };
  it('never says late from a missing record: a class nobody has checked says so', () => {
    const s = liveStatus(cls({}), 20, start, clock);
    assert.equal(s.kind, 'not_checked');
    assert.equal(s.problem, false);
  });
  it('a check from before this class (yesterday) does not count', () => {
    const s = liveStatus(cls({ meet: { ...seen, checked_at: '2026-11-18T17:41:00Z' } }), 20, start, clock);
    assert.equal(s.kind, 'not_checked');
  });
  it('In call when Meet saw the teacher', () => {
    const s = liveStatus(cls({ meet: seen, teacher_meet: { first_join: '2026-11-19T17:29:00Z', last_leave: null, status: 'on_time' } }), 20, start, clock);
    assert.deepEqual([s.kind, s.text, s.problem], ['in_call', 'Teacher in call', false]);
  });
  it('Not seen gives the time of the last check, and is a problem only after 5 minutes', () => {
    assert.deepEqual([liveStatus(cls({ meet: seen }), 3, start, clock).problem, liveStatus(cls({ meet: seen }), 11, start, clock).text],
      [false, 'Teacher not seen at 17:41']);
    assert.equal(liveStatus(cls({ meet: seen }), 11, start, clock).problem, true);
  });
  it('a failed check and a teacher who left are problems', () => {
    assert.equal(liveStatus(cls({ meet: { ...seen, state: 'error' } }), 11, start, clock).kind, 'error');
    const left = liveStatus(cls({ meet: seen, teacher_meet: { first_join: '2026-11-19T17:29:00Z', last_leave: '2026-11-19T17:50:00Z', status: 'on_time' } }), 25, start, clock);
    assert.deepEqual([left.kind, left.problem], ['left', true]);
  });
  it('low check-in: under half the class after 10 minutes', () => {
    assert.equal(liveStatus(cls({ checked_in: 4 }), 9, start, clock).lowCheckIn, false);
    assert.equal(liveStatus(cls({ checked_in: 4 }), 10, start, clock).lowCheckIn, true);
    assert.equal(liveStatus(cls({ checked_in: 5 }), 30, start, clock).lowCheckIn, false);
  });
});

describe('pickLive', () => {
  const live = (code: string, startAt: string, problem: boolean): LiveClass => ({
    ...cls({ code, start: startAt }), minutesIn: 10,
    status: { kind: problem ? 'not_seen' : 'in_call', text: '', problem, lowCheckIn: false },
  });
  it('3 cards with problems first, one row of 6 tiles, and the rest counted', () => {
    const list = Array.from({ length: 20 }, (_, i) => live(`C${String(i).padStart(2, '0')}`, '17:30', i === 7 || i === 12));
    const p = pickLive(list);
    assert.deepEqual(p.cards.map((c) => c.code), ['C07', 'C12', 'C00']);
    assert.equal(p.tiles.length, 6);
    assert.equal(p.more, 11);
    assert.deepEqual(liveSummary(p.counts), ['18 running normally', '2 teachers not seen in the call']);
  });
  it('no problems: the first 3 live classes by start time', () => {
    const p = pickLive([live('B', '17:30', false), live('A', '17:00', false), live('C', '17:30', false), live('D', '17:45', false)]);
    assert.deepEqual(p.cards.map((c) => c.code), ['A', 'B', 'C']);
    assert.deepEqual(liveSummary(p.counts), ['All 4 running normally']);
  });
});

describe('nextUp and timeline', () => {
  it('Next up is only the next start time, with how many are later', () => {
    const n = nextUp([cls({ code: 'X', start: '19:00' }), cls({ code: 'A', start: '18:30' }), cls({ code: 'B', start: '18:30' }), cls({ code: 'Y', start: '19:30' })]);
    assert.deepEqual([n?.start, n?.classes.map((c) => c.code), n?.laterCount, n?.laterTimes], ['18:30', ['A', 'B'], 2, ['19:00', '19:30']]);
    assert.equal(nextUp([]), null);
  });
  it('the timeline counts classes per half hour and marks now', () => {
    const t = timeline([cls({ start: '16:00' }), cls({ start: '16:15' }), cls({ start: '17:30' })], 17 * 60);
    assert.deepEqual(t?.slots.map((s) => s.count), [2, 0, 0, 1, 0]);
    assert.deepEqual(t?.slots.map((s) => s.when), ['past', 'past', 'now', 'future', 'future']);
    assert.equal(t?.from, '16:00');
    assert.equal(t?.to, '18:30'); // the last class's check-in time ends at 18:30
  });
});

describe('rankNeeds', () => {
  const g = (total: number, oldest: string | null = null) => ({ total, oldest, items: [] });
  const needs: SummaryData['needs'] = {
    batch_full: g(1), to_mark: g(12, '2026-11-10'), attendance_missing: g(2, '2026-11-17'), falling_behind: g(3, '2026-11-12'),
    lesson_behind: g(2, '2026-11-01'), enquiry_waiting: g(4, '2026-11-02'), student_setup: g(1, '2026-10-01'), not_sent: g(0),
  };
  it('red first, then amber, then blue; oldest first within each', () => {
    const r = rankNeeds(needs);
    assert.deepEqual(r.shown.map((x) => x.key), ['falling_behind', 'attendance_missing', 'student_setup', 'lesson_behind', 'to_mark']);
    assert.deepEqual(r.hidden.map((x) => x.key), ['enquiry_waiting', 'batch_full']);
    assert.equal(r.total, 7); // not_sent is 0, so it isn't a group
  });
  it('a chip shows every group in its area, keeping totals', () => {
    const r = rankNeeds(needs, 'homework');
    assert.deepEqual(r.shown.map((x) => [x.key, x.total]), [['falling_behind', 3], ['to_mark', 12]]);
    assert.equal(r.areaTotals.all, 7);
    assert.equal(rankNeeds(needs, 'all').shown.length, 7);
  });
  it('the same data always gives the same order (ties broken by name)', () => {
    const tie = { batch_full: g(1), enquiry_waiting: g(1) };
    assert.deepEqual(rankNeeds(tie).shown.map((x) => x.key), ['batch_full', 'enquiry_waiting']);
  });
  it('only known chips are read from the address', () => {
    assert.equal(readShow('homework'), 'homework');
    assert.equal(readShow('constructor'), null);
    assert.equal(readShow(undefined), null);
  });
});

describe('links and changes', () => {
  it('each item opens the page that sorts it out', () => {
    assert.equal(itemHref('attendance_missing', { batch_id: 'b1', class_date: '2026-11-17' }), '/batches/b1?class_date=2026-11-17#attendance');
    assert.equal(itemHref('to_mark', { batch_id: 'b1', sheet_id: 's1', student_id: 'p1' }), '/batches/b1/mark?sheet=s1&student=p1');
    assert.equal(itemHref('meet_review', { kind: 'extra', extra_class_id: 'x1' }), '/extra-classes/x1');
  });
  it('the change is against the last complete week', () => {
    assert.equal(change(91, [80, 85, 88]), 3);
    assert.equal(change(null, [80]), null);
    assert.equal(change(90, [80, null]), null);
  });
});
