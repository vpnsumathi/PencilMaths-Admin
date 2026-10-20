# PencilMaths-Admin — Google Drive Code Help

> How the Google Drive code works. For the Google Cloud setup and secrets see `05-gdrive-setup.md`.

| | |
|---|---|
| **Last updated** | 11 October 2026 |
| **Files** | `web/src/lib/google/drive.ts`, `web/src/app/(portal)/google-drive/actions.ts`, `web/src/app/(portal)/google-drive/page.tsx` |
| **Package** | `server-only` |
| **Libraries** | None from Google: plain `fetch` calls to Google's REST API |

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [Folder structure and why](#2-folder-structure-and-why)
3. [lib/google/drive.ts](#3-libgoogledrivets)
4. [google-drive/actions.ts](#4-google-driveactionsts)
5. [google-drive/page.tsx](#5-google-drivepagetsx)
6. [Design decisions](#6-design-decisions)
7. [How later phases will use it](#7-how-later-phases-will-use-it)

---

## 1. The big picture

```
/google-drive page (admin) ── "Test connection" ──► testDrive()  (server action)
                                                        │
                                                        ▼
                                              studentsRootFolder()      (lib/google/drive.ts)
                                                        │
                                   findOrCreateFolder('PencilMaths') → findOrCreateFolder('Students')
                                                        │
                                                    drive()  ── adds access token ──► Drive API
                                                        │
                                                  accessToken()  ── refresh token ──► Google
```

---

## 2. Folder structure and why

| File | Why it lives there |
|---|---|
| `lib/google/drive.ts` | Not a page and not UI: a **helper** reused by every feature that touches Drive (test page now; convert-to-student and homework upload later). `lib/` is for shared, non-UI code. |
| `(portal)/google-drive/page.tsx` | A page at `/google-drive`. Inside `(portal)` so the staff-only layout and sidebar apply; the page adds an **admin** check. |
| `(portal)/google-drive/actions.ts` | The server action used only by that page, kept next to it (same pattern as every other section). |

---

## 3. `lib/google/drive.ts`

### `import 'server-only'`
If any browser-side file ever imports this module, **the build fails**. This guarantees the Google secrets can never be shipped to the browser.

### Constants
| Name | Value | Meaning |
|---|---|---|
| `TOKEN_URL` | `https://oauth2.googleapis.com/token` | Where refresh tokens are swapped for access tokens |
| `DRIVE` | `https://www.googleapis.com/drive/v3` | The Drive API |
| `FOLDER` | `application/vnd.google-apps.folder` | How Drive marks a file as a folder |

### `accessToken()`
```ts
if (cached && cached.expires > Date.now() + 60_000) return cached.token;
… POST TOKEN_URL with client_id, client_secret, refresh_token, grant_type=refresh_token
cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
```
- Sends the three secrets to Google and gets an **access token** valid about 1 hour.
- Keeps it in memory (`cached`) and reuses it until 1 minute before it expires, so Google isn't asked on every call.
- On failure throws `Google sign-in failed: <Google's reason>` (e.g. `invalid_grant`).
- `cache: 'no-store'` stops Next.js from caching the request.

### `drive(path, init)`
- One helper for **every** Drive request: adds `Authorization: Bearer <access token>`, sends it, parses the JSON.
- On failure throws `Google Drive error: <Google's message>`, which the test page shows.

### `findOrCreateFolder(name, parentId = 'root')`
```ts
const q = `name = '${safeName}' and mimeType = '${FOLDER}' and trashed = false and '${parentId}' in parents`;
```
1. **Search** for a folder with that name inside the parent (`'root'` = top of My Drive), not in the bin.
2. If found → return it. If not → **create** it (`POST /files` with name, folder type and parent).
3. Returns `{ id, webViewLink }`: the Drive id (stored in the database later) and a link that opens it.

- **Safe to run many times**: it finds before it creates, so no duplicates.
- With `drive.file`, the search only sees folders **this app** made, so a folder you create by hand with the same name is ignored.
- `safeName` escapes `\` and `'` so a name like `O'Brien` can't break the search.

### `studentsRootFolder()`
Makes sure `PencilMaths / Students` exists and returns `Students`. Every student folder will be created inside it.

---

## 4. `google-drive/actions.ts`

```ts
export async function testDrive() {
  await requireAdmin();
  let link = '';
  try {
    link = (await studentsRootFolder()).webViewLink;
  } catch (e) {
    console.error('testDrive failed:', e);
    redirectWith('/google-drive', 'error', e instanceof Error ? e.message : 'Could not reach Google Drive.');
  }
  redirect(`/google-drive?ok=…&folder=${encodeURIComponent(link)}`);
}
```
- **`requireAdmin()`** first: only admins can trigger Drive changes.
- Calls `studentsRootFolder()`; on error, logs the details to the terminal / Vercel logs and shows Google's message in red.
- On success, goes back to the page with a green message and the folder link in the address.
- **The success `redirect` is after the `try/catch` on purpose**: Next.js redirects work by throwing a special signal, and a `catch` would swallow it.

---

## 5. `google-drive/page.tsx`

- **`requireAdmin()`**: non-admins are sent to the dashboard.
- **`configured`**: checks the three `GOOGLE_…` settings **exist**, never shows their values. Shows ✅ found or ❌ missing.
- **`folderLink`**: only shown if it starts with `https://drive.google.com/`, so a crafted address can't turn the page into a link to another site.
- **Test connection** button: a form that calls `testDrive`; disabled while settings are missing.
- Not in the sidebar: it's a one-off admin tool, opened by typing `/google-drive`.

---

## 6. Design decisions

| Decision | Reason |
|---|---|
| **Plain `fetch`, no `googleapis` package** | Only a few calls are needed; avoids a large dependency and keeps the code readable. |
| **Refresh token from OAuth Playground** | No need to build a Google sign-in flow; only the owner ever connects. |
| **`drive.file` scope** | Least access: the app can't read the rest of your Drive, and no Google security review is needed. |
| **Find-or-create by name** | No folder ids to store in settings; running twice never makes duplicates. |
| **Token cached in memory** | Fewer calls to Google; a fresh one is fetched automatically when it nears expiry. |
| **Errors thrown with Google's message, logged, then shown** | You see the real cause on the page and in the logs. |
| **Admin-only test page** | Lets you check the connection anywhere (local or Vercel) without touching students. |

---

## 7. How later phases will use it

| Phase | New code in `lib/google/drive.ts` | Called from |
|---|---|---|
| 3. Folder on convert | `createStudentFolder(student)` → `Students / PM-1009 Name / Homework`, saved in `file_links` (`provider = 'google_drive'`, `external_id` = Drive id) | `convertToStudent` and adding a student |
| 4. WhatsApp link | `uploadFile(folderId, name, bytes, type)` | The homework hand-in server action |
| 5. Results | Links to the uploaded files (`webViewLink`) | Batch page homework section |
