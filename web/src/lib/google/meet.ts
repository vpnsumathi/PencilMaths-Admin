import 'server-only';
import { send } from './auth';
import type { InCall } from '@/lib/liveClass';
import { GoogleError } from './classroom';

// Talks to Google Meet with the app's Google account (the same one as Drive and Classroom). Needs the Meet API
// switched on and the meetings.space.created permission in the refresh token (guide 21, section 12).
// The app can only see calls in rooms it made itself, which is why each batch gets a room made by the app.

const API = 'https://meet.googleapis.com/v2';

// Who can join without knocking. OPEN: anyone with the link (tested on Staging 14 Nov 2026). TRUSTED: your
// Workspace's people and invited guests; outside students would have to knock and be let in by the room's host.
export const MEET_ACCESS = 'OPEN' as const;

export type Space = { name: string; meetingUri?: string; meetingCode?: string; config?: { accessType?: string } };
type ConferenceRecord = { name: string; startTime?: string; endTime?: string };
type RawParticipant = {
  name: string; earliestStartTime?: string; latestEndTime?: string;
  signedinUser?: { user?: string; displayName?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(`${API}${path}`, init.body ? { ...init, headers: { 'Content-Type': 'application/json' } } : init);
  const raw = await res.text();
  let body: { error?: { status?: string; message?: string } } & Record<string, unknown> = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* not JSON: keep the status only */ }
  if (!res.ok) throw new GoogleError(res.status, body.error?.status ?? '', body.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

export const createSpace = () =>
  call<Space>('/spaces', { method: 'POST', body: JSON.stringify({ config: { accessType: MEET_ACCESS } }) });

// The room as Google has it now (its current link). spaceName is "spaces/…".
export const getSpace = (spaceName: string) => call<Space>(`/${spaceName}`);

// The room's most recent call, or null if nobody has ever started one.
export async function latestCall(spaceName: string): Promise<ConferenceRecord | null> {
  const found = await call<{ conferenceRecords?: ConferenceRecord[] }>(
    `/conferenceRecords?${new URLSearchParams({ filter: `space.name = "${spaceName}"`, pageSize: '1' })}`);
  return found.conferenceRecords?.[0] ?? null;
}

// Everyone who has been in a call (at most 500, five pages): in it now when leftAt is null.
export async function callPeople(conferenceName: string): Promise<InCall[]> {
  const people: InCall[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const query = new URLSearchParams({ pageSize: '100', ...(pageToken ? { pageToken } : {}) });
    const found = await call<{ participants?: RawParticipant[]; nextPageToken?: string }>(`/${conferenceName}/participants?${query}`);
    for (const p of found.participants ?? []) {
      people.push({
        googleId: p.signedinUser?.user?.replace(/^users\//, '') ?? null,
        name: p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? p.phoneUser?.displayName ?? 'Someone',
        kind: p.signedinUser ? 'signed_in' : p.phoneUser ? 'phone' : 'anonymous',
        joinedAt: p.earliestStartTime ?? null,
        leftAt: p.latestEndTime ?? null,
      });
    }
    pageToken = found.nextPageToken;
    if (!pageToken) break;
  }
  return people;
}

// A Meet problem in plain words.
export function meetProblem(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(message)) {
    return 'The app\'s Google connection doesn\'t include Google Meet yet. Renew it as guide 21, section 12 shows.';
  }
  if (/has not been used in project|is disabled|SERVICE_DISABLED/i.test(message)) {
    return 'The Google Meet API is switched off. Turn it on in Google Cloud (guide 21, section 12).';
  }
  if (/Google sign-in failed/i.test(message)) return 'The app couldn\'t sign in to Google. The Google connection may need renewing.';
  if (e instanceof GoogleError && e.status === 404) return 'Google can\'t find this Meet room any more. Press Recreate room on the batch page.';
  if (e instanceof GoogleError && e.status === 429) return 'Google is busy. Please try again in a minute.';
  if (e instanceof GoogleError) return `Google Meet said: ${message.slice(0, 200)}`;
  return 'Could not reach Google Meet. Please try again.';
}
