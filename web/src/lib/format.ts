// Small helpers for showing values on screen.
import { yearLabel } from './options';

// "2026-10-07" → "7 Oct 2026". Date-only values are read as UTC so they never shift by a day.
export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// A moment ("2026-11-03T23:30:00+00:00") → the date it was in the UK, "3 Nov 2026".
export function formatDay(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
}

// ---------- Clock times ----------
// Every time on screen uses the 12-hour clock, "4:30 PM" (decided 18 Nov 2026). The database and the app's own
// logic keep 24-hour times ("16:30"): only what is shown is changed, here, in one place.

// "16:05" or "16:05:00" → "4:05 PM". Anything that isn't a clock time comes back as it was.
export function clock12(time: string | null | undefined) {
  if (!time) return '';
  const m = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

// Every 24-hour time inside a text, such as a message from the database ("Tom already teaches Monday 16:00"),
// changed to the 12-hour clock ("… Monday 4:00 PM"). Times already followed by AM or PM are left alone.
export function times12(text: string): string;
export function times12(text: string | null | undefined): string | null | undefined;
export function times12(text: string | null | undefined) {
  if (!text) return text;
  return text.replace(/(?<![\d:.])([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?![\d:]|\s?[AaPp]\.?[Mm])/g, (_, h, m) => clock12(`${h}:${m}`));
}

// A moment → the UK clock time, 24-hour "17:02", for sorting and comparing (not for showing).
export function ukTime24(value: string | Date) {
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' });
}

// A moment → the clock time it was in the UK, "5:02 PM".
export function formatClock(value: string | null | undefined) {
  return value ? clock12(ukTime24(value)) : '';
}

// A class time "17:00:00" → "5:00 PM", for showing.
export function formatTime(value: string | null | undefined) {
  return value ? clock12(value) : '';
}

// A class time "17:00:00" → "17:00", the value an <input type="time"> needs (the browser shows it its own way).
export function inputTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : '';
}

export function formatPercent(value: number | null | undefined) {
  return value == null ? '—' : `${value}%`;
}

export function yearRange(min: number | null, max: number | null) {
  if (min && max) return min === max ? yearLabel(min) : `${yearLabel(min)} to ${yearLabel(max)}`;
  if (min) return `${yearLabel(min)} and above`;
  if (max) return `Up to ${yearLabel(max)}`;
  return '—';
}
