# 22. Class notes and documents

Built 11 Nov 2026. **Staging only** until go-live.

Staff and a batch's teacher can add **class notes and documents** to a batch: a short note, a document (PDF, Word, PowerPoint, Excel or a photo) or a link, optionally tied to one **lesson plan topic**. The students of that batch (and the family login) see them in their login under a new **Class Notes/Documents** tab.

---

## 1. Setting it up (once, on Staging)

1. In the Supabase **Staging** project, open **SQL Editor**, paste `supabase/migrations/20261111000002_class_notes.sql` and press **Run**. It needs `20261106000001_faster_database.sql` (and everything before it) to have run first. It is safe to run twice.
2. Nothing new in `.env.local` or Vercel. Google Drive is already connected (guide 05), and the files use the same Drive permission as homework.
3. Commit and push the code to the `staging` branch. Vercel redeploys Staging on its own.

Until the script has run, the batch page's **Class notes and documents** card says "The database is not ready for this yet", and students see "No class notes yet". Everything else works as before.

## 2. Adding a note (staff and the batch's teacher)

1. **Batches** › the batch › **Class notes** in the section bar under the title. This opens the **Class notes and documents** section (it starts closed).
2. Press **＋ Add a note** (the form is already open while a batch has no notes), then fill in:
   * **Title** (needed), for example "Fractions: key facts".
   * **Lesson plan topic** (optional). Classes on the Lesson library list its lessons, grouped by term and module (for example "Term 1 · Number › Y5-T1L1 Place value"). Other classes list the batch's curriculum topics. Leave it on **Whole class** for a note that isn't about one topic.
   * **Notes** (optional): any text, up to 5,000 characters. Line breaks are kept.
   * **Document** (optional): PDF, Word, PowerPoint, Excel or a photo, up to **50 MB**.
   * **Or a link** (optional): for example a Google Drive or YouTube link. A note has a document **or** a link, not both; add the other as a second note.
3. Press **Add note**. The button shows "Uploading…" then "Saving…", and a green message says when it is done.

A note needs a title and at least one of: some text, a document or a link.

Each note on the card shows its topic, when it was added and by whom, its text, and its document or link. **Remove** takes it away from students straight away. An uploaded document stays in Google Drive.

Notes can't be edited: remove the note and add it again.

### What a teacher can do

A teacher sees and adds notes only on **their own open batches**, the same as homework (guide 15). They can remove notes on those batches, including ones the office added. Documents open through the app (`/class-notes/…`), because teachers have no access to the Pencil Maths Google Drive.

## 3. What students and families see

* A new tab in the top menu: **Class Notes/Documents** (just **Notes** on phones, so the four tabs fit on one row).
* The notes of every class the student is in now, newest first. Each shows the subject and topic, the title, the date, the text, and a button to open the document or link.
* With more than one class, tabs at the top pick one subject (**All**, **Maths**, **Science**…).
* Documents open in the browser (PDFs and photos) or download (Word, PowerPoint, Excel). They open through the app, so families never need a Google account and never see the Drive folder.
* A family login sees the notes of the child chosen in the switcher.
* A student who leaves a batch no longer sees its notes.

## 4. Where the files go

Uploaded documents go to Google Drive: **PencilMaths › Class notes › &lt;batch code&gt;** (for example `PencilMaths/Class notes/TB-1`). The folder is made the first time a document is added to that batch.

The browser sends the file straight to Google Drive, the same way a marked sheet is saved (guide 09), so big files don't hit the server's 4.5 MB limit. If the browser can't reach Drive, the app sends the file itself instead, but then only up to 4 MB. After the upload the app checks the file really is in that batch's folder before it saves the note. If the save fails, the file just uploaded is moved to the Drive bin so nothing is left over.

## 5. The database

Script: `supabase/migrations/20261111000002_class_notes.sql`.

