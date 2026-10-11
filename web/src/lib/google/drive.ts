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