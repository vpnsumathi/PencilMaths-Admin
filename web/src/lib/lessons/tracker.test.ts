// Unit tests for the Lesson Tracker (tracker.ts) and the Class No. column (plan.ts).
// Run: npm test   (Node's own test runner; nothing to install)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readTermPlan, parseClassNo } from './plan.ts';
import {
  addDays, checkPlan, classKey, cutoffFor, dayNumber, easterSunday, formatTrackerDate, holidayOf, isChristmas, isEaster,
  planClasses, standing, standingLabel, standingTone, studentPlanRows, termTabs, type StudentPlanClass, summaryLine, teachingDays, trackLessons, weekdayOf, type TrackerLesson,
} from './tracker.ts';

const mondayThursday = [1, 4];
const lessons = (...classNos: (number | null)[]): TrackerLesson[] => classNos.map((classNo) => ({ term: 1, classNo }));
const datesOf = (plan: ReturnType<typeof planClasses>) =>
  new Map(plan.classes.map((c) => [classKey(c.term, c.classNo), c.plannedOn]));
const dateFor = (plan: ReturnType<typeof planClasses>, term: number, classNo: number) =>
  plan.classes.find((c) => c.term === term && c.classNo === classNo)?.plannedOn ?? null;
// Every weekday pair: (1,2), (1,3) … (6,7).
const pairs: number[][] = [];
for (let a = 1; a <= 7; a++) for (let b = a + 1; b <= 7; b++) pairs.push([a, b]);
// Every day of the 2026-27 teaching year.
const everyStart: string[] = [];
for (let d = '2026-08-01'; d < '2027-08-01'; d = addDays(d, 1)) everyStart.push(d);
// A long plan: 120 classes, more than any year can hold on two days a week.
const longPlan = lessons(...Array.from({ length: 120 }, (_, i) => i + 1));

describe('the worked example: Monday and Thursday from 16-Nov-2026', () => {
  const plan = planClasses(longPlan, '2026-11-16', mondayThursday);
  it('starts 16-Nov Monday, 19-Nov Thursday, 23-Nov Monday', () => {
    assert.deepEqual(plan.classes.slice(0, 3).map((c) => c.plannedOn), ['2026-11-16', '2026-11-19', '2026-11-23']);
    assert.equal(formatTrackerDate(plan.classes[0].plannedOn!), '16-Nov-2026 Monday');
    assert.equal(formatTrackerDate(plan.classes[1].plannedOn!), '19-Nov-2026 Thursday');
  });
  it('has 66 class days, the last on 19-Jul-2027 Monday, and the rest do not fit', () => {
    const planned = plan.classes.filter((c) => c.state === 'planned');
    assert.equal(planned.length, 66);
    assert.equal(planned.at(-1)!.plannedOn, '2027-07-19');
    assert.equal(plan.classes.filter((c) => c.state === 'unplaced').length, 120 - 66);
    assert.equal(plan.cutoff, '2027-07-21');
  });
  it('skips 21 Dec–1 Jan and resumes on 4-Jan-2027 Monday', () => {
    assert.equal(dateFor(plan, 1, 10), '2026-12-17');
    assert.equal(dateFor(plan, 1, 11), '2027-01-04');
  });
  it('skips Maundy Thursday 25-Mar-2027 and keeps Easter Monday 29-Mar', () => {
    const march = plan.classes.map((c) => c.plannedOn).filter((d) => d && d >= '2027-03-20' && d <= '2027-04-02');
    assert.deepEqual(march, ['2027-03-22', '2027-03-29', '2027-04-01']);
  });
  it('lists the holidays it skips', () => {
    assert.deepEqual(plan.holidays, [
      { name: 'Christmas', from: '2026-12-21', to: '2027-01-01' },
      { name: 'Easter', from: '2027-03-25', to: '2027-03-28' },
    ]);
  });
});

