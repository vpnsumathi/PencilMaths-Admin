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

| Status | Badge | Meaning |
|---|---|---|
| `pending` | Not handed in (grey) | Nothing received |
| `received` | To mark (blue) | Files handed in |
| `marked` | Marked (green) | Mark entered |
| `excused` | Excused (grey) | Doesn't need doing |

---

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
- Rows = current batch members + anyone with a result who has left.
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
