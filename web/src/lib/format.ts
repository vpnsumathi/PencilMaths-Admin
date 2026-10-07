// Small helpers for showing values on screen.

// "2026-10-07" → "7 Oct 2026". Date-only values are read as UTC so they never shift by a day.
export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// "17:00:00" → "17:00"
export function formatTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : '';
}

export function formatPercent(value: number | null | undefined) {
  return value == null ? '—' : `${value}%`;
}

export function yearRange(min: number | null, max: number | null) {
  if (min && max) return min === max ? `Year ${min}` : `Years ${min}–${max}`;
  if (min) return `Year ${min}+`;
  if (max) return `Up to Year ${max}`;
  return '—';
}
