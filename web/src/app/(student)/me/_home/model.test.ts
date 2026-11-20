// Unit tests for the student home page's working out (model.ts, Help/12 section 3.2). Run: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MyExtra } from '../../../../lib/extraClasses';
import type { StudentClass } from '../dashboard';
import {
  dayName, greeting, isNew, nextChange, nextExtra, percent, pickHero, startsIn, timesText, upcoming, weekStrip,
} from './model.ts';

const W = { before_minutes: 15, after_minutes: 60, late_minutes: 10 };
// Thursday 19 November 2026 (winter, so UK time = UTC).
const at = (time: string) => new Date(`2026-11-19T${time}:00Z`);

const cls = (over: Partial<StudentClass>): StudentClass => ({
  subject: 'Maths', batch_code: 'M9A', teacher: 'Mr Patel', class_year: 9, started_on: '2026-09-01',
  times: [{ weekday: 2, start_time: '17:00:00' }, { weekday: 4, start_time: '17:00:00' }], to_do: 1, marked: 0,
  batch_id: 'b1', has_class_link: true, ...over,
});
const extra = (over: Partial<MyExtra>): MyExtra => ({
  id: 'x1', starts_at: '2026-11-24T16:00:00Z', ends_at: '2026-11-24T16:45:00Z', length_minutes: 45, subject: 'Maths',
  teacher: 'Mr Patel', kind: 'catch_up', note: null, cancelled: false, moved_from: null, opens_at: '2026-11-24T15:45:00Z',
  in_window: false, mark: null, mark_source: null, ...over,
});
const maths = cls({});
const english = cls({ subject: 'English', batch_code: 'E9B', batch_id: 'b2', times: [{ weekday: 6, start_time: '10:00:00' }] });

describe('greeting', () => {
  it('follows the UK clock', () => {
    assert.equal(greeting(at('09:00')), 'Good morning');
    assert.equal(greeting(at('12:00')), 'Good afternoon');
    assert.equal(greeting(at('16:59')), 'Good afternoon');
    assert.equal(greeting(at('17:00')), 'Good evening');
  });
  it('uses summer time in summer', () => {
    assert.equal(greeting(new Date('2026-06-10T11:30:00Z')), 'Good afternoon'); // 12:30 BST
  });
});

describe('startsIn and dayName', () => {
  it('says minutes, hours, tomorrow or days', () => {
    assert.equal(startsIn(at('17:00'), at('16:52')), 'in 8 minutes');
    assert.equal(startsIn(at('17:00'), at('16:59')), 'in 1 minute');
    assert.equal(startsIn(at('17:00'), at('17:00')), 'now');
    assert.equal(startsIn(at('19:00'), at('16:55')), 'in 2 hours');
    assert.equal(startsIn(new Date('2026-11-20T10:00:00Z'), at('19:30')), 'tomorrow');
    assert.equal(startsIn(new Date('2026-11-21T10:00:00Z'), at('19:30')), 'in 2 days');
  });
  it('names the day', () => {
    assert.equal(dayName('2026-11-19', at('10:00')), 'Today');
    assert.equal(dayName('2026-11-20', at('10:00')), 'Tomorrow');
    assert.equal(dayName('2026-11-21', at('10:00')), 'Saturday 21 November');
  });
});

