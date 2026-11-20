// The Homework Tracker's address: ?year=5&batch=…&student=…&scope=all&sy=2025&term=1&show=corrected (guide 26).
// sy = the school year shown (2025 = 2025-26); left out = the default (this school year, guide 27).
import { UUID, YEARS } from '@/lib/options';

export type TrackerQuery = {
  year: number | null; batch: string | null; student: string | null;
  scope: 'batch' | 'all'; sy: number | null; term: number | null; show: string | null;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

// The page's address for a view: ?year=5&batch=…&student=…&scope=all&sy=2025&term=1&show=corrected. Empty parts are left out.
export function trackerHref(q: TrackerQuery, change: Partial<TrackerQuery> = {}, hash = '') {
  const v = { ...q, ...change };
  const p = new URLSearchParams();
  if (v.year) p.set('year', String(v.year));
  if (v.batch) p.set('batch', v.batch);
  if (v.student) p.set('student', v.student);
  if (v.student && v.scope === 'all') p.set('scope', 'all');
  if (v.sy) p.set('sy', String(v.sy));
  if (!v.student && v.term != null) p.set('term', String(v.term));
  if (v.student && v.show) p.set('show', v.show);
  const s = p.toString();
  return `/homework-tracker${s ? `?${s}` : ''}${hash}`;
}

export function readQuery(q: Record<string, string | string[] | undefined>): TrackerQuery {
  const year = Number(one(q.year));
  const term = one(q.term);
  const sy = Number(one(q.sy));
  return {
    year: YEARS.includes(year) ? year : null,
    batch: UUID.test(one(q.batch)) ? one(q.batch) : null,
    student: UUID.test(one(q.student)) ? one(q.student) : null,
    scope: one(q.scope) === 'all' ? 'all' : 'batch',
    sy: Number.isInteger(sy) && sy >= 2000 && sy <= 2100 ? sy : null,
    term: /^[0-3]$/.test(term) ? Number(term) : null,
    show: one(q.show) || null,
  };
}

