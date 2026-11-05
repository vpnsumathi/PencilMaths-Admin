import 'server-only';
import { forgetFolderId, savedFolderId, saveFolderId } from './folderIds';

// Talks to Google Drive with the owner's one-time permission (scope drive.file:
// the app can only see files and folders it created itself).

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';

let cached: { token: string; expires: number } | null = null;

// Swaps the long-lived refresh token for a short-lived access token (about 1 hour),
// and reuses it until it is close to expiring.
async function accessToken() {
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
async function send(url: string, init: RequestInit = {}) {
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

// Calls the Drive API and returns its JSON, or throws Google's error message.
async function drive(path: string, init: RequestInit = {}) {
  const res = await send(`${DRIVE}${path}`, init);
  const body = await res.json();
  if (!res.ok) throw new Error(`Google Drive error: ${body.error?.message ?? res.status}`);
  return body;
}

export type DriveFolder = { id: string; webViewLink: string };
const folderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;

// Finds a folder this app created (by name, inside a parent folder), or creates it.
// The folder's id is saved the first time (see folderIds.ts), so later calls do not need to ask Drive at all.
export async function findOrCreateFolder(name: string, parentId = 'root'): Promise<DriveFolder> {
  const key = `${parentId}/${name}`;
  const saved = await savedFolderId(key);
  if (saved) return { id: saved, webViewLink: folderLink(saved) };

  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `name = '${safeName}' and mimeType = '${FOLDER}' and trashed = false and '${parentId}' in parents`;
  const found = await drive(`/files?${new URLSearchParams({ q, fields: 'files(id, webViewLink)', pageSize: '1' })}`);
  if (found.files.length) {
    const id = await saveFolderId(key, found.files[0].id);
    return { id, webViewLink: folderLink(id) };
  }

  const made: DriveFolder = await drive('/files?fields=id,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  });
  const id = await saveFolderId(key, made.id);
  if (id !== made.id) {
    // Another upload made the same folder a moment earlier: use theirs, bin ours (it is empty).
    await trashFile(made.id).catch((e) => console.error('Could not bin duplicate folder:', e));
    return { id, webViewLink: folderLink(id) };
  }
  return made;
}

// A 404 when uploading into a folder means the folder is gone (deleted or in the bin): forget its saved id
// so the next try finds or makes it again.
async function folderGone(res: Response, parentId: string) {
  if (res.status === 404) await forgetFolderId(parentId);
}

// PencilMaths / Students: every student's folder goes inside this one.
export async function studentsRootFolder() {
  const root = await findOrCreateFolder('PencilMaths');
  return findOrCreateFolder('Students', root.id);
}
// PencilMaths / Students / <code> <name> / Homework. Returns the student folder and its Homework folder.
export async function createStudentFolder(student: { code: string; first_name: string; last_name: string }) {
  const students = await studentsRootFolder();
  // Students known by one name have an empty last name: no trailing space in the folder name.
  const folder = await findOrCreateFolder([student.code, student.first_name, student.last_name].filter(Boolean).join(' '), students.id);
  const homework = await findOrCreateFolder('Homework', folder.id);
  return { folder, homework };
}
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

// Uploads one file into a Drive folder; returns its id and link.
// "multipart" = one request carrying two parts: the file's details (JSON) and its contents.
export async function uploadFile(parentId: string, name: string, mimeType: string, data: ArrayBuffer) {
  const boundary = `pm-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({ name, parents: [parentId] }),
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    data,
    `\r\n--${boundary}--`,
  ]);
  const res = await send(`${UPLOAD}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = await res.json();
  if (!res.ok) await folderGone(res, parentId);
  if (!res.ok) throw new Error(`Google Drive upload error: ${json.error?.message ?? res.status}`);
  return json as { id: string; webViewLink: string };
}
// Starts an upload the browser finishes itself (big files skip the server's 4.5 MB limit).
// Returns a one-off upload address; the browser PUTs the file there. The Origin must be the site's
// address, or the browser is not allowed to use it.
export async function startBrowserUpload(parentId: string, name: string, mimeType: string, size: number, origin: string) {
  const res = await send(`${UPLOAD}?uploadType=resumable&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(size),
      Origin: origin,
    },
    body: JSON.stringify({ name, parents: [parentId] }),
  });
  const location = res.headers.get('location');
  if (!res.ok) await folderGone(res, parentId);
  if (!res.ok || !location) throw new Error(`Google Drive upload error: ${res.status}`);
  return location;
}

// Moves a file this app made to the Drive bin (e.g. a marked sheet that was replaced before it was sent).
export async function trashFile(fileId: string) {
  await drive(`/files/${encodeURIComponent(fileId)}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

// A file's folder and link, to check a browser upload landed where it should.
export async function fileInfo(fileId: string): Promise<{ id: string; parents?: string[]; webViewLink: string; trashed: boolean }> {
  return drive(`/files/${encodeURIComponent(fileId)}?fields=id,parents,webViewLink,trashed`);
}

// Fetches a file's contents (for files this app uploaded). Returns Google's response to pass on.
export async function downloadFile(fileId: string) {
  const res = await send(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media`);
  if (!res.ok) throw new Error(`Google Drive download error: ${res.status}`);
  return res;
}

// Turns a Word file into a PDF: Drive converts it to a Google Doc, we export that as PDF,
// then delete the Google Doc. Returns the PDF's bytes.
export async function wordToPdf(name: string, mimeType: string, data: ArrayBuffer) {
  const token = await accessToken();
  const boundary = `pm-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.document' }),
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    data,
    `\r\n--${boundary}--`,
  ]);
  const created = await fetch(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
    cache: 'no-store',
  });
  const doc = await created.json();
  if (!created.ok) throw new Error(`Google Drive convert error: ${doc.error?.message ?? created.status}`);
  try {
    const res = await fetch(`${DRIVE}/files/${doc.id}/export?mimeType=application/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Google Drive export error: ${res.status}`);
    return await res.arrayBuffer();
  } finally {
    await fetch(`${DRIVE}/files/${doc.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }
}
