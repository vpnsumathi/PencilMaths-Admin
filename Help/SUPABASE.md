# PencilMaths-Admin — Supabase Database Guide

> What each database script in `supabase/` does, and what every table is for.
> Run the scripts **in this order** in the Supabase SQL Editor: files 1 → 4, then `seed.sql`.

| | |
|---|---|
| **Last updated** | 5 October 2026 |
| **Totals** | 20 tables, 4 views, 10 enums, 54 curriculum topics |

---

## Contents

1. [How the data fits together](#how-the-data-fits-together)
2. [File 1 — `20260928000001_schema.sql`: tables](#file-1--20260928000001_schemasql-tables)
3. [File 2 — `20260928000002_views_and_functions.sql`: reports](#file-2--20260928000002_views_and_functionssql-reports)
4. [File 3 — `20260928000003_security.sql`: who can see what](#file-3--20260928000003_securitysql-who-can-see-what)
5. [File 4 — `20260928000004_student_functions.sql`: saving students](#file-4--20260928000004_student_functionssql-saving-students)
6. [`seed.sql`: starting data](#seedsql-starting-data)
7. [Automatic rules (triggers) at a glance](#automatic-rules-triggers-at-a-glance)

---

## How the data fits together

```
families ─┬─ guardians                 (parent contacts)
          └─ students ─┬─ enrolments ── subjects
                       │     └── batches ── teachers
                       │           ├── batch_slots    (weekly times)
                       │           ├── batch_topics   (lesson plan)
                       │           ├── class_sessions ── attendance
                       │           └── homework_sheets ── homework_results
                       ├─ student_notes
                       └─ file_links
enquiries ─┬─ enquiry_subjects   (new-student pipeline; becomes a student when enrolled)
           └─ enquiry_events
staff                             (portal users, linked to Supabase sign-in)
```

- **Enrolment** = a student taking one subject. **Batch** = a small class (default 3, max 12) of one subject, year group and teacher.
- Codes are generated automatically: students `PM-1001`, teachers `T001`, batches `B-001`, enquiries `E-201`.
- Times are stored in UTC; class dates are UK calendar dates. Weekdays: 1 = Monday … 7 = Sunday.

---

## File 1 — `20260928000001_schema.sql`: tables

Creates the structure: enums, tables, indexes and basic automatic rules.

### Enums (fixed lists of allowed values)

| Enum | Values |
|---|---|
| `staff_role` | admin, operations, head_teacher |
| `teacher_status` | active, on_leave, onboarding, left |
| `student_status` | active, trial, paused, leaving, left |
| `enquiry_stage` | new → assessment_sent → assessment_returned → results_shared → confirmed → enrolled (or not_proceeding) |
| `topic_status` | not_started, in_progress, complete |
| `attendance_status` | present, late, absent |
| `homework_status` | pending, received, marked, excused |
| `update_channel` | whatsapp, phone, email, marks_sheet, other (how a class update reached us) |
| `note_category` | general, call_log, academic |
| `file_provider` | external_link (pasted URL, phase 1), google_drive (phase 2) |

### Tables

| Group | Table | What it holds |
|---|---|---|
| Reference | `subjects` | The 4 subjects. Id is text (`maths`, `science`, `english`, `eleven_plus`). |
| | `curriculum_topics` | Default lesson-plan topics per subject, in order (optionally per year group). |
| People | `staff` | Portal users. `id` = the Supabase sign-in user. Has `role` and `active`. |
| | `teachers` | Tutors: name, contact, subject, year range, status. `auth_user_id` reserved for teacher logins later. |
| | `families` | Groups siblings; holds the WhatsApp group name. |
| | `guardians` | Parent/guardian contacts for a family. Only one `is_primary` per family. |
| | `students` | Pupils: name, year group (1–13), school, status, start/left dates, family. |
| Classes | `batches` | A class group: subject, year group, teacher, capacity, open/closed dates. |
| | `batch_slots` | The batch's weekly times (weekday + start time). |
| | `enrolments` | A student's place in a subject; teacher and batch optional until assigned. Only one active enrolment per student per subject. Ended by setting `ended_on`. |
| | `batch_topics` | Each batch's own copy of the lesson plan, with progress status. |
| | `class_sessions` | One row per class held (one per batch per day): topic covered, how the update came in, notes, who logged it. |
| | `attendance` | Present / late / absent per student per class. |
| Homework | `homework_sheets` | Homework set for a batch: title, set/due dates, max mark. |
| | `homework_results` | Each student's status and mark for a sheet. |
| Enquiries | `enquiries` | New-student enquiries: child, parent contact, stage, assessment score (0–100). Links to `students` once enrolled. |
| | `enquiry_subjects` | Subjects an enquiry is interested in. |
| | `enquiry_events` | History of stage changes (when, by whom). |
| Other | `student_notes` | Notes on a student (general, call log, academic) with author. |
| | `file_links` | Links to files/folders (student folder, homework, assessment). One folder per student. Google Drive ready. |

**Design notes:** parent contacts live in `families`/`guardians`, not `students`, so a future teacher login can be denied them. Deleting a student also deletes their enrolments, attendance, results, notes and files (`on delete cascade`).

---

## File 2 — `20260928000002_views_and_functions.sql`: reports

Ready-made queries the app reads like tables. Views use the signed-in user's permissions (`security_invoker`), so security rules still apply.

| Name | Type | What it gives |
|---|---|---|
| `expected_classes(from, to)` | function | Every class that *should* have happened between two dates (from batch slots), with the logged session if there is one. Spots missing class logs. |
| `student_stats` | view | Per student: attendance % and homework % over the last 28 days, and last class date. |
| `student_list` | view | One row per student for the Students screen: subjects, teachers, batches, "missing teacher/batch" flags, attendance and homework %. |
| `batch_list` | view | One row per batch: subject, teacher, members, schedule (e.g. `Mon 17:00`), topics done/total, last class, homework waiting to be marked. |
| `seed_batch_topics` | trigger | When a batch is created, copies the matching curriculum topics into `batch_topics` and marks the first one in progress. |

---

## File 3 — `20260928000003_security.sql`: who can see what

Turns on **row-level security (RLS)** for every table. Without a matching rule, nobody can read or change anything.

| Rule | Effect |
|---|---|
| `is_staff()` | True if the signed-in user has an **active** row in `staff`. |
| `is_admin()` | True if that staff row also has role `admin`. |
| All tables except `staff` | Active staff can read and change everything. |
| `staff` table | Active staff can read it; only **admins** can add, change or remove staff. |

Also lets signed-in users run `expected_classes`. **Result:** a user who is signed in but not in `staff` sees nothing, which is why the app shows 0 rows until your `staff` row exists.

---

## File 4 — `20260928000004_student_functions.sql`: saving students

| Name | Type | What it does |
|---|---|---|
| `student_left_release_places` | trigger | When a student's status changes to `left`: removes them from their batches (frees the places, keeps teacher history) and sets `left_on`. Changing back clears `left_on`. |
| `save_student(p jsonb)` | function | Creates or updates a student in **one step**: student, family, primary guardian, subjects (adds, updates, ends removed ones) and folder link. Checks: staff only, first/last name required, at least one subject, no duplicate subjects. Returns the student id. |
| `teacher_list` | view | One row per teacher for the Teachers screen: subject, year range, status, open batch count, active student count. |

---

## `seed.sql`: starting data

Reference data only, no test pupils.

| Subject | Topics |
|---|---|
| Maths | 16 |
| Science | 14 |
| English | 12 |
| 11+ Prep | 12 |

Re-running is safe for `subjects`. ⚠️ Re-running would **duplicate** the curriculum topics (the duplicate check does not work because their `year_group` is empty), so run it only once.

---

## Automatic rules (triggers) at a glance

| When | What happens | File |
|---|---|---|
| A teacher, family, student, batch, enrolment or enquiry is updated | `updated_at` set to now | 1 |
| An enrolment is saved with a batch | Batch must be the same subject; enrolment's teacher copied from the batch | 1 |
| A batch is created | Lesson plan copied from the curriculum | 2 |
| A student's status becomes `left` | Batch places released; `left_on` set | 4 |
