# 15. Teacher login

Built 27 Oct 2026. **Staging only** until go-live. Plan: `plans/teacher-login.md` in the Claude project files.

A teacher signs in to the same portal as staff, but sees only **their own open batches** and **the students currently in them**: the lesson plan, homework, hand-ins and marking. They never see parents' details, enquiries, other teachers, other batches, student logins, hand-in links or Drive folders.

---

## 1. Setting it up (once, on Staging)

1. In the Supabase **Staging** project, open **SQL Editor**, paste `supabase/migrations/20261027000004_teacher_login.sql` and press **Run**. It needs the 27 Oct scripts to have run first.
2. Nothing new in `.env.local` or Vercel: invites use the same `SUPABASE_SECRET_KEY` as student logins (guide 12).
3. Push the code to the `staging` branch. Vercel redeploys Staging on its own.

## 2. Giving a teacher a login (admins)

1. **Teachers** › click the teacher.
2. The **Teacher login** card is at the top. The email box is filled in from the teacher's personal email; change it if needed.
3. Press **Send login invite**. The teacher gets the Supabase invite email, chooses a password and lands on their dashboard.
4. While they haven't accepted, the card says "Invite sent…" with **Resend invite**. Once accepted it says "Can sign in as …".
5. **Remove access** deletes the login. Their record, batches, homework and marks stay.

Only **admins** see the card. Operations and head teacher staff see the teacher's details as before.

| Situation | What happens |
|---|---|
| The email is already a **staff** login (for example a head teacher who teaches) | The login is linked. They keep the full staff view. Remove access only unlinks it. |
| The email is already a **student or family** login | Refused: "That email is a student or family login. Use a different email for the teacher." The Student login card also refuses a teacher's email. |
| The email already has some other login | It is linked; they sign in with that password or use Forgot password. |
| The teacher is marked **Left** | No invite can be sent. If they still have a login, they see nothing when they sign in. |
| The teacher is **On leave** | They can still sign in. |

## 3. What a teacher sees

The menu has three items: **Dashboard**, **My batches**, **My students**. Their name and "teacher" show at the bottom of the menu.

| Page | For a teacher |
|---|---|
| Dashboard | The same tiles and charts, counted only over their batches and students. No enquiries tile or pipeline, no WhatsApp **Nudge** button. |
| My batches | Their open batches (no Teacher column, no **New batch**). |
| Batch page | Students, lesson plan (Start, Complete, Undo), **Upload Homework** (set homework, add or remove homework files, give past homework), marks, **🖊️ Mark**, **Send**. No batch settings form, no **Close batch**, no **Delete homework**. Class times show under the title. |
| My students | Students in their batches, with the subject and batch they have with this teacher only. No **Add student**. |
| Student page | A short read-only page: code, year, school, status, attendance and homework rates for their classes, and **Classes with you** linking to the batch. |
| Teachers, Enquiries, Subjects, Lesson library, Staff, Google Drive, new student/batch pages | Not available: they go back to the dashboard. |

Files (hand-ins, corrected sheets, homework sheets) open through the app (`/files/…`) for teachers, because they don't have access to the Pencil Maths Google Drive. The **View** link for a Lesson library worksheet in the Complete lesson pop-up still goes to Google Drive, so it may not open for a teacher; the worksheet itself is still sent with the homework.

## 4. How it works

### 4.1 The link from a login to data

```
teacher login ─► teachers.auth_user_id ─► batches.teacher_id (open batches only)
                                            ├─ batch_slots, batch_topics, batch_lessons, class_sessions, attendance
                                            ├─ homework_sheets ─ homework_results, homework_markups, file_links (homework files only)
                                            └─ enrolments (current) ─ students
```

- A student is visible only while they have a **current** enrolment in one of the teacher's **open** batches.
- If a batch moves to another teacher, the old teacher loses it at once and the new teacher sees all of it, including earlier homework.
- When a student moves batch or leaves, the old teacher stops seeing them and their homework. Staff still see everything.
- A closed batch disappears from the teacher's view.

### 4.2 The database script (`20261027000004_teacher_login.sql`)

| Part | What it does |
|---|---|
| 1 | Removing a teacher's login clears `teachers.auth_user_id` (instead of being refused). |
| 2 | Trigger `login_kind_check`: one login can't be both a teacher and a student/family login. |
| 3 | `current_teacher_id()`, `current_teacher()` (name for the menu) and the checks `teaches_batch`, `teaches_student`, `teaches_student_in_batch`, `teaches_sheet`, `teaches_sheet_student`, `teaches_lesson`. All `security definer`, so the rules don't loop through each other. A teacher marked Left gets nothing. |
| 4 | The teacher rules, named `teacher_read`, `teacher_add`, `teacher_update`, `teacher_remove`, next to the existing staff rules. Supabase allows a row if **any** rule allows it, so staff keep exactly what they had. No teacher rule exists on `families`, `guardians`, `enquiries`, `enquiry_*`, `staff`, `teachers`, `student_notes` or `login_current_student`. |
| 5 | **Two student columns are hidden from everyone signed in:** `date_of_birth` and `handin_code` (the secret part of the WhatsApp hand-in link). Rules work per row, so this is done with column permissions. Staff read them through `student_private(id)`, used by the student page. |
| 6 | `student_drive_folder(id)`: the student's Drive folder id for corrected sheets, for staff or the student's own teacher only. |
| 7 | The `batch_list` view joins `teachers` with a left join, because teachers can't read the teachers table (the Teacher column is empty in their own view). |

