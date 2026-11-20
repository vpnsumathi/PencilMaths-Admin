// Messages between the office and students (Help/29-messages.md, migration 20261122000001_messages.sql).
// Shared by the staff pages (/messages) and the student page (/me/messages). No database calls here.
import { clock12, ukTime24 } from './format.ts';

export const MESSAGE_MAX = 2000;

export const MESSAGES_NOT_READY =
  'The database is not ready for Messages yet: run 20261122000001_messages.sql in Supabase first.';

// The database has not had the Messages script yet (missing table, column or function).
export function messagesMissing(error: { code?: string } | null) {
  return ['42P01', '42703', '42883', 'PGRST200', 'PGRST202', 'PGRST205'].includes(error?.code ?? '');
}

// One message, as both pages show it.
export type Message = {
  id: string;
  from: 'office' | 'student';
  sender: string;
  body: string | null;      // null when removed (students); staff still get the words
  removed: boolean;
  created_at: string;
  new?: boolean;            // students: an office message they had not seen before opening the page
  family_login?: boolean;   // staff: the reply came from a login that opens more than one child
  audience?: string | null; // staff: "Sent to Batch B-012 · Maths (6 students)" for a group send
  mine?: boolean;           // staff: sent by the person looking (they may remove it)
};

// A message's words cut into plain text and web addresses, so addresses can be shown as links.
// Only http:// and https:// addresses become links; a full stop or bracket at the end stays as text.
export type Piece = { text: string; href?: string };
export function linkify(body: string): Piece[] {
  const pieces: Piece[] = [];
  const re = /https?:\/\/[^\s<>"]+/gi;
  let last = 0;
  for (const m of body.matchAll(re)) {
    let url = m[0];
    const trail = /[.,;:!?)\]}'"]+$/.exec(url)?.[0] ?? '';
    url = url.slice(0, url.length - trail.length);
    const start = m.index ?? 0;
    if (start > last) pieces.push({ text: body.slice(last, start) });
    pieces.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < body.length) pieces.push({ text: body.slice(last) });
  return pieces;
}

// The UK date of a moment, "2026-11-20".
function ukDate(value: Date) {
  return value.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

// When a message was sent, in UK time: "Today 4:18 PM", "Yesterday 9:05 AM", "Mon 17 Nov, 5:40 PM",
// or with the year when it was not this year: "17 Nov 2025, 5:40 PM".
export function sentLabel(value: string, now = new Date()) {
  const at = new Date(value);
  const time = clock12(ukTime24(at));
  const day = ukDate(at);
  const today = ukDate(now);
  const yesterday = ukDate(new Date(now.getTime() - 86_400_000));
  if (day === today) return `Today ${time}`;
  if (day === yesterday) return `Yesterday ${time}`;
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  const date = at.toLocaleDateString('en-GB', sameYear
    ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }
    : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
  return `${date.replace(',', '')}, ${time}`;
}

// The short time for an inbox row: "4:18 PM" today, "Yesterday", "Mon" this week, otherwise "12 Nov".
export function inboxTime(value: string, now = new Date()) {
  const at = new Date(value);
  const day = ukDate(at);
  if (day === ukDate(now)) return clock12(ukTime24(at));
  if (day === ukDate(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  if (now.getTime() - at.getTime() < 6 * 86_400_000) {
    return at.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/London' });
  }
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

// Who a new message goes to, as the New message form sends it.
export type SendTo =
  | { kind: 'students'; students: string[] }
  | { kind: 'batch'; batch: string }
  | { kind: 'year'; year: number }
  | { kind: 'all' };

// How many students a choice reaches, from the counts the page was given.
export type Audiences = {
  all: number;
  years: { year: number; count: number }[];
  batches: { id: string; code: string; subject: string; year: number; teacher: string; count: number }[];
};
export function reach(to: SendTo, audiences: Audiences) {
  switch (to.kind) {
    case 'students': return new Set(to.students).size;
    case 'batch': return audiences.batches.find((b) => b.id === to.batch)?.count ?? 0;
    case 'year': return audiences.years.find((y) => y.year === to.year)?.count ?? 0;
    case 'all': return audiences.all;
  }
}

// "1 student", "6 students".
export const studentsWord = (n: number) => `${n} student${n === 1 ? '' : 's'}`;

// Staff: a conversation has a student message that no staff member has opened yet.
export function officeUnread(lastStudentAt: string | null, officeReadAt: string | null) {
  return !!lastStudentAt && (!officeReadAt || new Date(lastStudentAt).getTime() > new Date(officeReadAt).getTime());
}