describe('acceptance criteria', () => {
  it('the first class is the first allowed matching weekday on or after the start (every start × every weekday pair)', () => {
    for (const start of everyStart) {
      for (const pair of pairs) {
        const plan = planClasses(lessons(1), start, pair);
        const first = plan.classes[0].plannedOn ?? plan.cutoff; // no date: nothing allowed before 21 July
        if (first === plan.cutoff) assert.equal(plan.classes[0].state, 'unplaced');
        assert.ok(first >= start, `${start} ${pair}: ${first} is before the start`);
        if (first !== plan.cutoff) {
          assert.ok(pair.includes(weekdayOf(first)), `${start} ${pair}: ${first} is not a chosen weekday`);
          assert.equal(holidayOf(first), null, `${start} ${pair}: ${first} is a holiday`);
        }
        for (let d = start; d < first; d = addDays(d, 1)) {
          assert.ok(!pair.includes(weekdayOf(d)) || holidayOf(d), `${start} ${pair}: ${d} was allowed but skipped`);
        }
      }
    }
  });

  it('repeated Class No. values always receive identical dates (Year 5 Term 1 sample)', () => {
    // The sample's Class No. column: L2+L3 are Class 2, L5+L6 Class 4, L15–L17 Class 10, L26–L31 empty.
    const sample = [1, 2, 2, 3, 4, 4, 5, 6, 7, 7, 8, 8, 9, 9, 10, 10, 10, 11, 11, 12, 12, 13, 14, 14, 15, null, null, null, null, null, null];
    const plan = planClasses(lessons(...sample), '2026-11-16', mondayThursday);
    assert.equal(plan.classes.length, 15);
    const dateOfLesson = sample.map((n) => (n == null ? null : dateFor(plan, 1, n)));
    for (let i = 0; i < sample.length; i++) {
      for (let j = 0; j < sample.length; j++) {
        if (sample[i] != null && sample[i] === sample[j]) assert.equal(dateOfLesson[i], dateOfLesson[j]);
      }
    }
    assert.equal(new Set(dateOfLesson.filter(Boolean)).size, 15, 'different classes get different dates');
    assert.deepEqual(checkPlan(lessons(...sample), datesOf(plan), '2026-11-16', mondayThursday), []);
  });

  it('holiday dates are never assigned (every start × every weekday pair)', () => {
    for (const start of everyStart.filter((_, i) => i % 7 === 0)) {
      for (const pair of pairs) {
        for (const c of planClasses(longPlan, start, pair).classes) {
          if (!c.plannedOn) continue;
          assert.ok(!isChristmas(c.plannedOn) && !isEaster(c.plannedOn), `${start} ${pair}: ${c.plannedOn}`);
        }
      }
    }
  });

  it('handles the year boundary in the 21 Dec – 1 Jan break', () => {
    const p = planClasses(lessons(1, 2, 3, 4), '2026-12-14', mondayThursday);
    assert.deepEqual(p.classes.map((c) => c.plannedOn), ['2026-12-14', '2026-12-17', '2027-01-04', '2027-01-07']);
    // 1 Jan 2027 is a Friday: still a holiday; the next Friday is 8 Jan.
    assert.equal(weekdayOf('2027-01-01'), 5);
    assert.deepEqual(planClasses(lessons(1, 2), '2026-12-18', [5]).classes.map((c) => c.plannedOn), ['2026-12-18', '2027-01-08']);
    // A start inside the break, and the next year's break too.
    assert.equal(planClasses(lessons(1), '2026-12-25', [1]).classes[0].plannedOn, '2027-01-04');
    assert.equal(planClasses(lessons(1), '2027-12-21', [2]).classes[0].plannedOn, '2028-01-04');
    // 2 January is a normal day.
    assert.equal(planClasses(lessons(1), '2027-01-02', [6]).classes[0].plannedOn, '2027-01-02');
    // 20 December is a normal day.
    assert.equal(planClasses(lessons(1), '2027-12-20', [1]).classes[0].plannedOn, '2027-12-20');
  });

  it('works out Easter for each year', () => {
    const known: Record<number, string> = {
      2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2028: '2028-04-16',
      2029: '2029-04-01', 2030: '2030-04-21', 2031: '2031-04-13', 2032: '2032-03-28', 2033: '2033-04-17',
      2034: '2034-04-09', 2035: '2035-03-25',
    };
    for (const [year, sunday] of Object.entries(known)) {
      assert.equal(easterSunday(Number(year)), sunday, String(year));
      const thursday = addDays(sunday, -3);
      assert.equal(weekdayOf(thursday), 4);
      // Every day Thursday–Sunday is skipped; Wednesday before and Monday after are not.
      for (let d = thursday; d <= sunday; d = addDays(d, 1)) assert.ok(isEaster(d), d);
      assert.ok(!isEaster(addDays(thursday, -1)) && !isEaster(addDays(sunday, 1)));
      // A Thursday class that would fall on Maundy Thursday moves to the next Thursday.
      assert.equal(planClasses(lessons(1), thursday, [4]).classes[0].plannedOn, addDays(thursday, 7));
    }
  });

  it('schedules nothing from 21 July onward', () => {
    for (const start of everyStart.filter((_, i) => i % 5 === 0)) {
      const plan = planClasses(longPlan, start, [1, 2, 3, 4, 5, 6, 7]);
      for (const c of plan.classes) if (c.plannedOn) assert.ok(c.plannedOn < plan.cutoff, `${start}: ${c.plannedOn}`);
      assert.ok(plan.cutoff.endsWith('-07-21') && plan.cutoff > start);
    }
    assert.equal(cutoffFor('2027-07-20'), '2027-07-21');
    assert.equal(cutoffFor('2027-07-21'), '2028-07-21');
    // Starting 20 July: only that day fits.
    const lastDay = planClasses(lessons(1, 2), '2027-07-20', [2]);
    assert.deepEqual(lastDay.classes.map((c) => c.state), ['planned', 'unplaced']);
    assert.equal(lastDay.classes[0].plannedOn, '2027-07-20');
    // Starting 21 July plans the next year from its first teaching day.
    assert.equal(planClasses(lessons(1), '2027-07-21', [3]).classes[0].plannedOn, '2027-07-21');
  });

  it('rows without a Class No. do not use up a class date', () => {
    const plan = planClasses(lessons(1, null, null, 2), '2026-11-16', mondayThursday);
    assert.deepEqual(plan.classes.map((c) => [c.classNo, c.plannedOn]), [[1, '2026-11-16'], [2, '2026-11-19']]);
    assert.equal(plan.noClassNo, 2);
  });
});