What teachers can change, by table:

| Table | Teacher can |
|---|---|
| `subjects`, `batches`, `batch_slots`, `enrolments`, `students`, `lessons`, `lesson_homework` | Read |
| `batch_topics` | Read, update |
| `batch_lessons`, `class_sessions`, `attendance`, `homework_results`, `homework_markups` | Read, add, update |
| `homework_sheets` | Read, add (not delete) |
| `file_links` | Read hand-ins, corrected sheets and homework sheets; add and remove homework sheets and corrected sheets. Never student folders. |

> **Faster rules (6 Nov 2026):** `20261106000001_faster_database.sql` rewrote 25 of the 29 teacher rules to check against lists worked out once per query: `my_batch_ids()`, `my_student_ids()`, `my_sheet_ids()`, `my_sheet_students()` and `my_lesson_ids()`. The rule names and what each teacher can see and change are exactly the same. The 3 attendance rules still use `teaches_student_in_batch`, and `subjects` still checks `current_teacher_id()`. Staff rules now read `(select is_staff())`. Why: [guide 18](18-database-performance-review.md), finding D1.
>
> **Writing a new teacher rule:** use the list pattern, for example `using (batch_id in (select my_batch_ids()))`, not a `teaches_…()` call on each row.

> **Adding a column to `students` later:** add it to the `grant select (...) on students` list too (part 5 of the script, run again or in a new script), or nobody signed in can read it.

### 4.3 The app

| File | Job |
|---|---|
| `web/src/lib/auth.ts` | `getViewer()` (staff or teacher, worked out once per page), `isTeacher()`, `requireStaff()` for staff-only pages and actions, `requireAdmin()` as before |
| `web/src/app/(portal)/layout.tsx` | Lets in staff and teachers; students still go to `/me` |
| `web/src/components/AppShell.tsx` | The teacher menu |
| `web/src/app/(portal)/teachers/TeacherLogin.tsx` | The Teacher login card |
| `web/src/app/(portal)/teachers/actions.ts` | `giveTeacherLogin`, `resendTeacherInvite`, `removeTeacherLogin` (admins only) |
| `web/src/lib/supabase/admin.ts` | `findUserByEmail()` moved here from the student actions, so both use it |
| `web/src/lib/homework/corrections.ts`, `lib/students/driveFolder.ts` | Corrected sheets find the student's Drive folder through `student_drive_folder`; for a teacher, a missing folder is made with the full-rights connection after access was checked |
| `web/src/app/(portal)/page.tsx`, `_dashboard/` | Teacher version of the dashboard |
| `web/src/app/(portal)/batches/` `page.tsx`, `[id]/page.tsx`, `HomeworkSection.tsx` | Teacher version of the batch pages |
| `web/src/app/(portal)/students/` `page.tsx`, `[id]/page.tsx` | Teacher version of the student pages; staff student page reads date of birth and the hand-in code through `student_private` |
| Staff-only pages and actions (students, teachers, enquiries, new batch, edit/close batch, delete homework) | `requireStaff()` at the top |

**Why the database does the real work:** hiding buttons is not enough, because anyone signed in can call Supabase directly with their own login. The rules above mean a teacher gets only their own data however they ask. Server actions that use the secret key or the Google Drive service account (which get past the rules) first load the batch, homework or student with the normal signed-in connection and stop if nothing comes back.

## 5. How to test it (Staging)

1. Run the script (section 1). Then, in the SQL Editor, check: `select count(*) from pg_policies where policyname like 'teacher\_%';` gives **29**. After `20261106000001_faster_database.sql` it is still **29**.
2. As an admin, open a test teacher who has a batch, and **Send login invite** to an email you own (not one used by a test student). Accept it and set a password.
3. Signed in as the teacher, check the menu has three items and that **My batches** and **My students** show only their batch and its students.
4. Copy the address of another teacher's batch or student from your admin window: as the teacher it says **not found**.
5. On their batch: start and complete a lesson, set a homework, open a hand-in with **View File**, mark it with **🖊️ Mark** and **Save & send**. All should work. There is no **Delete homework**, **Close batch** or batch settings form.
6. Open `/teachers`, `/enquiries` and `/students/new` as the teacher: you're sent back to the dashboard.
7. As admin, try **Send login invite** with a test student's email on another teacher: refused with a message.
8. Set the teacher to **Left** (Teachers › edit): signed in, they now see nothing. Set them back to Active.
9. As admin, check a student page still shows the date of birth and the hand-in link, and that saving a student still works.

## 6. Go-live

Run `20261027000004_teacher_login.sql` on **Prod** after the 27 Oct scripts, just before merging `staging` into `main` (guide 13).