| Part | What it does |
|---|---|
| `class_notes` table | One row per note: batch, title, text, the topic (`topic_id` for curriculum topics, `lesson_id` for Lesson library lessons, at most one), the file or link (`provider`, `external_id`, `url`, `file_name`), who added it and when |
| Checks | A title is needed; a note needs text, a file or a link; a link must start with `http://` or `https://`; a topic must be one of this batch's topics, and a lesson must be in the batch's subject and year |
| `class_note_check` trigger | Fills in who added the note from the login (never from the form) and stops anyone changing who added it, when, or which batch it is in |
| Access rules | Staff: everything. A teacher: read, add and remove on their own open batches (`my_batch_ids()`, guide 18). Students and families can't read the table at all |
| `my_class_notes()` | The signed-in student's notes (all their current batches). It never gives out Drive ids or links |
| `my_class_note_file(note)` | One note's file or link, only for a student in that batch now. Used by `/me/notes/<id>` |

Deleting a batch deletes its notes. Deleting a Lesson library lesson or a curriculum topic keeps its notes, without the topic.

## 6. Files

| File | What it is |
|---|---|
| `supabase/migrations/20261111000002_class_notes.sql` | The database script above |
| `web/src/lib/classNotes.ts` | Accepted file types, the 50 MB limit, the Drive folder, reading the topic choice |
| `web/src/app/(portal)/batches/notesActions.ts` | Server actions: start the upload, the 4 MB fallback, save the note, remove a note |
| `web/src/app/(portal)/batches/ClassNoteForm.tsx` | The Add note form (runs in the browser: uploads the file to Drive, then saves) |
| `web/src/app/(portal)/batches/ClassNotesSection.tsx` and `classNotes.module.css` | The Class notes and documents card on the batch page |
| `web/src/app/(portal)/class-notes/[id]/route.ts` | Opens a note's document for staff and teachers |
| `web/src/app/(portal)/batches/[id]/page.tsx` | The batch page: the **Class notes** section (see the 11 Nov 2026 change log entry on collapsible sections) |
| `web/src/app/(student)/me/notes/page.tsx` and `notes.module.css` | The students' Class Notes/Documents page |
| `web/src/app/(student)/me/notes/[id]/route.ts` | Opens a note's document or link for students |
| `web/src/app/(student)/StudentNav.tsx` and `nav.module.css` | The new tab in the student menu |
| `Automation Testing/database/67-class-notes.test.sql` | 45 automated checks (section 8) |

## 7. Testing on Staging

1. Run the database script (section 1).
2. As an admin, open a batch that has students and add: a note with only text; a note with a PDF tied to a topic; a note with a PowerPoint over 4 MB; a note with a link.
3. Check the PowerPoint is in Google Drive under **PencilMaths › Class notes › &lt;batch code&gt;**.
4. Sign in as a student of that batch: the **Class Notes/Documents** tab lists all four, newest first. Open the PDF, the PowerPoint and the link.
5. Sign in as a student of another batch: none of them show. Paste the address of one of the documents (`/me/notes/<id>`) into the browser: it says "Not found".
6. Sign in as the batch's teacher: the card is on their batch page, and they can add and remove a note. On another teacher's batch they can't open the page at all.
7. Remove a note as staff: it disappears from the student's tab.
8. Try to add a note with only a title: "Add some text, a file or a link."

## 8. Automated checks

`Automation Testing/database/67-class-notes.test.sql` has 45 checks: who can see, add and remove notes (staff, staff who have left, each teacher, a teacher who has left, families, students, not signed in), the topic and file checks, who added it can't be faked, the student list and file opening, a student who leaves the batch, and what happens when a lesson or batch is deleted. With them, the whole suite has 511 checks, all passing.

The teacher rules on this table are named `notes_teacher_read`, `notes_teacher_add` and `notes_teacher_remove`, and `67-class-notes` checks there are exactly these three. They are named this way so the count of the original teacher rules in `90-database-checks` (guide 15 plus the question bank) stays the same on both the `staging` and `ai/question-bank` branches.

## 9. Going live

Run `20261111000002_class_notes.sql` on Production at go-live, after `20261106000001_faster_database.sql`, with the other waiting scripts in date order.
