# 18. Database performance review

**Date:** 5 November 2026  
**Scope:** all 24 scripts in `supabase/migrations/`, from `20260928000001_schema.sql` to `20261105000002_lesson_homework_marks.sql`. I also checked them against the queries the app actually runs (`web/src`).  
**Status (6 Nov 2026):** D1–D4 are built as `supabase/migrations/20261106000001_faster_database.sql`, for Staging first (Production at go-live). D5 is a check still to do, D6 is an app fix still to do, and D7 is for later.  
**Section:** Process Improvement / Optimization (see the [Help index](README.md)).  
**Method:**
1. I read every script.
2. I listed every table, index, view, function, trigger and access rule (RLS policy) as they stand after the last script.
3. I built a local Postgres 16 copy from all 24 scripts and filled it with **a few years' worth of test data**. That is 400 students, 90 batches, 27,000 homework, 157,000 results and 307,000 file rows. It is deliberately more than you have today.
4. I timed the app's main queries as staff, as a teacher, as a student and through a WhatsApp hand-in link.
5. I applied each fix and timed the same queries again.

Nothing in your folder or in Supabase was changed by the review itself. On 6 Nov the draft fix script became the migration `supabase/migrations/20261106000001_faster_database.sql` (see **Status** above).

---

## Summary

The schema is well designed for this app. Most tables have the right keys and unique rules. The student and hand-in functions are already fast, at 5–9 ms with a few years of data.

There is **one big problem**: the **access rules** (RLS). They make the staff screens slow down sharply as data grows.

- Every table has two kinds of rule: a staff rule and a teacher rule. Postgres combines them with "or".
- In practice it checks the **teacher rule first, on every row**, even when an admin is signed in.
- Each teacher check (`teaches_sheet_student()`, `teaches_batch()`…) runs 2–4 small lookups. So reading 150,000 homework results means about half a million extra lookups.
- Today, on Staging, you can't see this, because there is little data. With a few years of data:

| Screen (staff) | Now | With the fixes |
|---|---|---|
| Dashboard: homework handed in, waiting to be marked | **20.7 s** | 0.02 s |
| Dashboard: homework not handed in (last 90 days) | 3.3 s | 0.01 s |
| Dashboard: "handed in this week" / "marked this week" counts | 0.29 s / 0.22 s | 0.005 s |
| Batches list | **24.6 s** | 0.02 s |
| Students list | **31.2 s** | 0.05 s |
| A batch page: homework with results | 1.3 s | 0.03 s |
| A batch page: hand-in and corrected files | 1.4 s | 0.07 s |

| Screen (teacher) | Now | With the fixes |
|---|---|---|
| Students list | 2.0 s | 0.02 s |
| Batches list | 1.8 s | 0.04 s |
| Dashboard: handed in, waiting to be marked | 1.9 s | 0.02 s |
| A batch page: homework / files | 1.0 s / 1.2 s | 0.04 s / 0.08 s |

| Student and family pages | Now | |
|---|---|---|
| My dashboard, My homework, WhatsApp hand-in page | 5–9 ms | Already fast; no change needed |

These are database times only, measured on the local copy and taking the best of 3 runs. Supabase adds network time on top. Your real data is smaller today, so today's times are much lower. The point is how the times grow.

**Security does not change.** I compared row by row before and after the fixes. An admin and a teacher saw exactly the same rows in every table: the same counts, and the same homework results and file rows. A teacher can still set homework and add results in their own batch. They are still refused for another teacher's batch or for a student who isn't in their batch.

---

## How to read this report

| Priority | Meaning |
|---|---|
| **P1** | Do before the data grows much, ideally before the real import into Production. |
| **P2** | Do in the next few weeks. |
| **P3** | Do when you next touch that area. |
| **P4** | Optional. |

---

## Findings

### D1. Teacher access rules run on every row, for everyone. P1

> ✅ **Built (6 Nov)** in `20261106000001_faster_database.sql`, sections 1 and 2. Run on Staging; Production at go-live.

**Where:** `20261027000004_teacher_login.sql` §4 (all `teacher_…` rules), and `20260928000003_security.sql` (`staff_all` rules).

**What happens now:**
- A table such as `homework_results` has `staff_all` (`is_staff()`) and `teacher_read` (`teaches_sheet_student(sheet_id, student_id)`). Postgres allows a row if either rule passes.
- The query plan shows it tests `teaches_sheet_student(...) OR is_staff()`, in that order, for **every row it looks at**.
- `teaches_sheet_student` calls `teaches_student_in_batch`, then `teaches_batch`, then `current_teacher_id()`. Each one is a separate lookup, and none of them can be worked out once and reused.
- For an admin, the answer is always "no". Postgres still does all that work before reaching `is_staff()`, which says "yes".