describe('upcoming and the Up next card', () => {
  it('before check-in, the soonest class is next', () => {
    const list = upcoming([maths, english], [], W, at('10:00'));
    const hero = pickHero(list)!;
    assert.equal(hero.kind, 'class');
    assert.equal(hero.date, '2026-11-19');
    assert.equal(hero.open, false);
    assert.equal(list.length, 3);
  });
  it('opens 15 minutes before the start and stays open 60 minutes after', () => {
    assert.equal(pickHero(upcoming([maths], [], W, at('16:44')))!.open, false);
    const soon = pickHero(upcoming([maths], [], W, at('16:52')))!;
    assert.equal(soon.open, true);
    assert.equal(soon.started, false);
    const live = pickHero(upcoming([maths], [], W, at('17:30')))!;
    assert.equal(live.started, true);
    assert.equal(live.date, '2026-11-19');
    const after = pickHero(upcoming([maths], [], W, at('18:01')))!;
    assert.equal(after.date, '2026-11-24'); // next Tuesday
    assert.equal(after.open, false);
  });
  it('an open extra class wins over a later weekly class', () => {
    const live = extra({ starts_at: '2026-11-19T15:00:00Z', ends_at: '2026-11-19T15:45:00Z', in_window: true });
    const hero = pickHero(upcoming([maths], [live], W, at('15:05')))!;
    assert.equal(hero.kind, 'extra');
    assert.equal(hero.started, true);
  });
  it('an extra class sooner than any weekly class is next', () => {
    const tomorrow = extra({ starts_at: '2026-11-20T09:00:00Z', ends_at: '2026-11-20T09:45:00Z' });
    assert.equal(pickHero(upcoming([maths, english], [tomorrow], W, at('19:30')))!.kind, 'extra');
  });
  it('cancelled and finished extra classes, and classes with no times, are left out', () => {
    const list = upcoming([cls({ times: [] })], [extra({ cancelled: true }),
      extra({ id: 'x2', starts_at: '2026-11-19T08:00:00Z', ends_at: '2026-11-19T08:45:00Z' })], W, at('10:00'));
    assert.equal(list.length, 0);
    assert.equal(pickHero(list), null);
  });
  it('the extra class under the card is the soonest one that is not the card, within 7 days', () => {
    const x = extra({});
    const later = extra({ id: 'x3', starts_at: '2026-11-29T16:00:00Z', ends_at: '2026-11-29T16:45:00Z' });
    const list = upcoming([english], [x, later], W, at('19:30'));
    const hero = pickHero(list);
    assert.equal(hero!.kind, 'class');
    assert.equal(nextExtra(list, hero, at('19:30'))!.extra.id, 'x1');
    const onlyLater = upcoming([english], [later], W, at('19:30'));
    assert.equal(nextExtra(onlyLater, pickHero(onlyLater), at('19:30')), undefined);
  });
});

describe('nextChange', () => {
  it('is the next check-in opening, start or closing within a day', () => {
    const list = upcoming([maths], [], W, at('10:00'));
    assert.equal(nextChange(list, W, at('10:00')), '2026-11-19T16:45:01.000Z');
    assert.equal(nextChange(list, W, at('16:50')), '2026-11-19T17:00:01.000Z');
    assert.equal(nextChange(list, W, at('17:10')), '2026-11-19T18:00:01.000Z');
  });
  it('is nothing when no class is in the next day', () => {
    assert.equal(nextChange(upcoming([english], [], W, at('09:00')), W, at('09:00')), null);
  });
});

describe('weekStrip', () => {
  it('runs Monday to Sunday with dots', () => {
    const days = weekStrip([maths, english], [{ due_on: '2026-11-22', title: 'Plan', subject: 'English' }],
      [extra({ starts_at: '2026-11-21T09:00:00Z' })], at('10:00'));
    assert.deepEqual(days.map((d) => d.date), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    assert.deepEqual(days.map((d) => d.hasClass), [false, true, false, true, false, true, false]);
    assert.equal(days[3].today, true);
    assert.equal(days[2].past, true);
    assert.equal(days[4].past, false);
    assert.equal(days[6].hasHomework, true);
    assert.equal(days[5].hasExtra, true);
  });
  it('on a Sunday, the week is the one ending today', () => {
    const days = weekStrip([], [], [], new Date('2026-11-22T20:00:00Z'));
    assert.equal(days[0].date, '2026-11-16');
    assert.equal(days[6].today, true);
  });
});

describe('small helpers', () => {
  it('percent', () => {
    assert.equal(percent(18, 20), 90);
    assert.equal(percent(7, 9), 78);
    assert.equal(percent(null, 20), null);
    assert.equal(percent(5, null), null);
    assert.equal(percent(25, 20), 100);
  });
  it('timesText', () => {
    assert.equal(timesText(maths.times), 'Tue and Thu, 5:00 PM');
    assert.equal(timesText(english.times), 'Sat, 10:00 AM');
    assert.equal(timesText([{ weekday: 1, start_time: '16:00' }, { weekday: 3, start_time: '18:30' }]), 'Mon 4:00 PM, Wed 6:30 PM');
    assert.equal(timesText([]), 'Times to be confirmed');
  });
  it('isNew', () => {
    assert.equal(isNew('2026-11-18T10:00:00Z', at('10:00')), true);
    assert.equal(isNew('2026-11-10T10:00:00Z', at('10:00')), false);
  });
});
