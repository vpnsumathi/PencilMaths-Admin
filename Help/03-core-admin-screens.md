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

**What:** On **Settings › Staff** (admins only; moved under Settings on 2 Nov 2026, guide 16) each colleague has a role dropdown + **Save**, and a **Deactivate / Reactivate** button. Your own row has no buttons, so you can't lock yourself out.

| File | Job |
|---|---|
| `(portal)/settings/staff/actions.ts` | `updateRole`, `setActive` server actions |
| `(portal)/settings/staff/page.tsx` | Table with the forms and messages |
| `(portal)/staff/page.tsx` | Sends old `/staff` links to `/settings/staff` |

**Code, briefly:**
- Each button is a small `<form>` with hidden inputs (`id`, new value) that calls a server action.
- `connectFor()` blocks changes to your own account.
- `.update(...).select('id')` returns the changed rows; **0 rows = the security rules said no** (only admins may change `staff`).
- `revalidatePath('/settings/staff')` refreshes the list; `redirect('/settings/staff?ok=…')` shows the green message.
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
- The **Created / modified** column (also on Students, Batches and Teachers) shows `created_at` and, once changed, `updated_at`, through the shared `CreatedModified` cell. A trigger sets `updated_at` only when something in the row really changes (`20261103000002_created_modified_dates.sql`).

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
| `lib/format.ts` | `formatDate`, `formatDay`, `formatTime`, `formatPercent`, `yearRange` |
| `components/Skeleton.tsx` | Grey placeholders while a page loads (`PageSkeleton`, used by the `loading.tsx` files) |
| `lib/auth.ts` | `getUserId()` and `getViewer()`: who is signed in, checked once per page load; `requireAdmin()`, `requireStaff()` |
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
- **A teacher can't be given a class time they already have.** Each class time is compared with the times already assigned to the same teacher in their other open batches; the same day at the same start time is refused. The database checks it (`20261105000001_teacher_time_clash.sql`) when class times are saved, when a batch gets a different teacher, when a closed batch is reopened, and in Bulk import. The form then shows a message such as *"Agnes Smith already teaches B-004 on Monday at 16:00. Choose another time or another teacher."* Closed batches don't count. (Only start times are recorded, so 16:00 and 16:30 are not treated as a clash.)
- Clashes that existed before the check are left as they are, but that batch can't be saved again until its times are changed. To list them, run this in the SQL Editor:

```sql
select t.first_name || ' ' || t.last_name as teacher, b1.code, b2.code as clashes_with,
       weekday_name(s1.weekday) as day, s1.start_time
from batch_slots s1
join batches b1 on b1.id = s1.batch_id and b1.closed_on is null
join batch_slots s2 on s2.weekday = s1.weekday and s2.start_time = s1.start_time and s2.batch_id <> s1.batch_id
join batches b2 on b2.id = s2.batch_id and b2.closed_on is null and b2.teacher_id = b1.teacher_id
join teachers t on t.id = b1.teacher_id
where b1.code < b2.code
order by teacher, day, s1.start_time;
```

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

**What:** Greeting, headline tiles (**Current students**, **Open batches** with places used, and **Open enquiries** for staff), the **Needs attention** list, the **Homework** section (section 8.1), students by subject and year group, batch places and the enquiry pipeline. Hover or tab to a bar for a tooltip; every chart has a **Table** button.

On 3 Nov 2026 the slow parts were taken off to make the dashboard faster: the **date range** filter, the **Attendance** tile and **Attendance rate** chart, **Classes logged** (and "classes not logged" in Needs attention), the **Homework handed in** percentage tile and the **Hand-in rate by batch** chart. "+N new" on the students tile now always means the last 4 weeks.

| File | Job |
|---|---|
| `(portal)/page.tsx` + `dashboard.module.css` | Layout, tiles, attention list |
| `(portal)/_dashboard/data.ts` | `loadDashboard()`: four quick queries at once, then the numbers |
| `(portal)/_dashboard/BarChart.tsx` | Interactive bar chart (client component) |
| `(portal)/_dashboard/Sparkline.tsx` | Small trend line (not used since 3 Nov 2026; can be deleted) |
| `(portal)/_dashboard/charts.module.css` | Chart styles and colours |
| `(portal)/_dashboard/homework.ts` | `loadHomework()`: the Homework section's numbers and lists |
| `(portal)/_dashboard/HomeworkPanel.tsx` | Draws the Homework section, and `HomeworkPanelLoading`, its placeholder |
| `(portal)/_dashboard/NudgeButton.tsx` | **WhatsApp nudge** button (client component) |

A folder starting with `_` (like `_dashboard`) is never a web page.

**Code, briefly:**
- `Promise.all` runs the 4 queries at the same time: subjects, current students with their current enrolments, open batches (`batch_list`) and enquiries.
- Students are read from the `students` table with `enrolments(...)` embedded, not from the `student_list` view, because the view also works out every student's attendance and homework percentages, which the dashboard doesn't show.
- The Homework section is inside `<Suspense>`: the rest of the dashboard shows first, with grey placeholders where homework goes, and the section fills in when its queries finish.
- **Needs attention** collects students without a batch/teacher, homework to mark and enquiries waiting 7+ days, most urgent first. Full batches are not listed (removed 9 Nov 2026).
- `BarChart` is `'use client'` because it reacts to the mouse: it remembers the hovered bar and table/chart view in `useState`, and positions the tooltip from the bar's on-screen position.
- No chart library: bars are HTML elements sized with percentages. Colours were checked with a palette validator (one blue; a 5-step blue scale for the ordered pipeline).

### 8.1 Homework section (27 Oct 2026)

Just below **Needs attention**. "This week" starts on Monday.

**Five numbers:**

| Tile | Counts |
|---|---|
| **To mark** | Handed in, not marked yet (not counting ones saved with Save & close) |
| **Overdue** | Not handed in after the due date, in a batch the student is still in, for homework set in the last 90 days (the same window as the hand-in link). Homework with no due date is never overdue |
| **Handed in this week** | Hand-ins since Monday |
| **Marked this week** | Marked since Monday |
| **Marked, not sent** | Saved with **Save & close** on the marking page, waiting for **📤 Send** on the batch page |

**Needs marking:** every hand-in still to mark, oldest first, with student, batch, homework and days waiting (red from 7 days). **🖊️ Mark** opens the marking page in a new tab (guide 09, section 2.2). The first 8 are shown.

**Students falling behind:** students with **2 or more** overdue homeworks, most overdue first. Click the name for the student page. **WhatsApp nudge** opens WhatsApp with a ready reminder listing the overdue homework: straight to the main parent's chat when a parent phone is saved (UK numbers starting 0 become +44), otherwise you pick the family's WhatsApp group. A green message confirms what was opened (the shared `FocusMessage`, so it is never missed). Nothing is sent until you press send in WhatsApp. To take a homework off the list, **Excuse** it on the batch page.

**Code, briefly:** `loadHomework()` runs its queries together with `Promise.all`: hand-ins waiting (`status = received`), not handed in (`pending`, set in the last 90 days), the two weekly counts, unsent drafts (`homework_markups.draft_file_id`) and current enrolments. Parent phones and WhatsApp group names (`guardians`, `families`) are only fetched for students on the falling-behind list. No database change was needed.

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