**Fix (tested):**
1. **Teacher rules become lists worked out once per query.** This is the pattern Supabase recommends in its RLS performance guide.
   - New helper functions return the signed-in teacher's open batches, students, homework, and homework-and-student pairs: `my_batch_ids()`, `my_student_ids()`, `my_sheet_ids()`, `my_sheet_students()` and `my_lesson_ids()`.
   - The rules then read, for example, `batch_id in (select my_batch_ids())`.
   - Postgres builds the list once, as a lookup table, and checks each row against it. For anyone who isn't a teacher, the list is empty, so the check costs nothing.
2. **Staff and admin checks are wrapped as `(select is_staff())`.** Postgres then works them out once per query instead of once per row. This is Supabase's standard advice.

**Note:** wrapping `is_staff()` on its own, the usual advice (and P7 in [guide 19](19-page-speed-review.md)), made almost no difference here (20.7 s → 20.0 s). The teacher check still ran first. **Step 1 is the part that matters.**

**The attendance rules** are kept as they are, behind a quick "is this a teacher?" check. Attendance has no screen yet.

**Effect:** see the summary table. This one change accounts for nearly all of the improvement.

**Cost:** one script, with no app change: sections 1 and 2 of `20261106000001_faster_database.sql`. It is safe to run twice.

### D2. The batch list view runs 8 sub-queries per batch. P2

> ✅ **Built (6 Nov)** in `20261106000001_faster_database.sql`, section 4.

**Where:** `batch_list` (latest version in `20261103000002_created_modified_dates.sql`). The Batches page, the dashboard and the batch picker on the student form all use it.

**Now:** for each batch, the view separately counts:
- students
- names
- class times
- topics done
- topics in total
- last class
- homework waiting to be marked

The "waiting to be marked" count scans the handed-in results again for every batch.

**Fix (tested):** each figure is worked out once for all batches, grouped by batch, then joined. I compared the new view with the current one row by row and the results were identical. It also has the same columns in the same order, so the app doesn't change.

**Effect:** Batches list 226 ms → 21 ms, after D1. Showing a single batch was already quick and stays quick (10 ms).

### D3. The dashboard's homework filters have no index. P2

> ✅ **Built (6 Nov)** in `20261106000001_faster_database.sql`, section 3.

**Where:** the `homework_results` and `homework_markups` tables. The dashboard (`_dashboard/homework.ts`) filters on:
- `status = 'received'`
- `status = 'pending'`
- `received_on >= this week`
- `status = 'marked' and marked_on >= this week`
- `draft_file_id is not null`

There's no index for any of these, so each one reads the whole table.

**Fix (tested):** small "partial" indexes that only hold the rows the dashboard asks for:
- handed in, by homework
- not handed in, by homework
- `received_on`
- `marked_on` for marked rows
- saved-not-sent drafts

Because most results end up marked, these indexes stay small.

**Effect:** the dashboard counts went from 17 ms to 5 ms, and the waiting lists from 22 ms to 12 ms (after D1).

### D4. A few foreign keys that are searched or cascaded have no index. P3

> ✅ **Built (6 Nov)** in `20261106000001_faster_database.sql`, section 3.

**Where:** 25 foreign keys have no index of their own. Most point at tiny tables that are never deleted from, such as `subjects` and `staff`, so they don't matter. These do:

| Column | Why it matters |
|---|---|
| `guardians.family_id` | The dashboard reads guardians by family. Only the primary guardian has an index today. |
| `enquiry_events.enquiry_id` | The enquiry page shows its history by enquiry. Every visit reads the whole table. |
| `file_links.student_id` | Deleting a student removes their file rows, the largest table, by reading all of it. |
| `homework_markups.student_id` | The same when a student is deleted. |
| `batches.teacher_id` | The Teachers list, the teacher clash check and the new teacher rules look batches up by teacher. |

**Fix:** five small indexes, in section 3 of the draft.

**Not worth indexing:** the foreign keys to `subjects`, `staff` and `auth.users`, and `homework_sheets.session_id`, `topic_id` and `lesson_homework_id`. Their parent rows are almost never deleted.

### D5. Postgres "JIT" compilation can add a delay to the bigger list queries. P2 (check only)

> ⬜ **To check** in the Supabase SQL editor (Staging and Production).

**What:** Postgres can compile complicated queries to machine code first (JIT). That pays off for reports that run for minutes, and costs 50–100 ms on queries like ours. The access rules make the list views look "expensive" to the planner, so JIT switches on.

**Measured locally:** Students list 135 ms with JIT on, 49 ms with JIT off. Teacher Batches list 115 ms → 42 ms.

**Check:** run `show jit;` in the Supabase SQL editor for Staging and Production. If it says `on`, you can turn it off with `alter role authenticator set jit = off;`. That covers the app's connections; check that Supabase allows the change on your plan. If it says `off`, there's nothing to do.

### D6. The batch page reads every homework of the batch, ever, and can lose files. P1 (correctness, app side)

> ⬜ **Not started.** An app change; the database script doesn't fix it.

**Where:** this one isn't in the scripts, but it showed up in the test. It is `batches/HomeworkSection.tsx`.

