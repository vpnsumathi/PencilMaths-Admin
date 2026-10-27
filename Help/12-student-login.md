# PencilMaths-Admin — Help: Student login and 20 Oct changes

> Students sign in to see their classes, homework and class schedule, and hand homework in as one PDF.
> Staff move lesson plan topics forward, and completing a topic sends homework.
> Builds on `08-homework-handin-link.md` and `09-homework-marking.md`. Plans: `plans/student-login.md` and `plans/lesson-plan-homework.md` in the Claude project.

| | |
|---|---|
| **Last updated** | 20 October 2026 |
| **Student pages** | `/me` (dashboard), `/me/classes`, `/me/homework` (tabs) |
| **Staff side** | **Student login** card on the student page; lesson plan buttons and homework files on the batch page |
| **Database scripts** | `supabase/migrations/20261020000001` to `…05` (run in order) |
| **New secret** | `SUPABASE_SECRET_KEY` (server only) |
| **New package** | `pdf-lib` (run `npm install` in `web`) |
| **Logo** | `Logo/pencilmaths-logo.png`, and the app's copy in `web/public/logo.png` |

---

## Contents

1. [Set-up (once)](#1-set-up-once)
2. [Summary of the 20 Oct changes](#2-summary-of-the-20-oct-changes)
3. [Student area](#3-student-area)
4. [Homework hand-in: many files, one PDF](#4-homework-hand-in-many-files-one-pdf)
5. [Homework files (worksheets)](#5-homework-files-worksheets)
6. [Lesson plan statuses](#6-lesson-plan-statuses)
7. [Giving students a login](#7-giving-students-a-login)
8. [Database scripts](#8-database-scripts)
9. [All files changed](#9-all-files-changed)
10. [Security](#10-security)
11. [Quick test](#11-quick-test)
12. [Troubleshooting](#12-troubleshooting)
13. [Later](#13-later)

---

## 1. Set-up (once)

| # | Where | What |
|---|---|---|
| 1 | Supabase › **Project settings › API keys** | Copy the **secret** key |
| 2 | `web/.env.local` | Add `SUPABASE_SECRET_KEY=...` (never with `NEXT_PUBLIC_` in front) |
| 3 | Vercel › **Settings › Environment Variables** | Add `SUPABASE_SECRET_KEY` as a Secret, then redeploy |
| 4 | Supabase › **Authentication › URL Configuration** | Site URL = Vercel address; Redirect URLs include `http://localhost:3000/**` and `https://<your-app>.vercel.app/**` |
| 5 | Supabase › **SQL Editor** | Run the five scripts in order (section 8) |
| 6 | Terminal in `web` | `npm install` (adds `pdf-lib`), then `npm run dev` |
| 7 | Supabase › **Authentication › Emails › SMTP** (optional) | Custom SMTP (Brevo) for more emails and your own wording |

---

## 2. Summary of the 20 Oct changes

| # | Change | Where you see it |
|---|---|---|
| 1 | Student login: invite, accept, sign in | Student page › **Student login** card; `/me` |
| 2 | Invite link fix (page reads Supabase's `#access_token` link correctly and shows the real reason if it fails) | `/auth/accept` |
| 3 | Any email can be used for a student login (existing logins are linked, not refused) | Student login card |
| 4 | Homework files: staff attach a worksheet or link; students open it | Batch page › Homework; My homework 📄 buttons |
| 5 | Student's name in the top bar, then the Pencil Maths logo | Student top bar |
| 6 | Handed-in and marked homework shown in green | My homework |
| 7 | Dashboard tiles (My classes, My homework) and a **My classes** page | `/me`, `/me/classes` |
| 8 | Many photos or files handed in together as one PDF (Word converted through Google Drive) | Hand in form (student login and WhatsApp link) |
| 9 | Lesson plan: Not started → In progress → Completed; completing sends homework from a pop-up | Batch page › Lesson plan |
| 10 | My homework in three tabs, with links from the dashboard | `/me/homework?tab=…` |
| 11 | Real-looking tabs, separate homework blocks, **Class schedule** tile (next class and topic), bold class and teacher names, wider class cards | `/me`, `/me/classes` |

---

## 3. Student area

| Page | Shows |
|---|---|
| Top bar | Logo (links to `/me`), tabs **Dashboard · Classes · Homework**, student's name, **Sign out** |
| `/me` Dashboard | **My classes** tile (classes with their teachers) · **My homework** tile with three blocks: To hand in (red edge), Handed in (waiting to be marked), Recently marked (last 14 days, green edge) · **Class schedule** tile: next class per class (UK time) and the topic (In progress, or the first topic) |
| `/me/classes` | One card per class: class code and teacher in bold, class year, weekly times, next class, topic, joined date, homework count |
| `/me/homework` | Tabs **To hand in** (default), **Handed in** (`?tab=handed`), **Marked** (`?tab=marked`). Handed-in and marked cards are green. 📄 buttons open the homework files |

**Code:** `(student)/layout.tsx` checks the person is a student with `rpc('my_dashboard')` and reads their name from it. Pages read all their data from `my_dashboard()` and `my_homework()`. The next class is worked out in `me/dashboard.ts` (`nextClass`) from the weekly times. It doesn't know about holidays.

---

## 4. Homework hand-in: many files, one PDF

- **📷 Take a photo** adds one photo at a time (the camera on phones). **📎 Choose files** adds several photos, PDFs or Word files. Each item can be removed with ✕.
- **Hand in (N pages)** builds one PDF in the browser (`lib/homework/makePdf.ts`, using `pdf-lib`):
  - photos are shrunk to 1600 px and placed on A4 pages (landscape photos on landscape pages)
  - PDFs are added page by page
  - Word files go to the server (`lib/homework/convert.ts`), which converts them to PDF through Google Drive (`wordToPdf` in `lib/google/drive.ts`) and deletes the temporary Google Doc
- Uploads are limited to about 4 MB each, so a very long hand-in is split into two PDFs.
- Used by both the student login and the WhatsApp link (`h/[code]/HandInForm.tsx`).

---

## 5. Homework files (worksheets)

- **Staff:** **Set homework** has an optional **Homework file** (PDF, Word or photo, 4 MB max) and **Link**. Homework that's already set has **Add file** and **Remove**. Files go to Drive › PencilMaths › Homework sheets (`lib/homework/sheets.ts`).
- **Students:** each homework shows 📄 buttons. `/me/homework/file/[id]` checks the student is in that class (`my_homework_file`), then streams the file from Drive (`downloadFile`) or redirects to the link.
- Stored as `file_links` rows with `owner_type = 'homework_sheet'`.

---

## 6. Lesson plan statuses

| Status | Button(s) on the batch page |
|---|---|
| Not started (every topic, at first) | **Start** |
| In progress | **Mark completed** (pop-up) · **Undo** |
| Completed (with date) | **Undo** (back to In progress; homework already sent stays) |

**Mark completed pop-up** (`batches/CompleteTopic.tsx`):
- **Title:** the topic name
- **Set on:** today
- **Due on:** 5 days later
- **Max mark:** 10
- **File** and **Link:** optional

**OK, send homework** calls `completeTopic` in `batches/actions.ts`. It sets the homework for every student in the batch, attaches the file (a blank one-page PDF with the title if none is given), and marks the topic Completed. A topic sends its homework only once (`homework_sheets.topic_id`, unique). Only staff can do this: teachers have no login yet. Sending by email or WhatsApp comes later.

---

## 7. Giving students a login

- **Give portal access** (`givePortalAccess`):
  - a new email gets Supabase's invite
  - an email that already has a login (including staff) is linked to the student straight away; they use that password or **Forgot password**
  - an email that already opens a brother or sister **adds** this student to that login (see 7.1)
- **Resend invite** sends the email again while it hasn't been accepted.
- **Remove access** deletes the login. A staff login, or a family login a brother or sister still uses, is only unlinked, never deleted.
- The invite link lands on `/auth/accept`, which saves the sign-in and goes to `/reset-password`. If the link is used or too old, the page shows **Reason:** with Supabase's message. `/auth/confirm` is kept for a customised template later.
- Invite and reset links use the address of the site the button was pressed on (`web/src/lib/siteUrl.ts`), so Staging sends Staging links and localhost sends localhost links. Each address must be in that Supabase project's **Redirect URLs**.

### 7.1 Families: one login for brothers and sisters (added 27 Oct)

A parent with several children uses **one email and password** for all of them.

**Staff:** on each child's page, **Give portal access** with the **same email**.
- First child: the invite email is sent as usual.
- Each brother or sister: no email is sent. The message says *"Linked to the existing login for … which also opens …"*.
- The Student login card shows **Shared with** and links to the other children.
- **Remove access** on one child only unlinks that child. The login is deleted when its last child is removed.

**Parent:** the top bar shows the child's name as a dropdown, next to 🔑 Password. Picking another child reloads the dashboard, classes and homework for that child. The app remembers the last child picked; the first time, it opens on the first child by first name. Children who have left are not listed.

**How it works:** script `20261027000002_family_login.sql`.
- `students.auth_user_id` is no longer unique, so one login can be linked to several students.
- `login_current_student` stores the child each login last picked (no direct access; only through the functions below).
- `current_student_id()` returns the picked child if it is still linked to the login and hasn't left, otherwise the first child. Every `my_…` function goes through it, so a parent only ever sees their own children.
- `my_students()` lists the children for the dropdown; `switch_student(id)` changes the pick and refuses a child not linked to the login.
- Files: `web/src/app/(student)/StudentSwitcher.tsx` and `actions.ts` (new); `(student)/layout.tsx`, `student.module.css`, `(portal)/students/actions.ts`, `PortalAccess.tsx` (changed).

**Test:** give two test students access with the same email, sign in, switch child from the top bar, check each child's homework shows, then remove access on one child and check the other can still sign in.

---

## 8. Database scripts

Run once each, in order, in the Supabase SQL Editor.

| Script | Adds |
|---|---|
| `20261020000001_student_login.sql` | `students.auth_user_id`, `current_student_id()`, `my_dashboard()`, `my_homework()`, `my_handin_target()`, `my_handin_record()` |
| `20261020000002_homework_sheet_files.sql` | Homework files in `my_homework()`, plus `my_homework_file(file)` |
| `20261020000003_student_dashboard_tiles.sql` | `my_dashboard()` with class times, joined date, homework counts and recently marked |
| `20261020000004_lesson_plan_status.sql` | Topics start Not started; `homework_sheets.topic_id`; existing topic 1 reset (skipped once any topic is completed) |
| `20261020000005_student_class_schedule.sql` | `my_dashboard()` with each class's current topic |

---

## 9. All files changed

| File | Change |
|---|---|
| `supabase/migrations/20261020000001` to `…05` | New scripts (section 8) |
| `web/package.json`, `package-lock.json` | `pdf-lib` added |
| `web/public/logo.png`, `Logo/pencilmaths-logo.png` | Pencil Maths logo |
| `web/src/lib/supabase/admin.ts` | New: server-only full-rights connection (secret key) |
| `web/src/lib/google/drive.ts` | Added `downloadFile` and `wordToPdf` |
| `web/src/lib/homework/handin.ts` | New: shared file checks and Drive upload (`checkFile`, `fileKind`, `uploadHandIn`) |
| `web/src/lib/homework/sheets.ts` | New: attach homework file or link, and the blank PDF |
| `web/src/lib/homework/makePdf.ts` | New: builds the hand-in PDF in the browser |
| `web/src/lib/homework/convert.ts` | New: Word → PDF server action |
| `web/src/app/auth/accept/page.tsx` | New: invite landing page (implicit-flow fix, shows the reason) |
| `web/src/app/auth/confirm/route.ts` | New: for a custom invite template later |
| `web/src/app/no-access/page.tsx` | Wording fits students |
| `web/src/app/(portal)/layout.tsx` | Students go to `/me` |
| `web/src/app/(portal)/students/actions.ts` | Give, resend and remove access; any email |
| `web/src/app/(portal)/students/PortalAccess.tsx` | New: **Student login** card |
| `web/src/app/(portal)/students/[id]/page.tsx` | Shows the card |
| `web/src/app/(portal)/batches/actions.ts` | Shared `readHomework` / `insertHomework`, `addHomeworkFile`, `removeHomeworkFile`, `setTopicStatus`, `completeTopic` |
| `web/src/app/(portal)/batches/HomeworkSection.tsx` | File and link fields; homework files list |
| `web/src/app/(portal)/batches/CompleteTopic.tsx` | New: Mark completed pop-up |
| `web/src/app/(portal)/batches/[id]/page.tsx` | Lesson plan buttons and "homework sent" note |
| `web/src/components/ui.module.css` | Pop-up (`.dialog`) style |
| `web/src/app/h/[code]/HandInForm.tsx`, `handin.module.css` | Add photos and files one by one, then one PDF |
| `web/src/app/h/[code]/actions.ts`, `page.tsx` | Use the shared hand-in code |
| `web/src/app/(student)/layout.tsx`, `StudentNav.tsx`, `student.module.css` | Logo, tabs, name, Sign out; all student styles |
| `web/src/app/(student)/me/page.tsx`, `me/dashboard.ts` | Dashboard tiles; data types and `nextClass` |
| `web/src/app/(student)/me/classes/page.tsx` | New: My classes |
| `web/src/app/(student)/me/homework/page.tsx`, `actions.ts` | Tabs, green cards, 📄 files; hand-in for the signed-in student |
| `web/src/app/(student)/me/homework/file/[id]/route.ts` | New: opens a homework file for the student |

`(student)` and `(portal)` are **route groups**: the brackets don't appear in the address.

---

## 10. Security

| Risk | Protection |
|---|---|
| A student opens staff pages | Sent to `/me`; every table rule is `is_staff()`, so they'd see nothing anyway |
| A student sees another student's data or files | Only `my_…` functions, which look up the signed-in student; no student id comes from the browser |
| Secret key leaks | Only in `admin.ts` (`server-only`) and server settings |
| Removing a student login that is also staff | Unlinked only, never deleted |
| Student leaves | `current_student_id()` ignores them at once, so their login shows **No access** |
| Signed-out visitors | `my_…` functions can't be run by `anon` |
| Homework sent twice | One homework per topic (unique `topic_id`) |

---

## 11. Quick test

| Do this | Expected |
|---|---|
| Give a test student access, open the invite, set a password | Lands on `/me` with logo, name and tiles |
| Batch page › **Start** a topic › **Mark completed** › OK | Topic shows Completed and "homework sent"; the homework appears in the student's **To hand in** tab with a 📄 file |
| Student: take 2 photos and add 1 PDF › **Hand in (3 pages)** | One PDF in their Drive Homework folder; the homework turns green under **Handed in** |
| Staff mark it 8 / 10 | Dashboard **Recently marked** and the **Marked** tab show 8 / 10 |
| Dashboard blocks | Each opens the matching homework tab |
| **Class schedule** | Next class and topic for each class |
| Student types `/students` | Back on `/me` |
| WhatsApp hand-in link | Same multi-file, one-PDF hand-in |

---

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| "This link has expired" + **Reason:** | Read the reason. Press **Resend invite** and use the newest email once. If brand-new links fail, turn off Brevo click tracking |
| "Your homework folder is not ready yet" | The student has no Drive folder: student page › **Create Drive folder** |
| `Module not found: pdf-lib` | Run `npm install` in `web` |
| Word file "could not turn into a PDF" | Drive isn't connected, or save the file as PDF first |
| A photo "could not be read" | Often an iPhone HEIC photo in Chrome: retake it or choose a JPG |
| Dashboard shows no topic or next class | Run scripts `…03` and `…05`; check the batch has class times |
| Student sees **No access** | Status is **Left**, or script `…01` wasn't run |

---

## 13. Later

- Homework templates per topic, in place of the blank PDF.
- Email and WhatsApp messages when homework is sent or marked.
- Teacher logins (`teachers.auth_user_id`), so teachers move their own lesson plans.
- Attendance on the dashboard; holidays and cancelled classes in the schedule.
- A parent login that switches between siblings.
- The logo on the staff portal and the sign-in page.