describe('ordering and scope', () => {
  it('plans Term 1 first, then Term 2, then by Class No. (numbering may restart)', () => {
    const plan = planClasses([
      { term: 2, classNo: 1 }, { term: 1, classNo: 2 }, { term: 1, classNo: 1 }, { term: 3, classNo: 1 },
    ], '2026-11-16', mondayThursday);
    assert.deepEqual(plan.classes.map((c) => classKey(c.term, c.classNo)), ['1:1', '1:2', '2:1', '3:1']);
    assert.deepEqual(plan.classes.map((c) => c.plannedOn), ['2026-11-16', '2026-11-19', '2026-11-23', '2026-11-26']);
  });
  it('gaps in class numbers never use a day', () => {
    assert.equal(dateFor(planClasses(lessons(1, 2, 4), '2026-11-16', mondayThursday), 1, 4), '2026-11-23');
  });
  it('a start date that is a holiday or another weekday moves to the next teaching day', () => {
    assert.equal(planClasses(lessons(1), '2026-11-17', mondayThursday).classes[0].plannedOn, '2026-11-19');
    assert.equal(planClasses(lessons(1), '2027-03-25', mondayThursday).classes[0].plannedOn, '2027-03-29');
  });
  it('"whole year" gives past dates from a past start; "remaining" leaves done classes out', () => {
    const done: TrackerLesson[] = [
      { term: 1, classNo: 1, done: true }, { term: 1, classNo: 2, done: true }, { term: 1, classNo: 2, done: false },
      { term: 1, classNo: 3 },
    ];
    const whole = planClasses(done, '2026-09-07', mondayThursday, 'whole_year');
    assert.deepEqual(whole.classes.map((c) => c.plannedOn), ['2026-09-07', '2026-09-10', '2026-09-14']);
    const rest = planClasses(done, '2026-11-16', mondayThursday, 'remaining');
    assert.deepEqual(rest.classes.map((c) => [c.classNo, c.state, c.plannedOn]),
      [[1, 'done_before', null], [2, 'planned', '2026-11-16'], [3, 'planned', '2026-11-19']]);
  });
  it('one teaching day a week works', () => {
    // Saturdays 21-Nov-2026 to 17-Jul-2027 = 35, less 26-Dec and 27-Mar (holidays) = 33 (the database agrees).
    assert.equal(teachingDays('2026-11-16', [6]).length, 33);
  });
});

