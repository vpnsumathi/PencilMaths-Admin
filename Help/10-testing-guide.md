# PencilMaths-Admin — Help: Testing guide

> How to test everything built so far: sign-in, staff, subjects, teachers, batches, students, the dashboard, enquiries and the WhatsApp homework feature (Phases 1–5).
> Each section has a table. Do what the left column says, check that the right column matches, then tick the box. The detailed guides are linked in each heading.

| | |
|---|---|
| **Last updated** | 16 October 2026 |
| **Covers** | Everything up to Phase 5 (the latest saved change, "Phase 5: set homework, view submissions and mark on the batch page") |
| **Not covered yet** | Staff invites and the audit log (Phase 6, not built) |
| **Time needed** | About 10 minutes for the quick check (section 2) and 1.5 to 2 hours for everything |

---

## Contents

1. [Before you start](#1-before-you-start)
2. [Quick check (10 minutes)](#2-quick-check-10-minutes)
3. [Sign in, sign out and access](#3-sign-in-sign-out-and-access)
4. [Password reset](#4-password-reset)
5. [Staff](#5-staff)
6. [Subjects and curriculum](#6-subjects-and-curriculum)
7. [Teachers](#7-teachers)
8. [Batches](#8-batches)
9. [Students](#9-students)
10. [Dashboard](#10-dashboard)
11. [Enquiries (Phase 1)](#11-enquiries-phase-1)
12. [Google Drive connection (Phase 2)](#12-google-drive-connection-phase-2)
13. [Student Drive folders (Phase 3)](#13-student-drive-folders-phase-3)
14. [WhatsApp hand-in link (Phase 4)](#14-whatsapp-hand-in-link-phase-4)
15. [Setting and marking homework (Phase 5)](#15-setting-and-marking-homework-phase-5)
16. [The whole journey, end to end](#16-the-whole-journey-end-to-end)
17. [Security checks](#17-security-checks)
18. [Phone and browser checks](#18-phone-and-browser-checks)
19. [Testing on Vercel (the live address)](#19-testing-on-vercel-the-live-address)
20. [After testing: tidy up](#20-after-testing-tidy-up)
21. [Reporting a problem](#21-reporting-a-problem)
22. [Results log](#22-results-log)

---

## 1. Before you start

| # | Get ready | Why |
|---|---|---|
| 1 | In VS Code's terminal, go to the `web` folder and run `npm run dev`, then open http://localhost:3000 | Most tests run on your computer first |
| 2 | Supabase SQL Editor: run `supabase/clear_dummy_data.sql`, then `supabase/dummy_data.sql` | Gives you a known starting point: 5 teachers, 4 batches, 8 students, 4 enquiries, 3 weeks of classes (the latest week not logged) |
| 3 | Have **two accounts**: your own **admin** account and a second staff account with the role **Operations** | Some screens are for admins only, and you need the second account to check that |
| 4 | Keep a **private window** open (Ctrl+Shift+N in Chrome or Edge) | Families aren't signed in, so their hand-in link must be tested in a window with no sign-in |
| 5 | Have a test photo (JPG), a PDF and a small Word file on your computer, plus one file over 4 MB | For the hand-in tests |
| 6 | Open Google Drive in another tab | To see folders and files appear |
| 7 | Press **F12** and look at the **Console** tab whenever something looks wrong | Errors show there, and in the VS Code terminal |

> **Never** run the dummy data scripts on the live database with real families in it. `clear_dummy_data.sql` empties every table except subjects, curriculum and staff.

**Getting the second (Operations) account:** until staff invites are built (Phase 6), create the user in Supabase under **Authentication › Users › Invite user**. Then add their `staff` row in SQL the same way you added your own, with `role = 'operations'`.

---

## 2. Quick check (10 minutes)

Run this after any change, before the full test.

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Open http://localhost:3000 | Goes to `/login` |
| ☐ | Sign in as admin | Dashboard with your name, tiles and charts |
| ☐ | Click every item in the sidebar: Dashboard, Students, Teachers, Batches, Enquiries, Subjects, Staff | Each page opens with data and no red error page |
| ☐ | Open one student, one batch, one enquiry and one teacher | Detail pages open |
| ☐ | Open a student's hand-in link in the private window | "Hi *Name* 👋" page |
| ☐ | Sign out | Back to `/login` |

---

## 3. Sign in, sign out and access

([01-project-guide.md](01-project-guide.md), sections 8 and 8.5)

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Open http://localhost:3000 while signed out | Goes to `/login` |
| ☐ | Type `/students` in the address bar while signed out | Goes to `/login` (every portal page is protected) |
| ☐ | Wrong password | Red message; **the email stays filled in** |
| ☐ | Click the eye icon | The password becomes visible |
| ☐ | Correct email and password | Dashboard opens |
| ☐ | Go to `/login` while signed in | Goes to the dashboard |
| ☐ | Sign out from the sidebar | Back to `/login`; the Back button doesn't show portal pages |
| ☐ | Deactivate the Operations account (section 5), then sign in with it | Signs in but lands on **No access** |
| ☐ | Reactivate it and sign in again | The portal opens |

---

## 4. Password reset

([01-project-guide.md](01-project-guide.md), section 8.6)

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | On `/login` click **Forgot password?**, then **Back to sign in** | Switches between the two forms |
| ☐ | Forgot password: enter your email and send | Green "check your email" message |
| ☐ | Open the email **in the same browser** and click the link | **Choose a new password** page |
| ☐ | Enter a password under 8 characters | "Use at least 8 characters." |
| ☐ | Enter two different passwords | "The passwords do not match." |
| ☐ | Enter a valid new password twice | Lands on the dashboard |
| ☐ | Sign out and sign in with the new password | Works |
| ☐ | Click the same email link again | Goes back to `/login` (a link works only once) |

> Supabase's built-in email sends only a few emails per hour. If nothing arrives, check spam and wait.

---

## 5. Staff

([03-core-admin-screens.md](03-core-admin-screens.md), section 1)

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Open **Staff** as admin | Everyone listed. Your row says **You** and has no buttons |
| ☐ | Change the Operations person's role to **Head teacher** and press Save | "Role updated." |
| ☐ | Change it back to **Operations** | "Role updated." |
| ☐ | **Deactivate** them | "Account deactivated."; status **Inactive** |
| ☐ | **Reactivate** them | "Account reactivated."; status **Active** |
| ☐ | Sign in as the Operations person and type `/staff` | Sent to the dashboard (admins only) |

---

## 6. Subjects and curriculum

([03-core-admin-screens.md](03-core-admin-screens.md), section 3)

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Open **Subjects** as admin | 4 subjects with topic counts (Maths 16, Science 14, English 12, 11+ 12) |
| ☐ | Add a subject "Test subject" | It appears in the list |
| ☐ | Move it up and down | The order changes and stays after a refresh |
| ☐ | Rename it, then turn it **off** | It shows as off |
| ☐ | Open **Maths** › Curriculum | Its topics in order |
| ☐ | Add a topic, rename it, move it up, then remove it | Each change shows straight away |
| ☐ | Sign in as Operations and open `/subjects` | Can't change anything (admins only) |

> Curriculum changes only affect **new** batches. Existing lesson plans don't change.

---

## 7. Teachers

([03-core-admin-screens.md](03-core-admin-screens.md), section 5)

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Open **Teachers** | 5 teachers with code, subject, years, status, and batch and student counts. Sara Ahmed is **On leave** |
| ☐ | **Add teacher** with a name, email, subject and years 7 to 11 | Saved, with a new code (T006 and so on) |
| ☐ | Add another teacher with the **same email** | "Another teacher already uses that email." |
| ☐ | Enter years 11 to 7 (lowest above highest) | "The lowest year group cannot be above the highest." |
| ☐ | Leave the email as `abc` | "Enter a valid email address." |
| ☐ | Click a teacher, change the phone number and save | Saved |

---

## 8. Batches

([03-core-admin-screens.md](03-core-admin-screens.md), section 6)

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Open **Batches** | 4 open batches with teacher, weekly times, places used and lesson-plan progress |
| ☐ | **New batch**: Maths, Year 8, a teacher, Tuesday 17:00 | "Batch created."; the lesson plan has the Maths topics |
| ☐ | Leave the year group empty | "Choose a year group." |
| ☐ | Fill in a day but no time | A message about half-filled class times |
| ☐ | Edit the batch: change the teacher and add a second weekly time | "Batch saved."; the students in it now show the new teacher |
| ☐ | Try to **close** a batch that has students | "Move its students to another batch before closing it." |
| ☐ | Close the empty new batch, then reopen it | "Batch closed." then "Batch reopened." |

---

## 9. Students

([03-core-admin-screens.md](03-core-admin-screens.md), section 7)

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Open **Students** | 8 students, with attendance % and homework % |
| ☐ | Search for part of a name, then a code such as `PM-10` | The list filters |
| ☐ | Search for `'; drop` | No error; just no results |
| ☐ | Change the status filter to include **Left** | Students who have left appear |
| ☐ | **Add student** with no subject ticked | "Tick at least one subject." |
| ☐ | Add a student with Maths ticked and a Maths batch chosen | "Student and Drive folder added"; the teacher is filled in from the batch |
| ☐ | Open the student | 28-day stats, Drive folder link, hand-in link card |
| ☐ | Untick a subject and save | That subject ends; the others stay |
| ☐ | Set the status to **Left** | Their batch place is freed (batch places go down by one) |

> Known limit: if saving fails, the form reloads empty with the error message.

---

## 10. Dashboard

([03-core-admin-screens.md](03-core-admin-screens.md), section 8)

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Open the dashboard | Greeting, 5 tiles, attendance chart, **Needs attention**, students by subject and year, batch places and the enquiry pipeline |
| ☐ | Switch the range: 7 days, 4 weeks, 90 days | Numbers change; the address shows `?range=…` |
| ☐ | Hover over a bar, or use Tab to reach it | A tooltip with the value |
| ☐ | Press **Table** on a chart | The same data as a table |
| ☐ | **Needs attention** | Lists the unlogged classes from the latest week (from the dummy data), homework to mark, students without a batch and enquiries waiting 7 or more days |
| ☐ | Click an enquiry in Needs attention | Opens that lead |

---

## 11. Enquiries (Phase 1)

([04-enquiries.md](04-enquiries.md))

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Open **Enquiries** | 4 dummy leads; tabs for Open and the other stages; an **In stage** column (days) |
| ☐ | **Add enquiry**: Year 7, Maths ticked, a parent name and phone | "Enquiry added."; the history shows **New** |
| ☐ | Move it to **Assessment sent** | Green message, a new history row, the badge changes |
| ☐ | Enter score 120 and save | "The assessment score must be between 0 and 100." |
| ☐ | Enter score 75 and save | "Enquiry updated." |
| ☐ | Move it on to **Confirmed** | Each move adds a history row |
| ☐ | **Convert to student** | The student page opens with Maths and the parent filled in, plus "Student and Drive folder created" |
| ☐ | Go back to the lead | "Converted to a student"; the stage can't be changed |
| ☐ | **Enrolled** tab | The lead is listed |
| ☐ | Add a second lead and mark it **Not proceeding** | It leaves the Open tab and is never deleted |
| ☐ | Dashboard | Open enquiries and the pipeline have updated |

---

## 12. Google Drive connection (Phase 2)

([05-gdrive-setup.md](05-gdrive-setup.md), [06-gdrive-code.md](06-gdrive-code.md))

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Type `/google-drive` (admins only; it isn't in the sidebar) | **Google settings: ✅ found** |
| ☐ | Click **Test connection** | **Connected to Google Drive.** and an **Open … in Drive** link |
| ☐ | Look in Drive | `PencilMaths / Students` exists |
| ☐ | Click Test connection again | Still only **one** `PencilMaths` folder |
| ☐ | Sign in as Operations and open `/google-drive` | Not allowed |

---

## 13. Student Drive folders (Phase 3)

([07-gdrive-student-folders.md](07-gdrive-student-folders.md))

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Convert a lead (section 11) | Drive has `PencilMaths / Students / PM-10xx Name / Homework` |
| ☐ | Open that student's page | **Open the Google Drive folder →**; no "Create Drive folder" card |
| ☐ | Open a dummy-data student (for example Aarav Patel) | A **Create Drive folder** card |
| ☐ | Click it | The folder appears in Drive and the page shows the link |
| ☐ | Refresh and look in Drive | No duplicate folders |
| ☐ | Save that student's form again | The Drive link is still there |
| ☐ | SQL: `select student_id, provider, external_id, url from file_links where owner_type = 'student_folder';` | `google_drive` rows with a Drive id |
| ☐ | **Failure test:** change one letter of `GOOGLE_REFRESH_TOKEN` in `web/.env.local`, restart, add a student | The student is still created, with a red message about Drive |
| ☐ | **Put the token back** and restart | Adding works normally again |

---

## 14. WhatsApp hand-in link (Phase 4)

([08-homework-handin-link.md](08-homework-handin-link.md))

First set a homework for the student's batch (section 15, first row). Otherwise the link has nothing to show.

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | SQL: `select first_name, handin_code from students limit 3;` | Everyone has a code |
| ☐ | Student page (one with a Drive folder) | A **WhatsApp hand-in link** card with **Copy link** and **Send on WhatsApp** |
| ☐ | **Send on WhatsApp** | WhatsApp opens with the link in the message |
| ☐ | Copy the link and open it in the **private window** | "Hi *Name* 👋" and their homework under **To hand in** |
| ☐ | The page shows only the first name and homework | No surname, phone, email or other students |
| ☐ | Press **Hand in** with no file chosen | The camera or file picker opens (never a dead button) |
| ☐ | Hand in a photo and a Word file | "✅ Received", then **Handed in · 2 files** |
| ☐ | Hand in a PDF | Accepted |
| ☐ | Try a file over 4 MB that isn't a photo, or an `.exe` or `.zip` | Refused with a message |
| ☐ | Look in the student's Drive `Homework` folder | The files are there |
| ☐ | Change one character of the link | Not found |
| ☐ | **Reset link** on the student page, then open the old link | Not found; the new link works |
| ☐ | Set the student's status to **Left**, then open their link | Stops working (set them back afterwards) |

---

## 15. Setting and marking homework (Phase 5)

([09-homework-marking.md](09-homework-marking.md))

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Batch page › **Homework**: set "Fractions worksheet", max 20 | A new block; everyone is **Not handed in** |
| ☐ | Leave the title empty | "Enter a homework title." |
| ☐ | Make the due date earlier than the set date | "The due date cannot be before the date it is set." |
| ☐ | Max mark 0 | "The maximum mark must be more than 0." |
| ☐ | A student hands in through their link (section 14) | The batch page block opens by itself showing **1 to mark**, with **File 1, File 2** |
| ☐ | Click File 1 | Opens in Google Drive |
| ☐ | Enter 25 and save | "The mark can't be more than 20." |
| ☐ | Enter -1 | "Enter a mark of 0 or more." |
| ☐ | Enter 16 and save | "Mark saved."; **Marked** |
| ☐ | The student's link | **✅ Marked: 16 / 20** |
| ☐ | **Excuse** another student | "Marked as excused."; **Excused** |
| ☐ | Dashboard | The "to mark" count and "handed in %" have changed |
| ☐ | **Delete homework** and confirm | "Homework deleted. Any handed-in files are still in Google Drive."; it's gone from the batch and the link, and the files are still in Drive |

---

## 16. The whole journey, end to end

The single most important test: one new family from first enquiry to a marked homework.

```
Enquiry ─► Convert ─► Drive folder ─► Join batch ─► Homework set ─► Family hands in ─► Staff mark ─► Family sees mark
```

| ✅ | Step | Expected |
|---|---|---|
| ☐ | 1. Add an enquiry "Test Family", Year 9, Maths | Lead created |
| ☐ | 2. Move it to Confirmed and **Convert to student** | Student and Drive folder created |
| ☐ | 3. Edit the student and put them in the Year 9 Maths batch | The teacher fills in from the batch |
| ☐ | 4. On that batch, set a homework, max 10 | The new student is listed as **Not handed in** |
| ☐ | 5. Copy the student's hand-in link and open it in the private window, on your phone if possible | The homework is under **To hand in** |
| ☐ | 6. Hand in a phone photo | "✅ Received"; the file is in their Drive `Homework` folder |
| ☐ | 7. Batch page: open the file and mark 8 / 10 | **Marked** |
| ☐ | 8. Refresh the family link | **✅ Marked: 8 / 10** |
| ☐ | 9. Dashboard | Students, enquiry pipeline and homework figures all reflect it |

---

## 17. Security checks

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | Signed out, try `/`, `/students`, `/batches/<any id>`, `/staff` | All go to `/login` |
| ☐ | As Operations, try `/staff`, `/subjects` changes and `/google-drive` | Blocked (admins only) |
| ☐ | As admin, try to change your own role or deactivate yourself | Not possible (no buttons) |
| ☐ | In the private window, open `/h/abc` | Not found |
| ☐ | Press **F12 › Sources** on any page and search for `GOOGLE_` or `refresh` | Nothing found (secrets stay on the server) |
| ☐ | Check that `web/.env.local` is **not** on GitHub | Only on your computer |

---

## 18. Phone and browser checks

| ✅ | Do this | Expected |
|---|---|---|
| ☐ | F12 › **Ctrl+Shift+M** › iPhone 12 Pro: open the login, dashboard and students pages | No sideways scrolling; the menu button opens the sidebar |
| ☐ | Wide tables (students, batches) on a phone | They scroll inside their box, not the whole page |
| ☐ | Hand-in link on a **real phone** (Android and iPhone if you can) | The camera opens; a 3 to 6 MB photo uploads (it's shrunk first) |
| ☐ | Hand-in link in WhatsApp's own browser | Works the same |
| ☐ | Chrome, Edge and Safari (if available) | Same results |

---

## 19. Testing on Vercel (the live address)

([03-core-admin-screens.md](03-core-admin-screens.md), section 9; [05-gdrive-setup.md](05-gdrive-setup.md), section 4)

Repeat **section 2 (Quick check)**, **section 12 (Drive connection)** and **section 16 (whole journey)** on the Vercel address.

| ✅ | Check | Expected |
|---|---|---|
| ☐ | Opening the site | No `500 MIDDLEWARE_INVOCATION_FAILED` (Supabase settings are in Vercel) |
| ☐ | Password reset email link | Opens the Vercel address, not localhost (Site URL and Redirect URLs are set in Supabase) |
| ☐ | `/google-drive` › Test connection | Connected (the 3 `GOOGLE_…` secrets are in Vercel) |
| ☐ | The hand-in link copied from a student page | Starts with the Vercel address |
| ☐ | Upload a 3 to 6 MB phone photo | Works (Vercel limits each request to about 4.5 MB, and photos are shrunk first) |

---

## 20. After testing: tidy up

| ✅ | Do this |
|---|---|
| ☐ | Put back anything you broke on purpose: `GOOGLE_REFRESH_TOKEN`, a student's status, a deactivated account |
| ☐ | Turn the "Test subject" off, or leave it off (subjects can't be deleted) |
| ☐ | Delete test folders in Drive under `PencilMaths / Students` if you no longer want them |
| ☐ | To start fresh, run `clear_dummy_data.sql`, then `dummy_data.sql` (**test database only**) |

---

## 21. Reporting a problem

Copy this into a message to Claude or into your notes:

```
Section and row: (e.g. 14, "Hand in a photo and a Word file")
Where: localhost / Vercel, browser, phone or computer
What I did:
What I expected:
What happened instead: (the exact message)
Terminal or Console error: (paste it)
Screenshot: (attach)
```

---

## 22. Results log

| Date | Where (local or Vercel) | Sections tested | Passed | Problems found |
|---|---|---|---|---|
| | | | | |
