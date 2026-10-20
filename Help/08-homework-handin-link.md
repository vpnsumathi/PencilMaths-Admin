# PencilMaths-Admin — Help: WhatsApp homework hand-in link (Phase 4)

> Families hand in homework from a private link shared in WhatsApp; files go straight into the student's Google Drive folder.
> Builds on `07-gdrive-student-folders.md`. Marking is in `09-homework-marking.md`.

| | |
|---|---|
| **Last updated** | 11 October 2026 |
| **Public page** | `/h/<code>` (no sign-in) |
| **Files saved to** | `PencilMaths / Students / PM-xxxx Name / Homework` in Drive |
| **Database script** | `supabase/migrations/20261011000001_homework_handin.sql` |
| **Accepted files** | Photos (JPG, PNG, WEBP, HEIC), PDF, Word (.doc, .docx); 4 MB each; 20 per homework |

---

## Contents

1. [How it works](#1-how-it-works)
2. [Why it's built this way](#2-why-its-built-this-way)
3. [Files and why they live there](#3-files-and-why-they-live-there)
4. [Code overview](#4-code-overview)
5. [Security](#5-security)
6. [How to test](#6-how-to-test)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. How it works

```
Staff: student page → "Copy link" / "Send on WhatsApp"  ──►  family's WhatsApp group
Family: tap link → /h/<code> → "To hand in" list → 📷 photo / PDF / Word → Hand in
App:   check code + homework → upload to Drive Homework folder → file_links row → homework "received"
Then:  batch page shows "To mark"; dashboard "to mark" count goes up; family sees "Handed in · N files"
```

---

## 2. Why it's built this way

| Choice | Reason |
|---|---|
| **A secret code per student** (`students.handin_code`, 32 random characters) | The link itself says who the student is: no guessing like email, no login for families |
| **Three database functions** (`security definer`) | Families aren't signed in, so normal security rules show them nothing. These functions run with full rights but only for the student whose code is given |
| **Photos shrunk on the phone, one file per request** | Vercel accepts at most ~4.5 MB per request; phone photos are 3–6 MB. Shrinking to ≤2000 px JPEG gives ~300–800 KB |
| **Upload to Drive** | Files sit in the student's own folder, where staff already work |
| **"Hand in" always clickable** | With no file chosen it opens the camera / file picker, so families never face a dead button |

---

## 3. Files and why they live there

| File | Job | Why there |
|---|---|---|
| `supabase/migrations/20261011000001_homework_handin.sql` | `handin_code` column + 3 functions | Database change, run once in Supabase |
| `web/src/middleware.ts` | `'/h/'` added to `PUBLIC_PATHS` | Lets families in without signing in (only `/h/…`) |
| `web/next.config.ts` | `bodySizeLimit: '5mb'` for server actions | Default is 1 MB |
| `web/src/lib/google/drive.ts` | **Added** `uploadFile()` | All Drive calls in one helper |
| `web/src/app/h/[code]/page.tsx` | The family's page | Outside `(portal)`: no staff layout, no sign-in |
| `web/src/app/h/[code]/HandInForm.tsx` | Pick files, shrink photos, send one by one | `'use client'`: runs on the phone |
| `web/src/app/h/[code]/actions.ts` | `handInFile`: check, upload, record | Server only (uses Google secrets) |
| `web/src/app/h/[code]/handin.module.css` | Phone-first styles, hand cursor, hover | Used only by this page |
| `web/src/app/(portal)/students/HandInLink.tsx` | Staff card: Copy, Send on WhatsApp, Reset | Client component (clipboard, confirm) |
| `web/src/app/(portal)/students/actions.ts` | **Added** `resetHandInLink` | With the other student actions |
| `web/src/app/(portal)/students/[id]/page.tsx` | Shows the link card (not for students who have left) | The student page |

---

## 4. Code overview

### 4.1 Database script
| Part | What it does |
|---|---|
| `handin_code` column | Random 32-character code for every student (existing ones too), unique |
| `handin_page(code)` | First name + homework from the student's **current** batches (last 90 days): title, subject, dates, status, mark, file count. Nothing for a wrong code, reset link or student who has left |
| `handin_target(code, sheet)` | Before uploading: checks the code and homework belong together; returns the student's Drive folder id and how many files they've sent |
| `handin_record(code, sheet, file…)` | After uploading: adds a `file_links` row (`homework_submission`) and marks the result **received** (a marked one stays marked); max 20 files |
| `grant execute … to anon` | Lets phones that aren't signed in call the functions |

### 4.2 `uploadFile()` (`lib/google/drive.ts`)
One **multipart** request with two parts, the file's details (name, folder) and its contents, separated by a unique `boundary`. Returns `{ id, webViewLink }`.

### 4.3 `handInFile()` (`h/[code]/actions.ts`)
1. Checks the code format, homework id, file type (or the file name's extension, for phones that don't send a type) and size.
2. `handin_target` → the student's Drive folder; stops if missing or 20 files reached.
3. Finds/creates `Homework`, uploads with a dated name, e.g. `2026-10-11 14.05 Maths - Practice sheet 1 (2).jpg`.
4. `handin_record` → database updated.
5. Returns `{ ok }` or `{ ok: false, error }` (not a redirect), because the page sends files one at a time.

### 4.4 `HandInForm.tsx` (on the phone)
- `shrink()` redraws a photo on a smaller canvas as JPEG; PDFs and Word files go unchanged.
- `send()` calls `handInFile` once per file ("Sending 2 of 3…"), stops at the first error, then `router.refresh()` moves the homework to "Handed in".
- The **Hand in** button opens the picker (`picker.current.click()`) if nothing is chosen; it's only disabled while sending.

### 4.5 `page.tsx` (the family's page)
One call to `handin_page`; **To hand in** (pending) and **Handed in** (received / marked with the mark / excused). Received homework can take more pages. Only the first name is shown.

### 4.6 Staff side
- `HandInLink.tsx`: **Copy link**, **Send on WhatsApp** (`wa.me/?text=` with the message ready; you pick the group), **Reset link** (asks first).
- `resetHandInLink`: a new random code, so the old link stops working at once.
- The link is `NEXT_PUBLIC_SITE_URL` + `/h/` + code.

---

## 5. Security

| Risk | Protection |
|---|---|
| Guessing a link | 32 random characters |
| A forwarded link | Shows only the first name and homework; no contact details, no other students |
| A leaked link | **Reset link** |
| A student leaves | Their link stops working |
| Bad or huge files | Type and size checked on the server; 20-file limit in the database |
| Someone calling the functions directly | They still need a valid code, and can only do what the page does |

---

## 6. How to test

| Do this | Expected |
|---|---|
| SQL: `select first_name, handin_code from students limit 3;` | Everyone has a code |
| Student page (with a Drive folder) | **WhatsApp hand-in link** card |
| Copy link → private window | "Hi Name 👋" and their homework |
| Hover the buttons | Hand cursor; blue hover |
| Hand in a photo and a Word file | "✅ Received", then **Handed in · 2 files** |
| Drive | Files in the student's `Homework` folder |
| Change one character of the link | Not found |
| **Reset link**, open the old one | Not found |

No homework listed? Homework only shows from the student's **current batch** — set it on the batch page (`09-homework-marking.md`).

---

## 7. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Every link gives error 500 | `HandInForm.tsx` missing | Create it (fixed 11 Oct) |
| Buttons look plain; arrow cursor; "Hand in" greyed | `handin.module.css` empty / button disabled until a file was chosen | Styles filled in; button now always active (fixed 11 Oct) |
| "Nothing to hand in" | No homework in the student's current batch, or student has no batch | Set homework on the batch page; give the student a batch |
| "Your homework folder is not ready yet" | Student has no Drive folder | Student page → **Create Drive folder** |
| "Only photos… PDF and Word files" | Other file type | Convert to PDF |
| "…is too big (4 MB max)" | Large PDF/Word | Save smaller, or photograph the pages |
| "Sorry, the upload failed" | Drive or database error | Check the terminal / Vercel logs; test `/google-drive` |
| Copied link points to localhost on Vercel | `NEXT_PUBLIC_SITE_URL` wrong in Vercel | Set it to the Vercel address, redeploy |
