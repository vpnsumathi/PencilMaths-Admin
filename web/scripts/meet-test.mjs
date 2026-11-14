// A one-off test for live attendance (Class Schedule idea, 14 Nov 2026). It changes nothing in the app or the
// database. It uses the app's Google connection from web/.env.local, so run it from the web folder:
//
//   node scripts/meet-test.mjs create
//       Makes a Google Meet room owned by the app's Google account and prints its link.
//
//   node scripts/meet-test.mjs check <space> [classroomCourseId]
//       While people are in that room: who is in the call now, who has left, and (if you give a Google
//       Classroom class id) whether each person matches someone on that class's list, with their email.
//
// Needs: the Google Meet API turned on, and the refresh token made with the extra permission
// https://www.googleapis.com/auth/meetings.space.created (see the message in the project thread).

import process from 'node:process';

try { process.loadEnvFile('.env.local'); } catch { /* Node older than 20.12: set the variables yourself */ }
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error('Run this from the web folder, where .env.local has the three GOOGLE_ lines.');
  process.exit(1);
}

async function token() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error}`);
  return body.access_token;
}

let access;
async function google(url, init = {}) {
  access ??= await token();
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body.error?.status ?? ''}: ${body.error?.message ?? 'no details'}\n   (${init.method ?? 'GET'} ${url})`);
  return body;
}
const MEET = 'https://meet.googleapis.com/v2';
const time = (t) => (t ? new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : '');

async function create() {
  let space;
  try {
    // OPEN: anyone with the link joins without knocking. Your Workspace may not allow it; then TRUSTED is tried.
    space = await google(`${MEET}/spaces`, { method: 'POST', body: JSON.stringify({ config: { accessType: 'OPEN' } }) });
  } catch (e) {
    console.log(`Could not make an open room (${e.message.split('\n')[0]}). Trying the default setting…`);
    space = await google(`${MEET}/spaces`, { method: 'POST', body: '{}' });
  }
  console.log('\nMeet room made, owned by the app\'s Google account.');
  console.log(`  Link:      ${space.meetingUri}`);
  console.log(`  Room id:   ${space.name}`);
  console.log(`  Who can join without knocking: ${space.config?.accessType ?? 'Google default'}`);
  console.log('\nNext: open the link and start the call while signed in to the app\'s Workspace account (or any account),');
  console.log('join from the test teacher\'s and a test student\'s personal Gmail, wait a minute, then run:');
  console.log(`  node scripts/meet-test.mjs check ${space.name} <classroom class id>`);
}

async function check(space, courseId) {
  if (!space?.startsWith('spaces/')) throw new Error('Give the room id that "create" printed, e.g. spaces/abc123');
  const { conferenceRecords = [] } = await google(`${MEET}/conferenceRecords?${new URLSearchParams({ filter: `space.name = "${space}"` })}`);
  if (conferenceRecords.length === 0) {
    console.log('No call has happened in this room yet (or Google has not caught up). Join it, wait a minute and try again.');
    return;
  }
  const call = conferenceRecords[0]; // newest first
  console.log(`\nCall started ${time(call.startTime)}${call.endTime ? `, ended ${time(call.endTime)}` : ', still going'}  (${call.name})`);

  const people = [];
  let pageToken;
  do {
    const page = await google(`${MEET}/${call.name}/participants?${new URLSearchParams({ pageSize: '100', ...(pageToken ? { pageToken } : {}) })}`);
    people.push(...(page.participants ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  // The class list: each member's Google id and email (Classroom gives emails with classroom.profile.emails).
  const roster = new Map();
  if (courseId) {
    for (const [kind, key] of [['students', 'student'], ['teachers', 'teacher']]) {
      const list = await google(`https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/${kind}?pageSize=100`);
      for (const m of list[kind] ?? []) roster.set(m.profile?.id ?? m.userId, { role: key, email: m.profile?.emailAddress ?? '(no email)', name: m.profile?.name?.fullName });
    }
    console.log(`Classroom class list: ${roster.size} people`);
  }

  console.log(`\n${people.length} people have been in this call:\n`);
  for (const p of people) {
    const who = p.signedinUser ? `${p.signedinUser.displayName}  [signed in, ${p.signedinUser.user}]`
      : p.anonymousUser ? `${p.anonymousUser.displayName}  [not signed in to Google]`
      : p.phoneUser ? `${p.phoneUser.displayName}  [phone]` : '(unknown)';
    const now = p.latestEndTime ? `left ${time(p.latestEndTime)}` : 'IN THE CALL NOW';
    let match = '';
    if (courseId && p.signedinUser) {
      const m = roster.get(p.signedinUser.user.replace(/^users\//, ''));
      match = m ? `  -> MATCHES class ${m.role} ${m.email}` : '  -> not on the class list';
    }
    console.log(`  ${who}\n     joined ${time(p.earliestStartTime)}, ${now}${match}`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === 'create') await create();
  else if (cmd === 'check') await check(args[0], args[1]);
  else console.log('Use: node scripts/meet-test.mjs create   or   node scripts/meet-test.mjs check <space> [classroomCourseId]');
} catch (e) {
  console.error(`\nGoogle said: ${e.message}`);
  if (/insufficient|scope/i.test(e.message)) console.error('The token is missing the meetings.space.created permission: make a new one with it.');
  if (/has not been used|disabled/i.test(e.message)) console.error('Turn on the Google Meet API in Google Cloud (APIs & Services > Library).');
  process.exit(1);
}
