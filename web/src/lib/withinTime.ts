// Gives up waiting for `work` after `ms` (guide 21, section 15): an overall time limit for one class's questions to
// Google, on top of each request's own 8 seconds (lib/google/auth.ts), so a slow Google never holds a page for long.
// The work itself carries on in the background and is bounded by those per-request limits.
// Rejects with an error named "TimeoutError", like a timed-out request, so meetProblem() and classroomProblem()
// put it in plain words.
export function withinTime<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`No answer within ${ms} ms`);
      e.name = 'TimeoutError';
      reject(e);
    }, ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

// Truncated exponential backoff, as Google recommends for busy or quota errors: about 1, 2, 4, 8… seconds plus up
// to 1 second at random, never more than maxMs. attempt counts from 0. Only for background work (the nightly check).
export function backoffMs(attempt: number, maxMs = 16_000, random = Math.random) {
  return Math.min(2 ** attempt * 1000 + Math.floor(random() * 1000), maxMs);
}
