import 'server-only';
import { send } from './auth';

// Talks to Google Classroom with the same Google account as Drive (the class owner is always that account, so a
// class stays with Pencil Maths when a teacher leaves). Needs the Classroom permissions in the refresh token
// (guide 21, section 11). Only the few calls the Create Google Classroom button uses.

const API = 'https://classroom.googleapis.com/v1';

export type Course = {
  id: string;
  name: string;
  courseState: string; // PROVISIONED (waiting to be accepted), ACTIVE, ARCHIVED, DECLINED, SUSPENDED
  alternateLink?: string;
  enrollmentCode?: string;
};

// An answer from Google that wasn't a success, with its HTTP status and Google's status word (ALREADY_EXISTS…).
export class GoogleError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string, message: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(`${API}${path}`, init.body ? { ...init, headers: { 'Content-Type': 'application/json' } } : init);
  const raw = await res.text();
  let body: { error?: { status?: string; message?: string } } & Record<string, unknown> = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* not JSON: keep the status only */ }
  if (!res.ok) throw new GoogleError(res.status, body.error?.status ?? '', body.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}
const id = (value: string) => encodeURIComponent(value);
const missing = (e: unknown) => e instanceof GoogleError && e.status === 404;
const exists = (e: unknown) => e instanceof GoogleError && (e.status === 409 || e.reason === 'ALREADY_EXISTS');

export const getCourse = (courseIdOrAlias: string) => call<Course>(`/courses/${id(courseIdOrAlias)}`);

// Creates the class with our own fixed id (the alias). If Google already has a class with that alias (a second
// press, or a retry after a timeout where Google made it anyway), Google says ALREADY_EXISTS and we use that one.
// No courseState is sent: Google doesn't let a personal Gmail account make a class ACTIVE straight away.
export async function createCourse(c: { alias: string; name: string; section: string }): Promise<Course> {
  try {
    return await call<Course>('/courses', {
      method: 'POST',
      body: JSON.stringify({ id: c.alias, name: c.name, section: c.section, ownerId: 'me' }),
    });
  } catch (e) {
    if (exists(e)) return getCourse(c.alias);
    throw e;
  }
}

// Asks Google to make a class that is waiting to be accepted (PROVISIONED) active. Google may refuse for a personal
// Gmail account: then null, and the owner accepts the class once in Google Classroom instead.
export async function activateCourse(courseId: string): Promise<Course | null> {
  try {
    return await call<Course>(`/courses/${id(courseId)}?updateMask=courseState`, {
      method: 'PATCH',
      body: JSON.stringify({ courseState: 'ACTIVE' }),
    });
  } catch (e) {
    if (e instanceof GoogleError && [400, 403].includes(e.status)) return null;
    throw e;
  }
}

// Has this Google account joined the class as a teacher?
export async function isCourseTeacher(courseId: string, email: string): Promise<boolean> {
  try {
    await call(`/courses/${id(courseId)}/teachers/${id(email)}`);
    return true;
  } catch (e) {
    if (missing(e)) return false;
    throw e;
  }
}

type Invitation = { id: string; courseId: string; role: string };

// A teacher invitation that is still waiting (not accepted or declined yet), or null.
export async function getInvitation(invitationId: string): Promise<Invitation | null> {
  try {
    return await call<Invitation>(`/invitations/${id(invitationId)}`);
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}
export async function findTeacherInvitation(courseId: string, email: string): Promise<Invitation | null> {
  try {
    const found = await call<{ invitations?: Invitation[] }>(`/invitations?${new URLSearchParams({ courseId, userId: email })}`);
    return found.invitations?.find((i) => i.role === 'TEACHER') ?? null;
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

// Invites a teacher. Outside a school's own Google domain this is the only way to add one: Google emails them, and
// they become a teacher of the class when they accept. If an invitation is already there, that one is returned.
// null: no invitation was made because they are already a teacher of the class.
export async function inviteTeacher(courseId: string, email: string): Promise<Invitation | null> {
  try {
    return await call<Invitation>('/invitations', {
      method: 'POST',
      body: JSON.stringify({ courseId, userId: email, role: 'TEACHER' }),
    });
  } catch (e) {
    if (exists(e)) return findTeacherInvitation(courseId, email);
    // Google refuses an invitation to someone already in the class (they accepted a moment ago).
    if (e instanceof GoogleError && e.reason === 'FAILED_PRECONDITION' && (await isCourseTeacher(courseId, email))) return null;
    throw e;
  }
}

export async function deleteInvitation(invitationId: string) {
  try {
    await call(`/invitations/${id(invitationId)}`, { method: 'DELETE' });
  } catch (e) {
    if (!missing(e)) throw e;
  }
}

// The people in a class (students and teachers who have joined it): Google account id, email and name. The email
// needs the classroom.profile.emails permission. Used to recognise who is in a Meet call (guide 21, section 12).
export type Member = { googleId: string; email: string | null; name: string | null; role: 'student' | 'teacher' };
type RawMember = { userId: string; profile?: { id?: string; emailAddress?: string; name?: { fullName?: string } } };
export async function classMembers(courseId: string): Promise<Member[]> {
  const members: Member[] = [];
  for (const [kind, role] of [['students', 'student'], ['teachers', 'teacher']] as const) {
    let pageToken: string | undefined;
    for (let page = 0; page < 5; page++) {
      const query = new URLSearchParams({ pageSize: '100', ...(pageToken ? { pageToken } : {}) });
      const found = await call<Record<string, RawMember[] | string | undefined>>(`/courses/${id(courseId)}/${kind}?${query}`);
      for (const m of (found[kind] as RawMember[] | undefined) ?? []) {
        members.push({ googleId: m.profile?.id ?? m.userId, email: m.profile?.emailAddress?.toLowerCase() ?? null, name: m.profile?.name?.fullName ?? null, role });
      }
      pageToken = found.nextPageToken as string | undefined;
      if (!pageToken) break;
    }
  }
  return members;
}

// The link students get: the class's invite link (its address plus the class code). A student who hasn't joined
// yet is asked once to join; after that it just opens the class. Without a code (codes turned off in Classroom)
// it is the plain class address, which works for students who have already joined.
export function studentLink(alternateLink: string, code: string | null | undefined) {
  const url = new URL(alternateLink);
  if (code) url.searchParams.set('cjc', code);
  return url.href;
}

// A Google problem in plain words, for the batch page.
export function classroomProblem(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(message)) {
    return 'The app\'s Google connection doesn\'t include Google Classroom yet. Renew it as guide 21, section 11 shows.';
  }
  if (/has not been used in project|is disabled|SERVICE_DISABLED/i.test(message)) {
    return 'The Google Classroom API is switched off. Turn it on in Google Cloud (guide 21, section 11).';
  }
  if (/Google sign-in failed/i.test(message)) {
    return 'The app couldn\'t sign in to Google. The Google connection may need renewing (guide 21, section 11).';
  }
  if (e instanceof GoogleError && e.status === 429) return 'Google is busy. Please try again in a minute.';
  if (e instanceof GoogleError) return `Google Classroom said: ${message.slice(0, 200)}`;
  return 'Could not reach Google Classroom. Please try again.';
}
