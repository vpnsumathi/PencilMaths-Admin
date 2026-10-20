# PencilMaths-Admin — Help 1: What we built on 7 October 2026

> A brief overview of each feature added today and how its code works.
> For setup, Git and earlier pieces see `01-project-guide.md`; for the database see `02-database-supabase.md`.

---

## Contents

1. [Staff: change role, deactivate, reactivate (Part 9.2)](#1-staff-change-role-deactivate-reactivate-part-92)
2. [Dummy data scripts](#2-dummy-data-scripts)
3. [Subjects and curriculum (Piece 10)](#3-subjects-and-curriculum-piece-10)
4. [Shared building blocks](#4-shared-building-blocks)
5. [Teachers](#5-teachers)
6. [Batches](#6-batches)
7. [Students](#7-students)
8. [Analytics dashboard](#8-analytics-dashboard)
9. [Deploying to Vercel](#9-deploying-to-vercel)
10. [Patterns used everywhere](#10-patterns-used-everywhere)

---

## 1. Staff: change role, deactivate, reactivate (Part 9.2)

**What:** On **Staff** (admins only) each colleague has a role dropdown + **Save**, and a **Deactivate / Reactivate** button. Your own row has no buttons, so you can't lock yourself out.

| File | Job |
|---|---|
| `(portal)/staff/actions.ts` | `updateRole`, `setActive` server actions |
| `(portal)/staff/page.tsx` | Table with the forms and messages |

**Code, briefly:**
- Each button is a small `<form>` with hidden inputs (`id`, new value) that calls a server action.
- `connectFor()` blocks changes to your own account.
- `.update(...).select('id')` returns the changed rows; **0 rows = the security rules said no** (only admins may change `staff`).
- `revalidatePath('/staff')` refreshes the list; `redirect('/staff?ok=…')` shows the green message.
- A deactivated person can still sign in but lands on **No access**.

---

## 2. Dummy data scripts

| File | Job |
|---|---|
| `supabase/dummy_data.sql` | Adds test data: 5 teachers, 4 batches with weekly times, 8 students/families, 3 weeks of classes and attendance (latest week left unlogged), homework, 4 enquiries, notes |
| `supabase/clear_dummy_data.sql` | Empties every non-reference table (`truncate … cascade`); keeps subjects, curriculum and staff |

Run in the Supabase SQL Editor. Run `dummy_data.sql` **once**; to start again, clear first. Never run either on real data.

---

## 3. Subjects and curriculum (Piece 10)

**What:** Admin-only **Subjects** page (add, rename, reorder, turn on/off) and a **Curriculum** page per subject (add, rename, reorder, remove topics; optionally per year group). Curriculum changes only affect **new** batches.

| File | Job |
|---|---|
| `supabase/migrations/20261007000001_reference_data_admin_only.sql` | New rules: all staff read subjects/topics, only admins change them. Adds `move_curriculum_topic()` |
| `web/src/lib/auth.ts` | `requireAdmin()`: one shared admin check |
| `(portal)/subjects/page.tsx` | Subjects table |
| `(portal)/subjects/[id]/page.tsx` | Curriculum for one subject (`[id]` = the subject id in the address, e.g. `/subjects/maths`) |
| `(portal)/subjects/actions.ts` | 8 server actions for subjects and topics |

**Code, briefly:**
- `drop policy` / `create policy` replace the "all staff can edit" rule with **read for staff, write for admins**. The database enforces it even if a page is bypassed.
- Topic positions must be unique, so `move_curriculum_topic` parks one topic at `-1`, then swaps the two positions.
- Subjects are reordered by swapping two in a list, then renumbering `sort` 1, 2, 3….
- `curriculum_topics(count)` in a `select` counts each subject's topics in the same query.
- Subjects can't be deleted (students and batches point to them), only turned off.

---

## 4. Shared building blocks

Reused by Teachers, Batches and Students so each page stays short.

| File | What it gives |
|---|---|
| `components/ui.module.css` | Shared look: tables, cards, inputs, buttons, badges, messages |
| `components/Alerts.tsx` | Green/red message from `?ok=` / `?error=` |
| `components/Field.tsx` | Label + input wrapper |
| `components/StatusBadge.tsx` | Coloured status pill (active, trial, left…) |
| `lib/options.ts` | Fixed lists (statuses, years, weekdays), `UUID`/`EMAIL` checks, `todayInUk()` |
| `lib/format.ts` | `formatDate`, `formatTime`, `formatPercent`, `yearRange` |
| `lib/form.ts` | `text()`, `optional()` to read forms; `redirectWith()` to go back with a message |

`formatDate` reads dates as UTC so "7 Oct" never shows as "6 Oct" on a computer in another time zone.

---

## 5. Teachers

**What:** List (code, subject, years, status, batch and student counts) → **Add teacher** / click a name to edit.

| File | Job |
|---|---|
| `teachers/page.tsx` | List, from the `teacher_list` view |
| `teachers/new/page.tsx`, `teachers/[id]/page.tsx` | Add / edit pages |
| `teachers/TeacherForm.tsx` | One form used for both add and edit |
| `teachers/actions.ts` | `saveTeacher` |

**Code, briefly:** `saveTeacher` reads the form, checks names, email and year range, then **inserts** (no `id`) or **updates** (has `id`). Error `23505` (duplicate) becomes "Another teacher already uses that email."

---

## 6. Batches

**What:** List (teacher, weekly times, places used, lesson-plan progress, open/closed) → **New batch**; the batch page edits teacher, places and times, shows its students and lesson plan, and can close/reopen it.

| File | Job |
|---|---|
| `batches/page.tsx` | List, from the `batch_list` view |
| `batches/new/page.tsx`, `batches/[id]/page.tsx` | Create page; batch page with members and lesson plan |
| `batches/BatchForm.tsx` | Form for create and edit (subject/year fixed after creation) |
| `batches/actions.ts` | `createBatch`, `updateBatch`, `setBatchClosed` |

**Code, briefly:**
- Weekly times are numbered rows (`slot_day_0`, `slot_time_0`, …); `readSlots()` skips blank rows and rejects half-filled ones.
- Creating a batch triggers the database to **copy the curriculum** into its lesson plan.
- Saving replaces all weekly times (delete, then insert) and moves the batch's students to the new teacher.
- A batch can only close when it has **no students**.

---

## 7. Students

**What:** List with **search** (name or code) and **status filter** (hides "left" by default), attendance/homework %, and "Needs batch / Needs teacher" flags → **Add student** / click a name to edit.

| File | Job |
|---|---|
| `students/page.tsx` | List, from the `student_list` view |
| `students/new/page.tsx`, `students/[id]/page.tsx` | Add / edit pages (edit also shows 28-day stats) |
| `students/StudentForm.tsx` | Form: student, main parent, a row per subject (tick + batch + teacher), folder link. Also `loadStudentFormOptions()` |
| `students/actions.ts` | `saveStudent` |

**Code, briefly:**
- The filter is a **GET form**: submitting puts `?q=…&status=…` in the address, which the page reads.
- The search text is cleaned to letters, numbers, spaces, `-` and `'` so it can't break the database filter.
- `saveStudent` builds one JSON object and calls the database function **`save_student`**, which saves student, family, parent, subjects and folder **together** (all or nothing).
- Unticking a subject ends it; choosing a batch sets the teacher automatically.
- Errors raised on purpose by `save_student` (code `P0001`, e.g. "Add at least one subject") are shown as they are.

**Known limitation:** if saving fails, the form reloads empty with the error.

---

## 8. Analytics dashboard

**What:** Greeting, a **date range** filter (7 days / 4 weeks / 90 days), 5 headline tiles, attendance trend chart, **Needs attention** list, students by subject and year group, batch places, enquiry pipeline. Hover or tab to a bar for a tooltip; every chart has a **Table** button.

| File | Job |
|---|---|
| `(portal)/page.tsx` + `dashboard.module.css` | Layout, tiles, attention list |
| `(portal)/_dashboard/data.ts` | `loadDashboard(days)`: fetches everything at once and calculates all numbers |
| `(portal)/_dashboard/BarChart.tsx` | Interactive bar chart (client component) |
| `(portal)/_dashboard/Sparkline.tsx` | Small trend line in the attendance tile |
| `(portal)/_dashboard/charts.module.css` | Chart styles and colours |

A folder starting with `_` (like `_dashboard`) is never a web page.

**Code, briefly:**
- The range lives in the address (`/?range=7`), so a view can be bookmarked.
- `Promise.all` runs the 8 queries at the same time.
- `class_sessions!inner(class_date)` joins each attendance mark to its class and keeps only those in the range.
- `expected_classes()` (database function) lists every class the timetable says should have happened; those without a log become "not logged" items.
- Attendance is grouped per day (7 days) or per week (longer ranges).
- **Needs attention** collects unlogged classes, students without a batch/teacher, homework to mark, enquiries waiting 7+ days and full batches, most urgent first.
- `BarChart` is `'use client'` because it reacts to the mouse: it remembers the hovered bar and table/chart view in `useState`, and positions the tooltip from the bar's on-screen position.
- No chart library: bars are HTML elements sized with percentages. Colours were checked with a palette validator (one blue; a 5-step blue scale for the ordered pipeline).

---

## 9. Deploying to Vercel

**Problem:** `500 MIDDLEWARE_INVOCATION_FAILED`. `.env.local` is never in Git, so Vercel had no Supabase settings and `middleware.ts` crashed on every request.

**Fix:**
1. Vercel → **Settings → Environment Variables**, type **Config** (not Secret, because `NEXT_PUBLIC_` values are public by design), for Production, Preview and Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` = the Vercel address
2. **Redeploy**: `NEXT_PUBLIC_` values are baked in at build time.
3. Supabase → **Authentication → URL Configuration**: Site URL = Vercel address; add `https://<your-app>.vercel.app/**` to Redirect URLs.
4. Vercel **Root Directory** = `web`.

Use **Secret** only for server-only keys without the prefix (e.g. a future `SUPABASE_SECRET_KEY`).

---

## 10. Patterns used everywhere

| Pattern | Why |
|---|---|
| **Server actions + plain `<form>`** | Forms work without browser JavaScript; the code runs safely on the server |
| **`redirect('…?ok=…')` / `?error=…`** | Simple success/error messages that survive the page reload |
| **`.select('id')` after update/delete** | Detects when security rules silently blocked a change |
| **`revalidatePath()`** | Makes Next.js show fresh data after a change |
| **Database views** (`student_list`, `batch_list`, `teacher_list`) | The database does the joining and counting; pages stay simple |
| **Validate everything from a form** | Anyone can change hidden inputs or dropdown values in DevTools |
| **`console.error` + friendly message** | You see the real error in the terminal (or Vercel logs); users see plain English |
| **Security in the database (RLS)** | Hiding a link isn't protection; the database rules are |
