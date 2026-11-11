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

// A moment → the clock time it was in the UK, "17:02".
export function formatClock(value: string | null | undefined) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' });
}

// "17:00:00" → "17:00"
export function formatTime(value: string | null | undefined) {
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
