# 20. Automation testing

> Automated checks that the app still works as intended, run before every go-live.
> They are in the **`Automation Testing`** folder at the top of the project, and GitHub runs them for you.

| | |
|---|---|
| **Added** | 6 November 2026 |
| **Checks** | 358 database checks in 11 files, plus the app's type check, lint and build |
| **Time** | About 2 seconds for the database checks; the whole GitHub run takes 2 to 4 minutes |
| **Touches Staging or Production?** | **No.** Every run builds its own empty test database and throws it away afterwards |

---

## Contents

1. [What is tested](#1-what-is-tested)
2. [Running the tests](#2-running-the-tests)
3. [Before going live](#3-before-going-live)
4. [When a test fails](#4-when-a-test-fails)
5. [Setting it up (once)](#5-setting-it-up-once)
6. [How it works](#6-how-it-works)
7. [Adding a test](#7-adding-a-test)
8. [What is not tested yet](#8-what-is-not-tested-yet)

---

## 1. What is tested

Most of the app's rules live in the database, such as who can see what, batch places and the all-or-nothing saves. So the tests build a database from **every script in `supabase/migrations/` and `supabase/migrations/AI/`** (in date order), fill it with a small set of test people and classes, and check each rule by signing in as each kind of person.

| File | Checks | What it checks |
|---|---|---|
| `10-staff-access` | 37 | Admins see and change everything. Office staff can't add staff, change subjects or reorder the curriculum. Inactive staff, logins with no role and people not signed in see nothing. Dates of birth and hand-in codes are hidden. |
| `20-teacher-access` | 48 | A teacher sees only their own open batches, students, homework and files. They can set and mark homework, add corrected sheets and complete lessons only in their own batches. They can't see parents, enquiries, notes or other teachers, and can't delete homework or change batches or students. Closed batches and teachers marked Left drop out. |
| `30-student-and-family` | 36 | A family login lists its children and switches between them. Dashboard, My homework, handing in and marks work. Students can't read the tables directly. Children who have left drop off. One email can't be both a teacher and a student login. |
| `40-handin-link` | 22 | The WhatsApp link opens the right student and only their homework. Handing in marks it received, with at most 20 files. A marked homework keeps its mark. Old homework drops off, and the link stops working when a student leaves. |
| `50-batches` | 33 | New batches get a code and a lesson plan. Places can't go below the students in a batch, and a full batch is refused. The teacher class-time clash check works for new batches, teacher changes and reopening a closed batch, and a refused save changes nothing. Students follow the batch's teacher. The Batches list figures and Modified dates are right. |
| `60-homework` | 35 | Set homework and its worksheet. Students who join later don't get old homework. Mark completed for topics and Lesson library lessons sends homework once, with a separate maximum mark for each sheet, and refuses a sheet with no worksheet. Marking, and deleting homework with its results. |
| `70-students` | 27 | Saving a student creates the family, parent, subjects, batch teacher, folder link and hand-in code. Required fields are checked. A removed subject is ended, not deleted. Leaving gives up the batch place. Only staff can save. |
| `80-bulk-import` | 25 | Only admins can import. A check (dry run) saves nothing. A real import adds teachers, batches and students and matches existing ones. Importing again changes nothing. Files with problems or class-time clashes are refused with a message. |
| `85-gcse-year-groups` | 23 | GCSE - H and GCSE - F: the labels, students saved as GCSE - H / F, Year 13 refused for students, batches, lessons and teachers. Bulk import reads `GCSE-H`, `GCSE - F`, `GCSE Higher` and `Foundation`, and refuses `Year 11`, `Year 13` and unknown years with a message. Nothing is left in Year 13. |
| `90-database-checks` | 9 | Rules for the database as a whole: every table has row-level security switched on, every full-rights function fixes its `search_path`, and every view follows the signed-in person's rules. The fast rule pattern from guide 18 is used, there are 34 teacher rules (29 from guide 15, 5 for the question bank), private columns are hidden, the Drive folder table is server-only, and the hand-in link functions work without signing in. |
| `95-question-bank` | 63 | The AI question bank (guide AI-02): drafts and saves, refused saves change nothing, who may start and approve a version (admins and teachers of that subject and year; not operations staff, other years, teachers who have left, students or families), approval for one exact PDF, one approved version at a time, approved versions frozen even in SQL, new question versions only when a question changes, keyword search (word stems, lesson name, filters, current version only, "PDF changed" ignored), discarding a draft, the log, and deleting a lesson. |

The GitHub run also checks the app itself: **type check** (`tsc`), **lint** and **build**, the same as `npm run build` on your computer.

## 2. Running the tests

**On GitHub (the normal way).** Nothing to install.
- They run **by themselves on every push to `staging`**.
- To run them by hand: GitHub › your repository › **Actions** › **Automation tests** › **Run workflow** › choose `staging` › **Run workflow**.
- The result: a **green tick** means everything passed; a **red cross** means something failed. Click the run, then **Database tests**, to see every check by name. The run's **Summary** page has a table per file.

**On your computer (optional).** You need PostgreSQL 16 installed (it includes `psql`) and Git Bash. Then, in the project folder:
```bash
export PGUSER=postgres PGPASSWORD=<your local Postgres password>
bash "Automation Testing/run-database-tests.sh"
```
To run one area only, add part of its name, for example `bash "Automation Testing/run-database-tests.sh" teacher`.

You can also ask Claude in this project to run them on the folder.

> ⚠️ Never point the tests at Supabase. They create and delete their own database. The runner refuses if `PGHOST` contains "supabase".

## 3. Before going live

Add this to the go-live routine (guide 13, section 5):

1. Push your last change to `staging` and wait for **Automation tests** to finish on GitHub › **Actions**.
2. **Only go live on a green tick.** If it's red, fix the problem on `staging` first.

The tests check the migration scripts in your folder. They don't check that a script has been run on Production, so the go-live list in guide 13 is still needed.

## 4. When a test fails

Each failed check says what was expected, for example:

```
✘ A teacher sees only the students in their batch
    got Kim,Lee,Max,Sam, expected Kim,Sam
```

There are two possible reasons:
- **The change broke something.** Fix the code or the script, push again, and check the run is green.
- **The behaviour was changed on purpose,** for example a new rule. Update that check in the same change, so the tests describe how the app should work now.

If a file says **"stopped with an unexpected error"**, a script or a check hit an error nobody expected. The message under it says where.

## 5. Setting it up (once)

1. Put the GitHub workflow file in place. GitHub only runs workflows from `.github/workflows/`, and Claude can't write into that folder on your computer, so the file is in `Automation Testing/setup/`. In PowerShell, in the project folder:
   ```powershell
   New-Item -ItemType Directory -Force .github\workflows
   Copy-Item "Automation Testing\setup\automation-tests.yml" .github\workflows\
   ```
   If you change the workflow later, change both copies (or delete the one in `setup/` once it is in place).
2. Commit `Automation Testing/` and `.github/workflows/automation-tests.yml` and push them to `staging`.
3. On GitHub, open **Actions**. If it asks, press **I understand my workflows, go ahead and enable them**. The first run starts with the push.
4. Optional, recommended: make GitHub refuse a merge into `main` until the tests pass. Go to **Settings › Branches › Add branch ruleset** (or **Add rule**) for `main`, tick **Require status checks to pass**, and choose **Database tests** and **App checks (types, lint, build)**. This only applies when going live through a pull request. With the `git merge` routine in guide 13, step 3 above is the check.

## 6. How it works

| File | What it does |
|---|---|
| `Automation Testing/run-database-tests.sh` | Creates an empty database called `pencilmaths_test`. Runs `database/supabase-stub.sql`, every migration in `supabase/migrations/` and `supabase/migrations/AI/` in date order, `supabase/seed.sql` and `database/helpers.sql`. Then runs each `database/*.test.sql` in its own transaction, which is rolled back, so each file starts from the same data. Prints ✔ or ✘ for each check, and ends with "All N checks passed" or the number that failed. Exit code 1 if anything failed. |
| `database/supabase-stub.sql` | Supabase's basics (the `anon`, `authenticated` and `service_role` roles, `auth.users`, `auth.uid()`), so the migrations run on plain Postgres. **Only for tests.** |
| `database/helpers.sql` | The check functions (`tests.eq`, `tests.ok`, `tests.throws`, `tests.lives`), and `tests.as('teacher1')` to sign in as a test person. |
| `database/fixtures.sql` | The test data: 3 staff, 3 teachers, 4 students and 3 batches, a family login, homework, files and Lesson library lessons. The header lists everyone and every id. |
| `.github/workflows/automation-tests.yml` (copy in `Automation Testing/setup/`) | The GitHub run: **Database tests** on a fresh Postgres 16, and **App checks** with `npm ci`, `tsc`, lint and build (with placeholder settings; this build is never deployed). |

Signing in as a test person works like Supabase: the test sets the signed-in user and the `authenticated` role, so every database rule applies exactly as in the app.

## 7. Adding a test

When you add a feature or a migration, add its checks in the same change, in the file for that area, or in a new `NN-area.test.sql`:

```sql
-- Sign in as someone from fixtures.sql: admin, office, former, teacher1, teacher2, teacher_left, family, lee, nobody, or null (not signed in).
select tests.as('teacher1');

-- Something should equal something (write the name as what should be true, in plain words).
select tests.eq((select count(*) from students), 2::bigint, 'A teacher sees only the students in their batch');

-- Something should be refused, with part of the error message.
select tests.throws($$select save_batch('{}')$$, 'Only staff', 'A teacher can''t add a batch');

-- Something should work.
select tests.lives($$select set_homework('40000000-0000-0000-0000-000000000001', '{"title": "Extra"}')$$, 'A teacher can set homework');

-- Change data behind the scenes, with no rules, then sign in again.
select tests.as_owner();
update batches set closed_on = current_date where code = 'TB-1';
```

Tips:
- Counts are `bigint`, so write the expected number as `2::bigint`.
- To check how many rows an update changed: `with c as (update … returning 1) select tests.eq(count(*), 0::bigint, '…') from c;`
- Inside `$$ … $$`, `:'name'` variables don't work. Use `format('select f(%L)', :'name')` instead.

## 8. What is not tested yet

- **Screens and clicks.** Browser tests (Playwright) of the main jobs, such as adding a student, creating a batch or marking homework, can go in `Automation Testing/browser/` later. They would run against Staging with test logins.
- **Google Drive and email.** Uploads, folders and invite emails need the real services. Check them by hand with guide 10.
- **Small code helpers,** such as spreadsheet reading and the marking tool's maths (architecture review F9, item 1).

So a short manual check from guide 10 is still worth doing before a big release.
