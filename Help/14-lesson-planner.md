# PencilMaths-Admin — Help: Lesson planner

> Each year's lesson plan (terms, modules, lessons and three homework worksheets per lesson) lives in the **Lesson library**.
> On a class's batch page, teachers pick a term and module, move lessons through Not started → In progress → Completed,
> and completing a lesson sends the chosen worksheets to every student. Staff mark them and can upload a corrected sheet.

| | |
|---|---|
| **Last updated** | 25 October 2026 |
| **Pages** | `/lesson-library` (admin), batch page › **Lesson plan**, student **My homework** |
| **Database script** | `supabase/migrations/20261024000001_lesson_planner.sql` (Staging first, Prod at go-live) |
| **Source files** | `Lesson planner/Term Lesson Plan - Year 5.xlsx` and `Lesson planner/Year 5 Term 1 worksheets/` |
| **Plan** | `plans/lesson-planner.md` in the Claude project |

---

## Contents

1. [The whole flow](#1-the-whole-flow)
2. [Set-up (once per year group)](#2-set-up-once-per-year-group)
3. [Teaching: the batch page](#3-teaching-the-batch-page)
4. [Marking and corrected sheets](#4-marking-and-corrected-sheets)
5. [Database](#5-database)
6. [Files and code](#6-files-and-code)
7. [How to test](#7-how-to-test)
8. [Troubleshooting](#8-troubleshooting)
9. [Batch page layout](#9-batch-page-layout)
10. [Change history](#10-change-history)
11. [Later](#11-later)

---

## 1. The whole flow

```
Admin: Lesson library ─ import spreadsheet ─ upload worksheets (Y5 - A001.pdf …)
                                   │
Teacher: batch page › Term › Module › lesson: Start → Mark completed
                                   │  pop-up: tick Hw-1 / Hw-2 / Hw-3, dates, mark → Send
                                   ▼
Student: My homework › To hand in › 📄 worksheet › Hand in (photos/files → one PDF)
                                   │
Staff: batch page › Upload Homework › File 1 › mark + corrected sheet › Save
                                   ▼
Student: My homework › Marked › ✅ mark · 📎 their file · ✏️ corrected sheet
```

---

## 2. Set-up (once per year group)

1. Run `20261024000001_lesson_planner.sql` in the **Staging** Supabase SQL Editor (after `20261023000001`).
2. Sign in as an **admin** › sidebar **Lesson library**.
3. **Import a lesson plan:** Subject **Maths**, Year **5**, choose `Term Lesson Plan - Year 5.xlsx` › **Import**.
   - It reads the sheets named **Term 1/2/3**, the row with the **Lesson Code** heading, and every lesson under it.
   - Year 5 gives: 3 terms, 8 modules, 95 lessons, 285 homework codes.
   - Codes are saved without spaces: `Y5 - T1L1` → `Y5-T1L1`.
   - Importing again (after editing the spreadsheet) updates names, modules and order and adds new lessons. Nothing is deleted. If a lesson's Hw code changes, that slot's worksheet is cleared so the right one can be uploaded.
4. **Upload worksheets:** choose all PDFs in `Year 5 Term 1 worksheets` at once › **Upload**. Each file name is its code (`Y5 - A001.pdf` → `Y5-A001`). They go to Google Drive › `PencilMaths/Homework library/Maths Year 5`. A file uploaded again replaces the old one.
5. The table below shows each lesson's Hw-1/2/3 as **✅** (worksheet ready, click to open) or **⚠️** (no worksheet yet).

> Worksheets must be uploaded through this page. The app's Google access only reaches files it uploaded itself, so PDFs copied into Drive by hand can't be sent.

---

## 3. Teaching: the batch page

Any class whose **subject and year** are in the library (e.g. a Maths Year 5 batch) shows the new **Lesson plan**. Other classes keep the old topic list.

- **Term** and **Module** dropdowns. The page opens on where the class is: the lesson in progress, otherwise the next one not completed.
- A line shows progress: "Term 1: 3 of 31 lessons completed. Now on Y5-T1L4 …".
- Each lesson shows its code, name, Hw codes (⚠️ = no worksheet), what was already sent, its status and buttons:

| Status | Buttons |
|---|---|
| Not started (grey) | **Start** |
| In progress (**solid green label, row shaded green**) | **Mark completed**, **Undo** (back to Not started) |
| Completed (with date) | **Undo** (back to In progress; homework already sent stays) |

**Mark completed** pop-up:
- Hw-1, Hw-2, Hw-3 with **View**. Hw-1 is ticked. Tick any you want to send.
- A sheet without a worksheet, or already sent to this class, can't be ticked.
- **Set on** (today), **Due on** (+5 days), **Maximum mark** (10).
- **Complete and send** creates one homework per ticked sheet, titled e.g. `Digits and their places · Hw-1 (Y5-A001)`, with the worksheet attached, for every student in the class now. With nothing ticked, the lesson is just marked completed.

### 3.1 Students who join late: giving past homework

Homework only goes to the students in the class **when it is set**. A student who joins later gets every homework from then on, but none of the older ones, unless staff give it to them:

- **For one student, several homework at once:** in the **Students** box, a student who is missing older homework has **Give past homework (3)** (the number of homework they don't have). It opens a pop-up listing that homework with **all ticked**. Untick any they shouldn't do › **Give ticked homework**. They appear under the student's **To hand in** straight away, with their worksheets.
- **For one homework:** open it under **Upload Homework**. Below the table, **Not given to** lists students who joined after it was set, each with **Give homework**.

Either way, the student then appears in that homework's table as **Not handed in**, and the button disappears once they have everything.

---

## 4. Marking and corrected sheets

Batch page › **Upload Homework** › open a homework (the latest active one is already open):
- **File 1, File 2…**: the student's hand-in (opens in Google Drive, download from there).
- Enter the **mark**, optionally choose the **corrected sheet** (PDF or photo) in the box next to it, then **Save** (one button saves both). Or **Excuse**.
- The corrected sheet goes into the student's Drive `Homework` folder as `2026-10-24 18.30 <title> - corrected.pdf` and shows as **✏️ Corrected** in the Files column.
- For a homework already marked, choose a file and **Save** with the mark box left as it is (or empty) to add a corrected sheet.

The student sees the mark on their dashboard under **Recently marked** (for 14 days) and on **My homework › Marked**, with the corrected sheet under "Corrected by your teacher".

> Saving the mark is what makes it **Marked**. A corrected sheet on its own doesn't mark the homework.

---

## 5. Database

| Table | Holds |
|---|---|
| `lessons` | subject, year, term (1–3), module, `code` (unique, `Y5-T1L1`), name, position in the term |
| `lesson_homework` | 3 per lesson: `slot` (1–3), `code` (unique, `Y5-A001`), `drive_file_id`, `url`, `file_name` |
| `batch_lessons` | per class and lesson: `status` (not_started / in_progress / complete), `started_on`, `completed_on`. No row = Not started |
| `homework_sheets.lesson_homework_id` | which library sheet a homework came from; unique per batch, so it is never sent twice |
| `file_links` owner_type `homework_correction` | a corrected sheet: `owner_id` = homework, `student_id` = student |

- **Rules:** all staff read the library; only admins change it. All staff can change `batch_lessons`.
- **`import_lessons(subject, year, lessons)`**: admin only; adds or updates lessons by code and their homework slots in one go.
- **`my_homework()`** now also returns `corrected`; **`my_homework_file()`** lets a student open their own corrected sheets.

---

## 6. Files and code

| File | Job |
|---|---|
| `supabase/migrations/20261024000001_lesson_planner.sql` | Tables, rules, `import_lessons`, student functions |
| `web/src/lib/lessons/xlsx.ts` | Small `.xlsx` reader (unzips the file and reads cells; no extra library) |
| `web/src/lib/lessons/plan.ts` | Reads the Term sheets into lessons; checks for missing or repeated codes; `cleanCode` |
| `web/src/app/(portal)/lesson-library/page.tsx` | Lesson library page: import form, upload box, library table by term |
| `web/src/app/(portal)/lesson-library/actions.ts` | `importLessonPlan`, `uploadWorksheet` (one file per call, matched by name) |
| `web/src/app/(portal)/lesson-library/WorksheetUpload.tsx` | Sends the chosen files one at a time and shows ✅ / ⚠️ for each |
| `web/src/app/(portal)/batches/LessonPlanner.tsx` | Batch page lesson plan: works out the current lesson, lists the chosen module |
| `web/src/app/(portal)/batches/PlannerPicker.tsx` | Term and Module dropdowns (change the address `?term=1&module=…`) |
| `web/src/app/(portal)/batches/CompleteLesson.tsx` | Mark completed pop-up with Hw-1/2/3 ticks |
| `web/src/app/(portal)/batches/actions.ts` | `setLessonStatus`, `completeLesson`; `markHomework` (mark + optional corrected sheet via `saveCorrection`); `giveHomework` (one or more past homework to one student) |
| `web/src/app/(portal)/batches/HomeworkSection.tsx` | **Upload Homework** section: latest active homework open and highlighted, ✏️ Corrected links, mark + corrected sheet form, **Not given to** |
| `web/src/app/(portal)/batches/GivePastHomework.tsx` | **Give past homework (N)** pop-up next to a student |
| `web/src/app/(portal)/batches/[id]/page.tsx` | Lesson planner for library classes (old list otherwise), green **📘 Homework** button, past homework per student |
| `web/src/app/(portal)/batches/BatchForm.tsx` | **Save** button inside the Weekly class times box |
| `web/src/components/ui.module.css`, `StatusBadge.tsx` | Green In progress label and row, latest homework highlight, green button, section header bars |
| `web/src/app/(student)/me/homework/page.tsx` | "Corrected by your teacher" files |
| `web/src/components/AppShell.tsx` | **Lesson library** link for admins |
| `web/src/lib/form.ts` | `redirectWith` works with addresses that already have `?term=…` |

---

## 7. How to test

| Do this | Expected |
|---|---|
| Lesson library › import the Year 5 spreadsheet | "Imported Year 5: 3 term(s), 8 modules, 95 lessons … 285 homework codes" |
| Import it again | Same numbers, "0 new, 95 updated" |
| Upload the 21 PDFs | 21 ✅; Term 1 lessons 1–7 show ✅ for all three sheets; the rest ⚠️ |
| Upload a file called `Notes.pdf` | ⚠️ "No homework with code NOTES" |
| Maths Year 5 batch page | **Lesson plan** with Term 1 › Understanding Numbers; Y5-T1L1 to L4 |
| Change Module to Negative Numbers | Lessons L5–L7 |
| **Start** Y5-T1L1 | In progress, **Mark completed** appears |
| **Mark completed** | Pop-up: Hw-1 Y5-A001 ticked, View links work |
| Tick Hw-2 too › Send | "Homework Y5-A001, Y5-A002 sent to N student(s)"; lesson Completed with today's date; two homework in the Homework section |
| Student login › My homework | Both under To hand in, each with 📄 Y5-A001.pdf / Y5-A002.pdf that opens |
| Hand in, then staff enter a mark, choose the corrected sheet and **Save** | "Mark and corrected sheet saved"; ✏️ Corrected in the Files column |
| Student dashboard | The homework under **Recently marked** with its mark |
| Student › Marked | Mark, their file and "Corrected by your teacher" ✏️ file that opens |
| **Undo** then **Mark completed** again | Hw-1 and Hw-2 show "already sent"; Hw-3 can still be sent |
| A lesson with ⚠️ sheets | Those can't be ticked |
| A Science batch | Old topic list as before |
| Batch page **📘 Homework** button | Jumps to the latest active homework, open and highlighted green with a **Latest** label; others collapsed |
| Add a new student to a batch that has 3 homework | **Give past homework (3)** next to them in Students |
| Open it, untick one › **Give ticked homework** | "2 homework given…"; button now says (1); the student sees 2 under To hand in |

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| "Nothing imported. … no "Lesson Code" heading found." | The Term sheet needs a heading row with Module, Lesson Code, Lesson, Hw - 1, Hw - 2, Hw - 3 |
| "Lesson Y6-… isn't a Year 5 code" | Wrong year chosen for that spreadsheet |
| "a homework code is already used by another lesson" | The same Hw code is on two lessons (across years too); fix the spreadsheet |
| Worksheet "No homework with code …" | Rename the file to its code (`Y5 - A001.pdf`), or import the plan first |
| Batch page still shows the old topic list | The batch's subject/year has no library yet, or the script wasn't run |
| "has no worksheet yet" when sending | Upload that PDF in the Lesson library |
| Student can't open the worksheet | It was copied into Drive by hand; upload it through the Lesson library |
| "Could not upload the corrected sheet" | Check Google Drive is connected (Google Drive page) and the file is under 4 MB |

---

## 9. Batch page layout

From the top:
1. Title, e.g. **B-001 · Maths · Year 5**, with a green **📘 Homework** button that jumps to the latest active homework.
2. **Batch** details and **Weekly class times (UK time)**, with **Save** and **Cancel** at the bottom of the class times box (saves both boxes).
3. **Students**, with **Give past homework** where needed.
4. **Lesson plan** (term and module planner, or the old topic list).
5. **Upload Homework**: set a homework by hand, then one block per homework, newest first. The **latest active** one (the newest that someone still has to hand in or have marked; otherwise the newest) is open, green and labelled **Latest**. The rest are collapsed; click a title to open it.

Every section heading is a header bar: soft purple tint, purple stripe on the left, bold text.

---

## 10. Change history

| Date | Change |
|---|---|
| 24 Oct 2026 | Lesson library, batch lesson planner, Mark completed with Hw-1/2/3, corrected sheets |
| 25 Oct 2026 | In progress lessons in green |
| 25 Oct 2026 | Mark and corrected sheet saved with one **Save**, so marked homework shows under the student's **Recently marked** |
| 25 Oct 2026 | Homework section renamed **Upload Homework**; latest active homework open and highlighted; **📘 Homework** button |
| 25 Oct 2026 | Section headings shown as header bars; class times **Save** button moved inside its box |
| 25 Oct 2026 | **Give past homework** for students who joined late |

---

## 11. Later

- Class numbers, dates, revisions, tests and reports from `Copy of Year 5 - LT - Model.xlsx`.
- Email and WhatsApp messages when homework is sent or marked.
- Other years and subjects: same spreadsheet layout, imported the same way.
