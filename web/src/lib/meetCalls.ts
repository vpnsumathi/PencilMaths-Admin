import 'server-only';
import { callPeople, classCalls, meetProblem } from '@/lib/google/meet';
import type { InCall, MeetCall } from '@/lib/liveClass';
import { withinTime } from '@/lib/withinTime';

// What Google Meet saw in one class (guide 21, sections 12 and 15): every call in the class's room that was going on
// at some point in its check-in time (a call ends when everyone leaves, and the next person starts a new one), and
// everyone in those calls. Shared by the Class Schedule, the extra class page and the check-in from Meet.
// Kept for 20 seconds per server copy (also a failure, so a Google problem isn't asked again on every view).
// Best-effort: on Vercel each running copy has its own memory, so several copies may each ask Google once.
export type CallsAnswer = { ok: true; calls: MeetCall[]; people: InCall[] } | { ok: false; problem: string };

const kept = new Map<string, { at: number; answer: CallsAnswer }>();
const KEEP_SECONDS = 20;
// One class's questions to Google (its calls, then who was in each) give up together after this long.
export const CLASS_LIMIT_MS = 10_000;

// opens / closes: the class's check-in time. People who had already left before it opened (an earlier class in a
// call still going on) are left out. fresh: ask Google now (Refresh from Meet).
export async function classCallPeople(space: string, opens: Date, closes: Date, fresh = false): Promise<CallsAnswer> {
  const key = `${space}|${opens.toISOString()}|${closes.toISOString()}`;
  const hit = kept.get(key);
  if (!fresh && hit && Date.now() - hit.at < KEEP_SECONDS * 1000) return hit.answer;
  let answer: CallsAnswer;
  try {
    const { calls, lists } = await withinTime((async () => {
      const found = await classCalls(space, opens.toISOString(), closes.toISOString());
      return { calls: found, lists: await Promise.all(found.map((c) => callPeople(c.name))) };
    })(), CLASS_LIMIT_MS);
    const from = opens.getTime();
    answer = { ok: true, calls, people: lists.flat().filter((p) => !p.leftAt || Date.parse(p.leftAt) >= from) };
  } catch (e) {
    console.error('Google Meet check:', e);
    answer = { ok: false, problem: meetProblem(e) };
  }
  if (kept.size > 200) kept.clear();
  kept.set(key, { at: Date.now(), answer });
  return answer;
}
