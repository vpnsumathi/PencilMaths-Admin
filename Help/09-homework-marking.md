# PencilMaths-Admin — Help: Setting and marking homework (Phase 5)

> Staff set homework for a batch, see who handed it in, open their files and enter marks; families see the mark on their link.
> Builds on `08-homework-handin-link.md`.

| | |
|---|---|
| **Last updated** | 11 October 2026 |
| **Where** | Batch page → **Homework** section |
| **Database changes** | None (`homework_sheets`, `homework_results`, `file_links` already existed) |

---

## Contents

1. [The full homework flow](#1-the-full-homework-flow)
2. [What staff can do](#2-what-staff-can-do)
3. [Why it's built this way](#3-why-its-built-this-way)
4. [Files and why they live there](#4-files-and-why-they-live-there)
5. [Code overview](#5-code-overview)
6. [How to test](#6-how-to-test)
7. [Troubleshooting and next ideas](#7-troubleshooting-and-next-ideas)

---

## 1. The full homework flow

```
Batch page: Set homework ──► every student in the batch gets a "Not handed in" result
                                   │
Family's link shows it under "To hand in" ──► uploads ──► "To mark" on the batch page
                                   │
Staff: open File 1, File 2 in Drive ──► enter mark ──► "Marked"
                                   │
Family's link: "✅ Marked: 16 / 20"      Dashboard: "to mark" and "handed in %" update
```

---

## 2. What staff can do

| Action | How |
|---|---|
| **Set homework** | Title, set date (today by default), due date and maximum mark (both optional) → **Set homework** |
| **See progress** | One fold-out block per homework; opens by itself when something is waiting to be marked |
| **Open a student's work** | **File 1, File 2…** open in Google Drive (hover to see the file name) |
| **Mark** | Type the mark → **Save** |
| **Excuse** | **Excuse** (clears any mark) |
| **Delete** | **Delete homework** → confirm. Results go; files stay in Drive |
| **Give older homework to a new student** | Under the homework's table, **Not given to** lists students who joined after it was set → **Give homework** (added 23 Oct 2026) |

| Status | Badge | Meaning |
|---|---|---|
| `pending` | Not handed in (grey) | Nothing received |
| `received` | To mark (blue) | Files handed in |
| `marked` | Marked (green) | Mark entered |
| `excused` | Excused (grey) | Doesn't need doing |

### 2.1 New students only get future homework (23 Oct 2026)

A homework is given to a student only when they have a `homework_results` row for it. **Set homework** and **Mark completed** add a row for everyone in the batch **at that moment**. So a student who joins a batch later:
- does **not** see older homework on their login, WhatsApp link or dashboard;
- **does** get every homework set after they join;
- can be given an older homework by hand with **Give homework** (it then shows under **To hand in**).

Database script: `supabase/migrations/20261023000001_homework_for_new_students.sql` (run on **Staging** first). It changes `handin_page`, `handin_target`, `handin_record`, `my_dashboard` and `my_homework_file` to need the result row, and adds missing rows for students who were already in the batch when each homework was set, so nothing disappears for current students.

---

### 2.2 Marking in the browser (27 Oct 2026)

On the batch page, under **Upload Homework**, each student who handed in a file has a **🖊️ Mark** link. It opens the marking page in a new tab.

- **Tools:** ✏️ pen, 🖍️ highlighter, **T** text (click where it goes, then type), ✓ tick, ✗ cross, ⌫ eraser (click a mark to remove it), ✋ scroll (no drawing, handy on a tablet). Four colours, Thin/Thick, and ↶ Undo / ↷ Redo (Ctrl+Z / Ctrl+Y).
- **Mark** box and **Save & send**: the marks are written into the PDF, which becomes the student's corrected sheet (it replaces any earlier one). The mark is saved too. If the homework is already marked, the Mark box can be left empty.
- **Save & close**: keeps the marked sheet (and the mark, if typed) **without sending it**, and closes the tab. On the batch page the student's row then shows *Marked, not sent* with a **📤 Send** button. Send makes it the corrected sheet and saves the mark. Reopening **🖊️ Mark** before sending lets you change it; saving again replaces the unsent copy (the old one goes to the Drive bin).
- **Download marked PDF** saves it to the computer instead; **Open original** shows the student's file as handed in.
- With several hand-in files, buttons at the top choose **File 1, File 2…**.
- **Reopening** the page shows the marks sent before, so they can be changed and sent again.
- **Nothing is lost:** marks are kept in the browser as you go. If the tab closes or the connection drops before sending, opening the page again brings them back. The browser also warns before closing a tab with unsent marks.
- Photos handed in (JPG, PNG) are turned into a one-page PDF to mark. Other files (Word, HEIC) show **Open original** instead.

**How it works:**
- `web/src/app/(portal)/batches/[id]/mark/`: `page.tsx` (loads the homework), `Marker.tsx` (the tools; shows pages with Mozilla's pdf.js, `pdfjs-dist`, "legacy" build for older browsers), `marks.ts` (draws the marks and writes them into the PDF with `pdf-lib`), `actions.ts` (saving), `marker.module.css`.
- **Saving:** `startMarkedUpload` checks the mark and asks Google Drive for an upload address; the browser sends the PDF straight to Drive (so Vercel's 4.5 MB limit doesn't apply); `finishMarking` checks the file is in the student's Drive Homework folder, records it as the corrected sheet, saves the mark and the drawings. **Save & close** uses `saveMarkingDraft` instead: the file waits in the Homework folder, recorded in `homework_markups.draft_file_id` and `draft_mark`, until **📤 Send** (`sendMarkedDraft` in `batches/actions.ts`). Both send paths share `sendMarkedSheet` in `web/src/lib/homework/corrections.ts`. If the browser can't reach Drive directly, `uploadMarkedViaServer` sends it through the server instead (4 MB max).
- `web/src/app/(portal)/files/[id]/route.ts`: opens a hand-in from Drive for staff.
- `web/src/lib/homework/corrections.ts`: shared by this page and the corrected-sheet upload on the batch page.
- The drawings are kept in table `homework_markups` (script `20261027000003_homework_marking.sql`), one row per student per homework.

**Test:** hand in a PDF as a test student; on the batch page click **🖊️ Mark**; draw, add a tick and some text, enter a mark, **Save & send**. The student's My homework › Marked shows the marked sheet. Reopen **🖊️ Mark**: the marks are there to change.

## 3. Why it's built this way

| Choice | Reason |
|---|---|
| **Homework belongs to a batch** | Everyone in a class gets the same sheet |
| **"Pending" results created when homework is set** | Reports and the dashboard count students who haven't handed in |
| **Students who left keep their row** | Their work and marks aren't lost |
| **Maximum mark read from the database** | A tampered form can't save 30 / 20 |
| **One mark form with two buttons** | **Excuse** is a second submit button adding `excuse=true` |
| **"Are you sure?" before deleting** | `ConfirmButton`, a tiny reusable client component |
| **Section loads its own data** | The batch page just places `<HomeworkSection />` |

---

## 4. Files and why they live there

| File | Job | Why there |
|---|---|---|
| `web/src/app/(portal)/batches/HomeworkSection.tsx` | The Homework section | Used only on the batch page; async server component |
| `web/src/app/(portal)/batches/actions.ts` | **Added** `createHomework`, `markHomework`, `deleteHomework` | With the other batch actions |
| `web/src/app/(portal)/batches/[id]/page.tsx` | Places the section under Students / Lesson plan | The batch page |
| `web/src/components/ConfirmButton.tsx` | "Are you sure?" submit button | Shared; any page can reuse it |
| `web/src/components/ui.module.css` | **Added** `.homework`, `.files` | Shared styles |

---

## 5. Code overview

### 5.1 `createHomework`
1. Checks title, dates (due not before set) and maximum mark (> 0).
2. Inserts the `homework_sheets` row.
3. Inserts a `homework_results` row (status `pending`) for every current student.
4. Back to the batch page: "Homework set for N student(s)…".

### 5.2 `markHomework`
1. Checks the three ids; reads the sheet's `max_mark` **from the database**.
2. Mark must be ≥ 0 and ≤ maximum (unless excusing).
3. `upsert` on (`sheet_id`, `student_id`): updates the result, or adds it if missing.
   - Mark → `status = 'marked'`, `mark`, `marked_on = today`
   - Excuse → `status = 'excused'`, mark cleared

### 5.3 `deleteHomework`
Removes the sheet's `file_links` rows (they have no database link to the sheet), then the sheet; its results go automatically (`on delete cascade`). Drive files are kept.

### 5.4 `HomeworkSection.tsx`
- One query: the batch's sheets with each result and the student's name (`homework_results(…, students(first_name, last_name))`), newest first.
- A second query: all `homework_submission` file records for those sheets.
- Rows = students with a result for that homework (the ones it was given to). Current members without one are listed under **Not given to** with a **Give homework** button (`giveHomework` in `actions.ts`: checks the homework is in the batch and the student is in the class, then adds a `pending` result).
- `<details open={toMark > 0}>` folds each homework away unless it needs marking.
- `as unknown as Result[]`: Supabase can't tell `students(...)` is one row here, so the type is set by hand.

---

## 6. How to test

| Do this | Expected |
|---|---|
| Batch page → Set "Fractions worksheet", max 20 | New block; everyone **Not handed in** |
| Student's link (private window) | Listed under **To hand in** |
| Hand in a photo + Word file | Batch page: block open, **1 to mark**, **File 1, File 2** open in Drive |
| Enter 16 → Save | **Marked**; link shows **✅ Marked: 16 / 20** |
| Enter 25 → Save | "The mark can't be more than 20." |
| **Excuse** another student | **Excused** |
| Dashboard | "to mark" and "handed in %" change |
| Add a new student to a batch that already has homework | Batch page: they are under **Not given to**; their login shows no old homework |
| **Give homework** for them | They move into the table as **Not handed in**; it appears under **To hand in** on their login |
| Set a new homework | The new student gets it straight away |
| **Delete homework** → OK | Gone from the batch and the link; files still in Drive |

---

## 7. Troubleshooting and next ideas

| Problem | Fix |
|---|---|
| No Homework section | `<HomeworkSection batchId={batch.id} members={students} />` missing from the batch page |
| "Homework set for 0 student(s)" | The batch has no students yet; add them from the student page |
| Mark saved but family still sees "Received" | Refresh the link page |
| TypeScript error about `students` in `HomeworkSection` | Keep `as unknown as Result[]` |

**Next ideas:** edit a homework's title or dates; a homework tab on the student page with all their marks; tell the teacher when something is handed in; homework reports per batch.
