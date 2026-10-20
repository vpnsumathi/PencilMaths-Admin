# PencilMaths-Admin — Google Drive Help (setup)

> How the app was connected to Google Drive (Phase 2 of the WhatsApp homework feature).
> For how the code works see `06-gdrive-code.md`.

| | |
|---|---|
| **Last updated** | 11 October 2026 |
| **Account type** | Personal Gmail (switching to Google Workspace later only changes the connection setup) |
| **Drive permission** | `drive.file`: the app can only see and change files and folders **it created itself** |
| **Folder it creates** | `My Drive / PencilMaths / Students` |

---

## Contents

1. [Why Google Drive](#1-why-google-drive)
2. [How the connection works](#2-how-the-connection-works)
3. [Google Cloud setup](#3-google-cloud-setup)
4. [Secrets: local and Vercel](#4-secrets-local-and-vercel)
5. [Checklist: is everything done?](#5-checklist-is-everything-done)
6. [Test the connection](#6-test-the-connection)
7. [Troubleshooting](#7-troubleshooting)
8. [Security rules](#8-security-rules)
9. [What comes next](#9-what-comes-next)

---

## 1. Why Google Drive

The homework flow is: lead → converted to student → **Drive folder created** → family uploads homework through their WhatsApp link → **files saved in that folder** → database records it → the app shows the results. Staff already work in Drive, so files land where they expect them. The database was designed for this: `file_links.provider = 'google_drive'` with the Drive id in `external_id`.

---

## 2. How the connection works

```
You (once) ──sign in with Google──► OAuth Playground ──► REFRESH TOKEN (long-lived key)
                                                              │ stored as a server secret
App (each time) ──refresh token──► Google ──► ACCESS TOKEN (≈1 hour) ──► Drive API
```

- You approve "this app may create files in my Drive" **once**; Google returns a refresh token.
- The app keeps it as a server-only secret and swaps it for a short-lived access token when it needs Drive.
- No staff member or family ever signs in to Google.

---

## 3. Google Cloud setup

Google renames menus from time to time; look for the nearest match.

| Step | Where | What was done |
|---|---|---|
| **A1. Project** | console.cloud.google.com → project picker | Created and selected **PencilMaths-Admin** |
| **A2. Drive API** | APIs & Services → Library | Enabled **Google Drive API** |
| **A3a. Branding** | Google Auth Platform → Branding | App name, support email, home page, privacy policy link, authorised domain, developer email |
| **A3b. Audience** | Google Auth Platform → Audience | User type **External**; **Publish app** → **In production** |
| **A3c. Data access** | Google Auth Platform → Data access | Added scope `https://www.googleapis.com/auth/drive.file` only |
| **A4. Client** | Google Auth Platform → Clients → Create client | Type **Web application**, name `PencilMaths Admin server`, redirect URI `https://developers.google.com/oauthplayground`. Copied **Client ID** and **Client secret** |
| **A5. Refresh token** | developers.google.com/oauthplayground | ⚙️ → *Use your own OAuth credentials* (Client ID + secret) → scope `…/auth/drive.file` → **Authorize APIs** → sign in (on "Google hasn't verified this app": Advanced → Go to PencilMaths Admin) → **Exchange authorization code for tokens** → copied the **Refresh token** |

**Why each matters:**
- **Publishing (A3b)** is essential: in "Testing", Google expires refresh tokens after **7 days**.
- **Publishing requires** an app name, support email, **home page URL and privacy policy URL** (A3a). Use an existing website, or the app's own public `/privacy` page on Vercel (outside `(portal)`, and `'/privacy'` added to `PUBLIC_PATHS` in `middleware.ts`).
- **`drive.file`** is Google's lowest-risk Drive permission, so no Google security review is needed.
- **The OAuth client (A4)** identifies the app; you need it once.
- **The Playground (A5)** avoids building a Google sign-in page; its redirect URI must match exactly.
- The "unverified app" screen is expected: only you ever sign in.

---

## 4. Secrets: local and Vercel

| Variable | What it is | Local (`web/.env.local`) | Vercel type |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | Identifies the app (not secret) | ✅ | Config or Secret |
| `GOOGLE_CLIENT_SECRET` | Proves it is your app | ✅ | **Secret** |
| `GOOGLE_REFRESH_TOKEN` | The key to the app's files in your Drive | ✅ | **Secret** |

- **No `NEXT_PUBLIC_` prefix**: these must never reach the browser.
- After changing `.env.local`, restart the app (`Ctrl+C`, `npm run dev`).
- On Vercel: select Production, Preview and Development, then **Redeploy**.
- Vercel warning *"looks like a secret, but its value is visible"* = it was saved as **Config**. Delete it and add it again as **Secret**.
- **Rotating the client secret** (if it was ever shared): Google Auth Platform → Clients → your client → **Add secret** → update `.env.local` and Vercel → test → disable the old secret. The refresh token keeps working.

---

## 5. Checklist: is everything done?

| # | Check | ✅ when |
|---|---|---|
| 1 | Project | **PencilMaths-Admin** selected |
| 2 | Drive API | Listed under Enabled APIs & services |
| 3 | Branding | All fields filled, including home page and privacy link |
| 4 | Privacy page | Opens without signing in |
| 5 | Scope | Only `…/auth/drive.file` under Data access |
| 6 | Published | Audience shows **In production**, **External** |
| 7 | Client | `PencilMaths Admin server`, Web application, Playground redirect URI |
| 8 | Refresh token | Made **after** publishing (starts `1//`) |
| 9 | Local secrets | 3 `GOOGLE_…` lines in `web/.env.local` |
| 10 | Package | `server-only` in `web/package.json` |
| 11 | Code | `lib/google/drive.ts`, `(portal)/google-drive/actions.ts` and `page.tsx` |
| 12 | Vercel | Secret and token saved as **Secret**; redeployed |

---

## 6. Test the connection

1. Open `/google-drive` (admins only; not in the sidebar; type the address).
2. It shows **Google settings: ✅ found**.
3. Click **Test connection** → **Connected to Google Drive.** and an **Open … in Drive** link.
4. Drive now has `PencilMaths / Students`.
5. Click again: still only **one** `PencilMaths` folder.
6. Repeat on the Vercel address.

---

## 7. Troubleshooting

| Message | Cause | Fix |
|---|---|---|
| Publishing: *"home page URL and privacy policy URL are required"* | Branding incomplete | Fill in Branding (A3a), then publish |
| `Google sign-in failed: invalid_grant` | Refresh token wrong, revoked, or made while in Testing (expired) | Publish the app, then redo A5 |
| `invalid_client` | Client ID or secret wrong / has spaces | Copy them again |
| `Google Drive API has not been used… or it is disabled` | API not enabled | Enable it (A2), wait a minute |
| `Insufficient Permission` | Token made without `drive.file` | Redo A5 with the right scope |
| `redirect_uri_mismatch` (in Playground) | Redirect URI differs | Must be exactly `https://developers.google.com/oauthplayground` |
| Page says **❌ missing** | Secrets not loaded | Check names in `.env.local`, restart; on Vercel, redeploy |

---

## 8. Security rules

- Secrets live only in `web/.env.local` (never committed) and Vercel **Secret** variables. Never paste them in chat or screenshots.
- `drive.file` means the app can't read anything in your Drive except what it created.
- All Drive code imports `server-only`, so it can never be bundled into the browser.
- Only admins can open `/google-drive`.
- To cut the app off completely: Google Account → Security → Third-party access → remove **PencilMaths Admin**.

---

## 9. What comes next

| Phase | Uses Drive for |
|---|---|
| 3. Folder on convert | Converting a lead or adding a student creates `PencilMaths / Students / PM-1009 Name / Homework`, saved in `file_links` |
| 4. WhatsApp link | Homework photos/PDFs uploaded into the student's `Homework` folder |
| 5. Results | Teachers open submissions from the batch page and enter marks |
