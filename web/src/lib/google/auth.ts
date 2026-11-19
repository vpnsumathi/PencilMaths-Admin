import 'server-only';

// The app's connection to Google (Drive and Classroom), with the owner's one-time permission: a refresh token
// made once in the OAuth Playground (guide 05, and guide 21 section 11 for Classroom). Server only.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// How long the app waits for Google before giving up (so a slow Google never holds a page for long).
// A timed-out request throws an error named "TimeoutError" (see meetProblem).
export const GOOGLE_TIMEOUT_MS = 8_000;

let cached: { token: string; expires: number } | null = null;
let asking: Promise<string> | null = null; // the token request under way, shared by everyone who needs one now

// Swaps the long-lived refresh token for a short-lived access token (about 1 hour),
// and reuses it until it is close to expiring. Several requests at once share one token request.
export async function accessToken() {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  asking ??= newToken().finally(() => { asking = null; });
  return asking;
}

async function newToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`);
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

// Sends a request to Google with a fresh access token. If Google says it is busy (429), or has a hiccup
// (5xx) on a request that is safe to repeat (reading, changing, deleting), waits under a second and tries
// once more. Creating something is not repeated after a 5xx, as Google may have made it anyway.
// The body must be reusable (string or Blob). timeoutMs: each try gives up after that long (Meet and Classroom pass
// GOOGLE_TIMEOUT_MS; Drive passes nothing, as uploading or opening a large file can take longer).
export async function send(url: string, init: RequestInit = {}, timeoutMs?: number) {
  const repeatable = !init.method || ['GET', 'PATCH', 'DELETE'].includes(init.method);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken()}`, ...init.headers },
      cache: 'no-store',
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    if (attempt === 0 && (res.status === 429 || (repeatable && [500, 502, 503, 504].includes(res.status)))) {
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
      continue;
    }
    return res;
  }
}
