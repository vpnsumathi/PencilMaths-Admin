// The student home page's working out (Help/12, section 3.2), kept apart from the database and the page so it can
// be tested on its own (model.test.ts, npm test): the greeting, the "Up next" card, the week strip, what is coming
// up, the to-do order and the corrected percentages. All times are UK times.
// The data comes from my_dashboard() (classes, times, homework counts) and my_home()
// (supabase/migrations/20261123000001_student_home.sql).

import type { ClassWindow } from '../../../../lib/classLink';
import type { MyExtra } from '../../../../lib/extraClasses';
import { clock12 } from '../../../../lib/format.ts';
import { ukMoment, ukNow } from '../../../../lib/liveClass.ts';
import type { StudentClass } from '../dashboard';

// ---------- What my_home() sends ----------
export type HomeToDo = { sheet_id: string; title: string; subject: string; due_on: string | null; overdue: boolean };
export type HomeDue = { due_on: string; title: string; subject: string };
export type NextLesson = {
  batch_id: string; code: string | null; name: string; class_no: number | null;
  status: 'not_started' | 'in_progress'; planned_on: string | null;
};
export type HomeNote = { id: string; title: string; subject: string | null; created_at: string; for_you: boolean };
export type Home = {
  to_do: HomeToDo[]; to_do_total: number; due_week: HomeDue[]; extras: MyExtra[];
  next_lessons: NextLesson[]; notes: HomeNote[]; window: ClassWindow;
};

