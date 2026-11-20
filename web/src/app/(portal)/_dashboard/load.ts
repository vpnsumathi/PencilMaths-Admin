import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { SummaryData, TodayData } from './model';

// The Dashboard's two data calls (guide 28). The page starts both at once, without waiting, and each part of the
// page waits for its own inside <Suspense>, so the header shows straight away. Each call returns one small JSON
// answer worked out in the database (20261121000001_dashboard_summary.sql); nothing here asks Google.

export const SCRIPT = '20261121000001_dashboard_summary.sql';

// ok false: notSetUp when the script hasn't been run on this database yet (the page says so, never shows zeros).
export type Loaded<T> = { ok: true; data: T } | { ok: false; notSetUp: boolean };

async function call<T>(fn: 'dashboard_today' | 'dashboard_summary'): Promise<Loaded<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn);
  if (error) {
    const notSetUp = error.code === 'PGRST202';
    if (!notSetUp) console.error(`Dashboard (${fn}):`, error.message);
    return { ok: false, notSetUp };
  }
  return { ok: true, data: data as T };
}

export const loadToday = () => call<TodayData>('dashboard_today');
export const loadSummary = () => call<SummaryData>('dashboard_summary');