describe('checkPlan catches bad plans', () => {
  const ls = lessons(1, 2);
  const bad = (date: string) => checkPlan(ls, new Map([['1:1', '2026-11-16'], ['1:2', date]]), '2026-11-16', mondayThursday);
  it('accepts a good plan', () => assert.deepEqual(bad('2026-11-19'), []));
  it('a date on another weekday', () => assert.match(bad('2026-11-17').join(), /not a selected teaching day/));
  it('a date in Christmas', () => assert.match(bad('2026-12-24').join(), /Christmas/));
  it('a date at Easter', () => assert.match(bad('2027-03-25').join(), /Easter/));
  it('21 July', () => assert.match(bad('2027-07-22').join(), /21 July/));
  it('the same date twice', () => assert.match(bad('2026-11-16').join(), /same date/));
  it('a class missing from the plan', () => {
    assert.match(checkPlan(lessons(1, 2, 3), new Map([['1:1', '2026-11-16']]), '2026-11-16', mondayThursday).join(), /missing/);
  });
});

describe('labels', () => {
  const today = '2026-11-20';
  it('early, on time, late', () => {
    assert.equal(standingLabel(standing('2026-11-19', '2026-11-16', today)), 'Early by 3 days');
    assert.equal(standingLabel(standing('2026-11-19', '2026-11-19', today)), 'On time');
    assert.equal(standingLabel(standing('2026-11-19', '2026-11-20', today)), 'Late by 1 day');
  });
  it('overdue, due today, upcoming, no date', () => {
    assert.equal(standing('2026-11-19', null, today).kind, 'overdue');
    assert.equal(standing('2026-11-20', null, today).kind, 'due_today');
    assert.equal(standing('2026-11-23', null, today).kind, 'upcoming');
    assert.equal(standing(null, '2026-11-19', today).kind, 'none');
  });
  it('dates never shift with the clock change (BST ends 25 Oct 2026, starts 28 Mar 2027)', () => {
    assert.equal(dayNumber('2026-10-26') - dayNumber('2026-10-25'), 1);
    assert.equal(formatTrackerDate('2027-03-28'), '28-Mar-2027 Sunday');
    assert.equal(formatTrackerDate('2026-10-25'), '25-Oct-2026 Sunday');
  });
  it('refuses a date that does not exist', () => assert.throws(() => dayNumber('2027-02-30')));
});

describe('the spreadsheet: Class No. column', () => {
  const header = ['', 'Module', 'Lesson Code', 'Lesson', 'Hw - 1', 'Hw - 2', 'Hw - 3'];
  const rows = [
    ['', 'Number', 'Y5 - T1L1', 'Digits', 'Y5-A001', 'Y5-A002', 'Y5-A003'],
    ['', 'Number', 'Y5 - T1L2', 'Powers of 10', 'Y5-A010', 'Y5-A011', 'Y5-A012'],
    ['', 'Number', 'Y5 - T1L3', 'Climbing', 'Y5-A013', 'Y5-A014', 'Y5-A015'],
  ];
  const sheet = (withClass: boolean, classes: string[] = ['Class 1', 'Class 2', '']) => [{
    name: 'Term 1',
    rows: [['', 'Term 1'], withClass ? [...header, 'Class No.'] : header,
      ...rows.map((r, i) => (withClass ? [...r, classes[i]] : r))],
  }];
  it('reads "Class 1", "class 01", "1" and empty', () => {
    assert.equal(parseClassNo('Class 1'), 1);
    assert.equal(parseClassNo(' class 01 '), 1);
    assert.equal(parseClassNo('12'), 12);
    assert.equal(parseClassNo(''), null);
    assert.equal(parseClassNo('Class A'), undefined);
    assert.equal(parseClassNo('0'), undefined);
    assert.equal(parseClassNo('1.5'), undefined);
  });
  it('keeps the layout and non-date content: the same lessons with and without the column', () => {
    const without = readTermPlan(sheet(false));
    const withIt = readTermPlan(sheet(true));
    assert.deepEqual(withIt.problems, []);
    const withoutClassNo = (lessons: typeof withIt.lessons) => lessons.map((l) => ({ ...l, class_no: null }));
    assert.deepEqual(withoutClassNo(withIt.lessons), without.lessons);
    assert.deepEqual(withIt.lessons.map((l) => l.class_no), [1, 2, null]);
    assert.deepEqual(without.lessons.map((l) => l.class_no), [null, null, null]);
  });
  it('a bad Class No. stops the import; a backwards one and a gap only warn', () => {
    assert.match(readTermPlan(sheet(true, ['Class 1', 'Class X', ''])).problems.join(), /Class No\. must be a number/);
    const warned = readTermPlan(sheet(true, ['Class 4', 'Class 1', 'Class 1']));
    assert.deepEqual(warned.problems, []);
    assert.match(warned.warnings.join(' '), /Class 1 comes after Class 4/);
    assert.match(warned.warnings.join(' '), /no lesson has Class 2–3/);
  });
});

