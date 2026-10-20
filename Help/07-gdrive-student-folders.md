# PencilMaths-Admin — Help: Google Drive student folders (Phase 3)

> Every student gets their own Google Drive folder, created by the app.
> Builds on `05-gdrive-setup.md` (setup) and `06-gdrive-code.md` (Drive code). Leads are in `04-enquiries.md`.

| | |
|---|---|
| **Last updated** | 11 October 2026 |
| **Folder created** | `My Drive / PencilMaths / Students / PM-1009 Oliver Brown / Homework` |
| **Saved in** | `file_links` (`owner_type = 'student_folder'`, `provider = 'google_drive'`) |
| **New database scripts** | None: `file_links` was designed for this |

---

## Contents

1. [What it does](#1-what-it-does)
2. [When a folder is created](#2-when-a-folder-is-created)
3. [Rules built in](#3-rules-built-in)
4. [Files changed and why](#4-files-changed-and-why)
5. [Code overview](#5-code-overview)
6. [How to test](#6-how-to-test)
7. [Troubleshooting](#7-troubleshooting)
8. [Known limits and what comes next](#8-known-limits-and-what-comes-next)

---

## 1. What it does

```
Lead ──Convert to student──►  Student created  ──►  Drive folder created  ──►  link saved in file_links
                                                     PencilMaths/Students/PM-1009 Name/Homework
Student page: "Open the Google Drive folder →"   (or a "Create Drive folder" button if it has none)
```

The `Homework` subfolder is ready for Phase 4, where families' uploads will be saved.

---

## 2. When a folder is created

| Moment | How |
|---|---|
| A lead is **converted to a student** | Automatically, in `convertToStudent` |
| A student is **added** with the Add student form | Automatically, in `saveStudent` (new students only) |
| An **existing** student without one (e.g. dummy data), or after a Drive problem | **Create Drive folder** button on the student page |

---

## 3. Rules built in

| Rule | Why |
|---|---|
| **A Drive problem never blocks the student.** The student is still created; a red message says to use the button. | Drive can be down or misconfigured; the student record matters more. |
| **One folder per student; running twice reuses it** | Find-or-create in Drive, plus a check for an existing `google_drive` row. |
| **Folder name starts with the student code** (`PM-1009 …`) | Two students with the same name never share a folder. |
| **A Drive folder replaces a pasted folder link** | One official folder per student (the database allows only one `student_folder` row). |
| **The student form never changes a Drive folder** | The form shows a link, not an input, for Drive folders (see 5.4). |

---

## 4. Files changed and why

| File | Change | Why there |
|---|---|---|
| `web/src/lib/google/drive.ts` | **Added** `createStudentFolder()` | All Drive calls live in one helper |
| `web/src/lib/students/driveFolder.ts` | **New**: `ensureStudentDriveFolder()` | Used by 3 actions (convert, add, button), so it lives in shared `lib/`; `server-only` because it uses Google secrets |
| `(portal)/enquiries/actions.ts` | `convertToStudent` creates the folder | The moment a lead becomes a student |
| `(portal)/students/actions.ts` | `saveStudent` creates it for new students; **new** `createDriveFolder` action | Adding a student, and the button |
| `(portal)/students/StudentForm.tsx` | "Student folder" section: Drive link **or** paste box | Protects the Drive folder from being overwritten |
| `(portal)/students/[id]/page.tsx` | Fetches `provider`; shows the **Create Drive folder** card; passes `folder` to the form | The student page is where staff see and fix it |

---

## 5. Code overview

### 5.1 `createStudentFolder()` (`lib/google/drive.ts`)
```ts
const students = await studentsRootFolder();                       // PencilMaths / Students
const folder = await findOrCreateFolder(`${code} ${first} ${last}`, students.id);
const homework = await findOrCreateFolder('Homework', folder.id);
return { folder, homework };
```
Each step is find-or-create, so calling it twice never makes duplicates.

### 5.2 `ensureStudentDriveFolder(studentId)` (`lib/students/driveFolder.ts`)
1. Loads the student (code, names) and any existing `student_folder` row **at the same time**.
2. Already a `google_drive` row → returns its link (nothing to do).
3. Otherwise creates the Drive folders (5.1).
4. Deletes a pasted-link row if there is one, then **inserts** the `file_links` row:

| Column | Value |
|---|---|
| `owner_type` | `student_folder` |
| `owner_id`, `student_id` | the student's id |
| `provider` | `google_drive` |
| `external_id` | the Drive folder id (Phase 4 uploads use it) |
| `url` | the link staff click |
| `label` | `Student folder` |

5. Throws a clear error if anything fails (the callers decide what to show).

If a signed-in person isn't staff, the database rules hide the student, so it stops at step 1 before touching Drive.

### 5.3 The three callers
```ts
const driveOk = await ensureStudentDriveFolder(studentId).then(
  () => true,
  (err) => { console.error('Drive folder failed:', err); return false; },
);
redirectWith(path, driveOk ? 'ok' : 'error', driveOk ? '…created' : '…use "Create Drive folder"');
```
- `.then(success, failure)` turns the result into `true`/`false` **without `try/catch`**, because a `catch` would swallow Next.js's redirect.
- The real error goes to the terminal / Vercel logs; staff see a plain message.
- **`convertToStudent`**: after the student is created and the lead marked Enrolled.
- **`saveStudent`**: only when adding (`!id`), not when editing.
- **`createDriveFolder`**: the button's action; refreshes the page with `revalidatePath`.

### 5.4 Student form (`StudentForm.tsx`)
- Prop `folder: { url, provider }` (was `folderUrl`).
- `provider === 'google_drive'` → shows **Open the Google Drive folder →** and **no input**.
- Otherwise → the paste-a-link box, as before.

**Why no input for Drive folders:** if the form sent the link back, `save_student` would re-save it as a plain pasted link and drop the Drive id. With no input, nothing is sent, and `save_student` only removes pasted links, so the Drive row stays.

### 5.5 Student page (`students/[id]/page.tsx`)
- Fetches `url, provider` for the folder row.
- No Drive folder → a card with **Create Drive folder** (its own small form, above the student form; forms can't be nested).
- Passes `folder` to `StudentForm`.

---

## 6. How to test

Restart first (`Ctrl+C`, `npm run dev`).

| Do this | Expected |
|---|---|
| Convert a lead | "Student and Drive folder created"; Drive has `PencilMaths / Students / PM-10xx Name / Homework` |
| The student's page | **Open the Google Drive folder →**; no "Create Drive folder" card |
| A dummy-data student (e.g. Aarav Patel) | "Create Drive folder" card → click → folder appears in Drive |
| Click it again on another student / refresh | No duplicate folders |
| **Add student** | "Student and Drive folder added" |
| Save the student form again | Drive link still there |
| SQL: `select student_id, provider, external_id, url from file_links where owner_type = 'student_folder';` | `google_drive` rows with a Drive id |
| Change one letter of `GOOGLE_REFRESH_TOKEN`, restart, add a student | Student still created, red message. **Put the token back** and restart. |

---

## 7. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Red "Drive folder could not be made" | Google connection problem | Open `/google-drive` → **Test connection**; the message names the cause (see `05-gdrive-setup.md` §7). Then click **Create Drive folder** |
| "Student folder" shows twice, box inside a box | The new section was pasted inside the old one | Keep only one `<section>` (fixed 11 Oct) |
| Student page has no Drive link after creating | The page still fetches only `url` | The `file_links` select must be `'url, provider'` |
| Folder deleted in Drive by hand; link broken | The app still has the old row | Delete that student's `file_links` row (`owner_type = 'student_folder'`), then **Create Drive folder** |
| `Folder made in Drive but not saved: …` | Database insert refused | Check you're signed in as active staff; the message gives the database reason |

---

## 8. Known limits and what comes next

**Limits**
- Renaming a student doesn't rename the Drive folder (the code prefix still matches).
- Folders are in the owner's **My Drive**; with Google Workspace they could move to a Shared Drive later.

**Next: Phase 4, the WhatsApp hand-in link**
- A private link per student, shared in their WhatsApp group.
- A public `/h/[code]` page listing their homework.
- Photos/PDFs uploaded straight into the student's `Homework` folder (found from `external_id`), recorded in `file_links` (`homework_submission`) and marking `homework_results` as **received**.
