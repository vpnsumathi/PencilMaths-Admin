import 'server-only';

// The app's connection to Google (Drive and Classroom), with the owner's one-time permission: a refresh token
// made once in the OAuth Playground (guide 05, and guide 21 section 11 for Classroom). Server only.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let cached: { token: string; expires: number } | null = null;

// Swaps the long-lived refresh token for a short-lived access token (about 1 hour),
// and reuses it until it is close to expiring.
export async function accessToken() {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
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
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`);
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

// Sends a request to Google with a fresh access token. If Google says it is busy (429), or has a hiccup
// (5xx) on a request that is safe to repeat (reading, changing, deleting), waits under a second and tries
// once more. Creating something is not repeated after a 5xx, as Google may have made it anyway.
// The body must be reusable (string or Blob).
export async function send(url: string, init: RequestInit = {}) {
  const repeatable = !init.method || ['GET', 'PATCH', 'DELETE'].includes(init.method);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${await accessToken()}`, ...init.headers },
      cache: 'no-store',
    });
    if (attempt === 0 && (res.status === 429 || (repeatable && [500, 502, 503, 504].includes(res.status)))) {
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
      continue;
    }
    return res;
  }
}