describe('reading a saved tracker', () => {
  const saved = [
    { term: 1, classNo: 1, state: 'planned' as const, plannedOn: '2026-11-16', lessonIds: ['a'] },
    { term: 1, classNo: 2, state: 'planned' as const, plannedOn: '2026-11-19', lessonIds: ['b', 'c'] },
    { term: 1, classNo: 3, state: 'planned' as const, plannedOn: '2026-11-23', lessonIds: ['d'] },
    { term: 1, classNo: 4, state: 'unplaced' as const, plannedOn: null, lessonIds: ['e'] },
  ];
  const lesson = (id: string, classNo: number | null, completedOn: string | null = null, active = true) =>
    ({ id, term: 1, classNo, active, completedOn });
  it('labels lessons and counts classes (a class is done when all its lessons are)', () => {
    const { byLesson, summary } = trackLessons([
      lesson('a', 1, '2026-11-12'), lesson('b', 2, '2026-11-19'), lesson('c', 2, '2026-11-21'), lesson('d', 3), lesson('e', 4),
      lesson('f', null),
    ], saved, '2026-11-24');
    assert.equal(standingLabel(byLesson.get('a')!.standing), 'Early by 4 days');
    assert.equal(byLesson.get('b')!.standing.kind, 'on_time');
    assert.equal(standingLabel(byLesson.get('c')!.standing), 'Late by 2 days');
    assert.equal(byLesson.get('d')!.standing.kind, 'overdue');
    assert.equal(byLesson.get('e')!.note, 'unplaced');
    assert.equal(byLesson.get('f')!.note, 'no_class');
    assert.deepEqual([summary.due, summary.doneOfDue, summary.early, summary.late, summary.overdue, summary.unplaced, summary.changed],
      [3, 2, 1, 1, 1, 1, 0]);
    assert.equal(summaryLine(summary, { startOn: '2026-11-16', weekdays: [4, 1] }),
      "Tracker (Mon, Thu from 16-Nov-2026 Monday): 2 of 3 classes due so far done (1 early, 1 late) · 1 overdue · 1 don't fit before 21 Jul");
  });
  it('tells "added later", "moved" and "removed" apart from "did not fit"', () => {
    const { byLesson, summary } = trackLessons([
      lesson('a', 1), lesson('b', 3), lesson('c', 2), lesson('d', 3), lesson('e', 4), lesson('g', 5), lesson('x', null, null, false),
    ], saved, '2026-11-10');
    assert.equal(byLesson.get('b')!.changed, true, 'b moved from Class 2 to Class 3');
    assert.equal(byLesson.get('g')!.note, 'added');
    assert.equal(byLesson.get('e')!.changed, false, 'e simply did not fit');
    assert.equal(byLesson.get('x')!.note, 'removed');
    assert.equal(summary.changed, 2);
  });
});

describe('standing colours', () => {
  it('is green when completed early or on its date, red when late or overdue', () => {
    assert.equal(standingTone(standing('2026-11-19', '2026-11-16', '2026-11-20')), 'good');
    assert.equal(standingTone(standing('2026-11-19', '2026-11-19', '2026-11-20')), 'good');
    assert.equal(standingTone(standing('2026-11-19', '2026-11-23', '2026-11-24')), 'bad');
    assert.equal(standingTone(standing('2026-11-19', null, '2026-11-20')), 'bad');
    assert.equal(standingTone(standing('2026-11-19', null, '2026-11-19')), null);
    assert.equal(standingTone(standing('2026-11-19', null, '2026-11-10')), null);
  });
});