const DAY = 86_400_000;
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// "2026-11-20" plus days → "2026-11-22".
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const dateText = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
// "Thursday 20 November"
export const longDate = (date: string) => dateText(date, { weekday: 'long', day: 'numeric', month: 'long' });
// "Tue 18 Nov"
export const shortDate = (date: string) => dateText(date, { weekday: 'short', day: 'numeric', month: 'short' });
// A moment → its UK date, "2026-11-20".
export const ukDateOf = (iso: string) => ukNow(new Date(iso)).date;
// A moment → its UK clock time, "4:00 PM".
export const ukClockOf = (iso: string) => {
  const m = ukNow(new Date(iso)).minute;
  return clock12(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
};

// "Good morning", "Good afternoon" (from 12:00) or "Good evening" (from 17:00), by the UK clock.
export function greeting(now = new Date()) {
  const m = ukNow(now).minute;
  return m < 12 * 60 ? 'Good morning' : m < 17 * 60 ? 'Good afternoon' : 'Good evening';
}

// How long until a start: "in 8 minutes", "in 2 hours", "tomorrow", "in 3 days"; "now" once started.
export function startsIn(start: Date, now = new Date()) {
  const minutes = Math.ceil((start.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const today = ukNow(now).date;
  const day = ukDateOf(start.toISOString());
  if (day === today) {
    const hours = Math.round(minutes / 60);
    return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

// "Today", "Tomorrow" or "Saturday 22 November", for a UK date.
export function dayName(date: string, now = new Date()) {
  const today = ukNow(now).date;
  return date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : longDate(date);
}

// ---------- Every class coming up ----------
// state: "open" while check-in is open (from before_minutes before the start; "started" once it has begun),
// "next" before that. A weekly class stays open until after_minutes after its start; an extra class until it ends.
export type Upcoming =
  | { kind: 'class'; cls: StudentClass; date: string; time: string; start: Date; open: boolean; started: boolean }
  | { kind: 'extra'; extra: MyExtra; date: string; time: string; start: Date; open: boolean; started: boolean };

// The next time of each weekly class time (today's counts until its check-in closes), and every extra class that
// hasn't ended, soonest first. Classes with no times are left out.
export function upcoming(classes: StudentClass[], extras: MyExtra[], window: ClassWindow, now = new Date()): Upcoming[] {
  const uk = ukNow(now);
  const list: Upcoming[] = [];
  for (const cls of classes) {
    for (const t of cls.times) {
      const time = t.start_time.slice(0, 5);
      const startMinute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
      let days = (t.weekday - uk.weekday + 7) % 7;
      if (days === 0 && uk.minute > startMinute + window.after_minutes) days = 7;
      const date = addDays(uk.date, days);
      const open = days === 0 && uk.minute >= startMinute - window.before_minutes;
      list.push({ kind: 'class', cls, date, time, start: ukMoment(date, time), open, started: open && uk.minute >= startMinute });
    }
  }
  for (const extra of extras) {
    if (extra.cancelled || Date.parse(extra.ends_at) < now.getTime()) continue;
    const start = new Date(extra.starts_at);
    list.push({
      kind: 'extra', extra, date: ukDateOf(extra.starts_at), time: ukClockOf(extra.starts_at), start,
      open: extra.in_window, started: extra.in_window && start.getTime() <= now.getTime(),
    });
  }
  return list.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// The "Up next" card: a class whose check-in is open comes first (the earliest of them), otherwise the soonest.
export function pickHero(list: Upcoming[]) {
  return list.find((u) => u.open) ?? list[0] ?? null;
}

// The extra class to show under the card: the soonest one in the next 7 days that isn't the card itself.
export function nextExtra(list: Upcoming[], hero: Upcoming | null, now = new Date()) {
  return list.find((u) => u.kind === 'extra' && u !== hero && u.start.getTime() < now.getTime() + 7 * DAY) as
    Extract<Upcoming, { kind: 'extra' }> | undefined;
}

// The next moment the page should change by itself: a check-in opening or closing, within the next 24 hours.
export function nextChange(list: Upcoming[], window: ClassWindow, now = new Date()) {
  const times: number[] = [];
  for (const u of list) {
    const start = u.start.getTime();
    if (u.kind === 'class') {
      times.push(start - window.before_minutes * 60_000, start, start + window.after_minutes * 60_000);
    } else {
      times.push(Date.parse(u.extra.opens_at), start, Date.parse(u.extra.ends_at));
    }
  }
  const future = times.filter((t) => t > now.getTime() && t < now.getTime() + DAY).sort((a, b) => a - b);
  return future.length > 0 ? new Date(future[0] + 1000).toISOString() : null; // a second after, so the page has moved on
}

// ---------- The week strip ----------
export type WeekDay = {
  date: string; label: string; day: number; today: boolean; past: boolean;
  hasClass: boolean; hasHomework: boolean; hasExtra: boolean;
};

// Monday to Sunday of this week (UK), with dots for weekly classes, Assigned homework due and extra classes.
export function weekStrip(classes: StudentClass[], dueWeek: HomeDue[], extras: MyExtra[], now = new Date()): WeekDay[] {
  const uk = ukNow(now);
  const monday = addDays(uk.date, 1 - uk.weekday);
  const classDays = new Set(classes.flatMap((c) => c.times.map((t) => t.weekday)));
  const dueDays = new Set(dueWeek.map((d) => d.due_on));
  const extraDays = new Set(extras.filter((x) => !x.cancelled).map((x) => ukDateOf(x.starts_at)));
  return WEEKDAY_SHORT.map((label, i) => {
    const date = addDays(monday, i);
    return {
      date, label, day: Number(date.slice(8, 10)), today: date === uk.date, past: date < uk.date,
      hasClass: classDays.has(i + 1), hasHomework: dueDays.has(date), hasExtra: extraDays.has(date),
    };
  });
}

// ---------- Small helpers ----------
// The mark as a percentage, or null when there is no mark or no maximum.
export function percent(mark: number | null, max: number | null) {
  if (mark == null || !max || max <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((mark / max) * 100)));
}

// A class's weekly times in words: "Tue and Thu, 5:00 PM" when they share a time, else "Tue 5:00 PM, Thu 6:00 PM".
export function timesText(times: StudentClass['times']) {
  if (times.length === 0) return 'Times to be confirmed';
  const sorted = [...times].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  const same = sorted.every((t) => t.start_time.slice(0, 5) === sorted[0].start_time.slice(0, 5));
  if (same) {
    const days = sorted.map((t) => WEEKDAY_SHORT[t.weekday - 1]);
    const list = days.length === 1 ? days[0] : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
    return `${list}, ${clock12(sorted[0].start_time)}`;
  }
  return sorted.map((t) => `${WEEKDAY_SHORT[t.weekday - 1]} ${clock12(t.start_time)}`).join(', ');
}

// A note added in the last 7 days counts as new.
export const isNew = (createdAt: string, now = new Date()) => now.getTime() - Date.parse(createdAt) < 7 * DAY;