**Now:**
- The batch page loads **every homework the batch has ever had**, with all results.
- It then asks for all their hand-ins and corrected sheets in **one request**.
- Supabase returns **at most 1,000 rows per request, without an error**. In the test, one batch had 9,633 file rows.
- **When the 1,000-row limit is reached, some students' files quietly stop showing on the batch page.**
- A rough real-world estimate:
  - A batch of 6 students with 2 homework a week produces about 25–30 file rows a week.
  - At that rate it passes 1,000 rows in about **8 months**.
- The request also lists every homework id in the address, which keeps getting longer.

**Fix (choose one):**
1. Show recent homework on the batch page, for example the last 12 weeks, with a "Show older homework" link.
2. Fetch the files in pages.
3. Move the batch homework list into one database function that returns each homework with its own files.

Option 1 is the simplest and also makes the page lighter. This is the same family of problem as F2 in the [architecture review](17-architecture-review.md), which covered the dashboard and the Students list.

### D7. Students list: every student's figures are worked out before the search is applied. P3

**Where:** `student_list` and `student_stats`.

**Now:**
- The view builds the full row for every student before the page's filter is applied. That includes attendance % and homework % for the last 28 days.
- The filters applied afterwards are status and the search box.
- Attendance has no screen, so its part is always empty but still runs.

**Measured:** 47 ms for 343 students after D1. That's fine for now.

**Later:** when there are more than about 1,000 students, add paging to the Students list, which F2 needs anyway. You could also take attendance % out of the view until attendance is used. No change is needed now.

### D8. Everything else checked and fine

- **Student, family and hand-in functions** (`my_dashboard`, `my_homework`, `handin_page`, `handin_target`, `handin_record`, `current_student_id`): 5–9 ms with a few years of data. They use the right indexes: `students.handin_code`, `students.auth_user_id`, and results by student.
- **Triggers:**
  - Capacity: it locks the batch row, so two saves can't both take the last place.
  - Teacher class-time clash: it runs per class time, takes a per-teacher lock and reads a small table.
  - Enrolment teacher copy.
  - "Modified" dates: they only fire on a real change.

  All are cheap and correct. The clash check reads `batch_slots` without an index on day and time, which is fine at a few hundred rows.
- **All-or-nothing save functions** (`save_batch`, `set_homework`, `complete_topic`, `complete_lesson`, `save_student`): each is one round trip. That is best practice, and better than several calls from the app.
- **Bulk import:** it matches names row by row against students and teachers. For a few hundred rows, that's well under a second, so no change is needed.
- **Function settings:** the helper functions are marked `stable`, the pure ones `immutable`, and every security-definer function pins `search_path`. That is correct.
- **Unused indexes:**
  - `students_name_idx`: the list sorts after grouping, so it can't use the index.
  - `students_status_idx`: there are only five statuses.
  - `class_sessions_date_idx`: there's no attendance screen.

  They cost almost nothing, so keep them. After a few months, look at Supabase's **Advisors › Performance** page, which lists unused indexes from real use, before removing any.

---

## Good practice for future scripts

1. **New teacher rules:** use the list pattern, `column in (select my_batch_ids())`, not a per-row `teaches_…()` call.
2. **New staff rules:** write `(select is_staff())` and `(select is_admin())`.
3. **Index new filters.** When a screen filters or sorts a large table by a column, such as status, a date or a foreign key, add an index in the same script.
4. **Views:** work counts out once with `group by` and join them, rather than one sub-query per row, when the view lists many rows.
5. **Anything that can grow past 1,000 rows** needs paging, a date window, or a database function that returns totals. Otherwise Supabase cuts the result off silently.
6. **Plain `create index if not exists` is right at your size.** It takes milliseconds. `create index concurrently` isn't needed, and the SQL editor can't run it inside a script anyway.
7. **After each go-live, open Supabase › Advisors › Performance and Query Performance.** They show the slowest real queries and missing indexes from actual use.

---

## Suggested order

| # | What | Finding | Effort | Where |
|---|---|---|---|---|
| 1 | Faster access rules (teacher lists, `(select is_staff())`) | D1 | ✅ Built 6 Nov (§1–2) | Staging, then Prod at go-live |
| 2 | Batch page: recent homework only, or files in pages | D6 | ½ day, app | Staging |
| 3 | Dashboard indexes and foreign-key indexes | D3, D4 | ✅ Built 6 Nov (§3) | with 1 |
| 4 | Faster batch list view | D2 | ✅ Built 6 Nov (§4) | with 1 |
| 5 | Check `show jit;` in both projects | D5 | 5 minutes | Supabase SQL editor |
| 6 | Students list paging when needed | D7 | later | with F2 ([guide 17](17-architecture-review.md)) |

Items 1, 3 and 4 are one script, `20261106000001_faster_database.sql` (built 6 Nov). It needs no app change.

---

*Read-only review. The test copy, the test data and the timings were made on a local Postgres 16 database, not on Supabase.*
