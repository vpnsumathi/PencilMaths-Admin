import 'server-only';
import { GOOGLE_TIMEOUT_MS, send } from './auth';
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
export type ConferenceRecord = { name: string; startTime?: string; endTime?: string };
type RawParticipant = {
  name: string; earliestStartTime?: string; latestEndTime?: string;
  signedinUser?: { user?: string; displayName?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(`${API}${path}`, init.body ? { ...init, headers: { 'Content-Type': 'application/json' } } : init, GOOGLE_TIMEOUT_MS);
  const raw = await res.text();
  let body: { error?: { status?: string; message?: string } } & Record<string, unknown> = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* not JSON: keep the status only */ }
  if (!res.ok) throw new GoogleError(res.status, body.error?.status ?? '', body.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

export const createSpace = () =>
  call<Space>('/spaces', { method: 'POST', body: JSON.stringify({ config: { accessType: MEET_ACCESS } }) });

// Closes a room the app made, for Recreate room: from now on only invited people can get in without knocking (the
// app invites nobody, and its account never joins to let anyone in), and a call still going on in it is ended.
// Returns false if Google refused (the old link may then still work); the new room is used either way.
export async function retireSpace(spaceName: string): Promise<boolean> {
  try {
    await call<Space>(`/${spaceName}?${new URLSearchParams({ updateMask: 'config.accessType' })}`,
      { method: 'PATCH', body: JSON.stringify({ config: { accessType: 'RESTRICTED' } }) });
  } catch (e) {
    console.error('Closing the old Meet room:', e);
    return false;
  }
  // Google answers with an error when no call is going on, which is fine.
  await call(`/${spaceName}:endActiveConference`, { method: 'POST', body: '{}' }).catch(() => undefined);
  return true;
}

// The room as Google has it now (its current link). spaceName is "spaces/…".
export const getSpace = (spaceName: string) => call<Space>(`/${spaceName}`);

// Every call in the room that was going on at some point between `from` and `to` (ISO times), oldest first.
// A call ends when everyone has left, and the next person to join starts a new one, so one class can have several
// (the teacher's laptop drops and everyone else had already gone). Asks for calls started from 12 hours before
// `from` (at most 50), then keeps those that hadn't ended by `from` and had started by `to`.
// The call's name is "conferenceRecords/…"; each person in it is "conferenceRecords/…/participants/…".
export async function classCalls(spaceName: string, from: string, to: string): Promise<ConferenceRecord[]> {
  const since = new Date(new Date(from).getTime() - 12 * 3600_000).toISOString();
  const found = await call<{ conferenceRecords?: ConferenceRecord[] }>(`/conferenceRecords?${new URLSearchParams({
    filter: `space.name = "${spaceName}" AND start_time >= "${since}"`, pageSize: '50',
  })}`);
  const [start, end] = [Date.parse(from), Date.parse(to)];
  return (found.conferenceRecords ?? [])
    .filter((c) => c.startTime && Date.parse(c.startTime) <= end && (!c.endTime || Date.parse(c.endTime) >= start))
    .sort((a, b) => Date.parse(a.startTime!) - Date.parse(b.startTime!));
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
        participantId: p.name,
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

// Each stretch one person was in a call (they get a new one every time they rejoin), oldest first: for the
// teacher's minutes in the class and how many times they dropped out. participantName: "conferenceRecords/…/participants/…".
export async function participantSessions(participantName: string): Promise<{ startTime: string; endTime: string | null }[]> {
  const stretches: { startTime: string; endTime: string | null }[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const query = new URLSearchParams({ pageSize: '100', ...(pageToken ? { pageToken } : {}) });
    const found = await call<{ participantSessions?: { startTime?: string; endTime?: string }[]; nextPageToken?: string }>(
      `/${participantName}/participantSessions?${query}`);
    for (const s of found.participantSessions ?? []) if (s.startTime) stretches.push({ startTime: s.startTime, endTime: s.endTime ?? null });
    pageToken = found.nextPageToken;
    if (!pageToken) break;
  }
  return stretches.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
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
  if (e instanceof Error && e.name === 'TimeoutError') return 'Google Meet didn\'t answer in time. Please try again.';
  if (e instanceof GoogleError) return `Google Meet said: ${message.slice(0, 200)}`;
  return 'Could not reach Google Meet. Please try again.';
}