describe("the student's Lesson Plan tab", () => {
  const lesson = (id: string, term: number, classNo: number | null, active = true) =>
    ({ id, term, module: 'Number', code: id.toUpperCase(), name: `Lesson ${id}`, class_no: classNo, active });
  const plan: StudentPlanClass = {
    lessons: [lesson('a', 1, 1), lesson('b', 1, 1), lesson('c', 1, 2), lesson('d', 1, null), lesson('e', 1, 3, false), lesson('f', 1, 4, false), lesson('g', 2, 1)],
    progress: [
      { lesson_id: 'a', status: 'complete', completed_on: '2026-11-16' },
      { lesson_id: 'b', status: 'complete', completed_on: '2026-11-18' },
      { lesson_id: 'c', status: 'in_progress', completed_on: null },
      { lesson_id: 'e', status: 'complete', completed_on: '2026-11-10' },
    ],
    classes: [
      { term: 1, class_no: 1, state: 'planned', planned_on: '2026-11-16', lesson_ids: ['a', 'b'] },
      { term: 1, class_no: 2, state: 'planned', planned_on: '2026-11-19', lesson_ids: ['c'] },
      { term: 2, class_no: 1, state: 'unplaced', planned_on: null, lesson_ids: ['g'] },
    ],
  };
  const rows = studentPlanRows(plan, '2026-11-20');
  const row = (id: string) => rows.find((r) => r.id === id)!;

  it('keeps plan order and drops a removed lesson the class never worked on', () => {
    assert.deepEqual(rows.map((r) => r.id), ['a', 'b', 'c', 'd', 'e', 'g']);
  });
  it('gives lessons with the same Class No. the same date, and none to lessons without one', () => {
    assert.equal(row('a').plannedOn, '2026-11-16');
    assert.equal(row('b').plannedOn, '2026-11-16');
    assert.equal(row('d').plannedOn, null);
    assert.equal(row('g').plannedOn, null);
  });
  it('colours only completed lessons: green on the date, red after it', () => {
    assert.equal(row('a').tone, 'good');
    assert.equal(row('b').tone, 'bad');
    assert.equal(row('c').tone, null);
    assert.equal(row('c').status, 'in_progress');
    assert.equal(row('d').status, 'not_started');
  });
  it('shows a removed lesson the class completed, without a date', () => {
    assert.deepEqual([row('e').status, row('e').completedOn, row('e').plannedOn], ['complete', '2026-11-10', null]);
  });
  it('shows the plan without dates before a tracker is set', () => {
    const noTracker = studentPlanRows({ ...plan, classes: [] }, '2026-11-20');
    assert.equal(noTracker.length, 6);
    assert.ok(noTracker.every((r) => r.plannedOn === null && r.tone === null));
    assert.equal(noTracker[0].status, 'complete');
  });
  it('is empty for a class with no lesson plan', () => {
    assert.deepEqual(studentPlanRows({ lessons: [], progress: [], classes: [] }, '2026-11-20'), []);
  });
});

describe('term tabs', () => {
  const l = (term: number, done: boolean, active = true) => ({ term, done, active });
  it('counts done lessons per term, in term order', () => {
    assert.deepEqual(termTabs([l(2, false), l(1, true), l(1, false)]).terms,
      [{ term: 1, done: 1, total: 2 }, { term: 2, done: 0, total: 1 }]);
  });
  it('opens the term asked for, if it exists', () => {
    assert.equal(termTabs([l(1, false), l(2, false)], '2').current, 2);
    assert.equal(termTabs([l(1, false), l(2, false)], '7').current, 1);
    assert.equal(termTabs([l(1, false), l(2, false)], 'abc').current, 1);
  });
  it("otherwise opens the term of the class's next lesson, skipping removed lessons", () => {
    assert.equal(termTabs([l(1, true), l(1, false, false), l(2, true), l(3, false)]).current, 3);
  });
  it('opens the last term when everything is done, and copes with no lessons', () => {
    assert.equal(termTabs([l(1, true), l(2, true)]).current, 2);
    assert.deepEqual(termTabs([]), { terms: [], current: 1 });
  });
});
