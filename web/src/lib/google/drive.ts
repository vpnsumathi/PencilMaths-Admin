import 'server-only';

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

// Calls the Drive API and returns its JSON, or throws Google's error message.
async function drive(path: string, init: RequestInit = {}) {
  const res = await fetch(`${DRIVE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...init.headers },
    cache: 'no-store',
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google Drive error: ${body.error?.message ?? res.status}`);
  return body;
}

export type DriveFolder = { id: string; webViewLink: string };

// Finds a folder this app created (by name, inside a parent folder), or creates it.
export async function findOrCreateFolder(name: string, parentId = 'root'): Promise<DriveFolder> {
  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `name = '${safeName}' and mimeType = '${FOLDER}' and trashed = false and '${parentId}' in parents`;
  const found = await drive(`/files?${new URLSearchParams({ q, fields: 'files(id, webViewLink)', pageSize: '1' })}`);
  if (found.files.length) return found.files[0];

  return drive('/files?fields=id,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  });
}

// PencilMaths / Students: every student's folder goes inside this one.
export async function studentsRootFolder() {
  const root = await findOrCreateFolder('PencilMaths');
  return findOrCreateFolder('Students', root.id);
}
// PencilMaths / Students / <code> <name> / Homework. Returns the student folder and its Homework folder.
export async function createStudentFolder(student: { code: string; first_name: string; last_name: string }) {
  const students = await studentsRootFolder();
  const folder = await findOrCreateFolder(`${student.code} ${student.first_name} ${student.last_name}`, students.id);
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
  const res = await fetch(`${UPLOAD}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google Drive upload error: ${json.error?.message ?? res.status}`);
  return json as { id: string; webViewLink: string };
}
// Fetches a file's contents (for files this app uploaded). Returns Google's response to pass on.
export async function downloadFile(fileId: string) {
  const res = await fetch(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    cache: 'no-store',
  });
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
