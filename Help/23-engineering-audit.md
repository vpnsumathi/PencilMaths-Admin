# 23. Full engineering audit

**Date:** 11 November 2026. Read-only: no app code, migration or setting was changed.
**Section:** Process Improvement / Optimization (see the [Help index](README.md)). It follows on from the [architecture review](17-architecture-review.md) (F1–F24), the [database performance review](18-database-performance-review.md) (D1–D8) and the [page speed review](19-page-speed-review.md) (P1–P9). It does not repeat their findings. Section 2 gives where each one stands today, and section 3 lists what is new (E1–E14).

**Scope:** the code in your folder on the `staging` branch as it stood on the evening of 11 November, after the commit "Teacher login to class notes: all work since 27 Oct". That is `web/` (144 `.ts`/`.tsx` files, about 10,800 lines), the 28 scripts in `supabase/migrations`, the `Automation Testing` folder and Help guides 01, 05, 10 and 13–22. The AI work (`supabase/migrations/AI`, `Help/AI`) is experimental and on its own branch, so it is left out, except that its tests were run.

**What I ran** (on a copy, never on Staging or Production):

| Check | Result |
|---|---|
| Built a fresh database from all 28 migrations and the seed, then ran the automation tests | ✅ All **511 checks pass** |
| `tsc --noEmit` (type check) | ✅ No errors |
| `eslint` | ✅ No problems |
| `next build` | ✅ Builds. Pages send 135–160 kB of JavaScript; the marking page sends 340 kB, because of the PDF viewer |
| `npm audit --omit=dev` | ❌ **1 critical and 2 high** advisories (E1) |
| Calling the database directly as a family (no login) and as a teacher, the way the app's public key allows | ❌ Several checks that the app makes can be skipped (E2, E3) |

---

## 1. Summary

The app is in good shape for its size. The security still lives in the database, as it should. Every table has row-level security, every full-rights function fixes its `search_path`, every view follows the signed-in person's rules, and the tests prove it on each run. The earlier reviews' biggest items are done: saves are all-or-nothing, there are error pages, access checks run on every action, the database rules are fast, and 511 automated checks exist. Code quality is high: it is consistent, well commented, type checks cleanly and has no lint warnings.

What is left falls into three groups.

1. **Things to fix before real families use Production (P1).**
   - **E1.** Two libraries have published security problems. Next.js needs a patch update (15.5.27 → 15.5.29). The PDF viewer used on the marking page (`pdfjs-dist` 5.7) can run JavaScript hidden in a PDF, and families' hand-ins are PDFs that staff open there.
   - **E2.** The WhatsApp hand-in link's "record this file" function can be called by anyone holding the link, with any web address. A link to any site then shows up as a handed-in file in the staff homework list. I checked this on the test database.
   - **D6 / F2 (still open).** The batch page and the dashboard read rows in bulk and Supabase stops at 1,000 rows without saying so. At normal use, the batch page's file list will pass 1,000 rows in about one term. After that, the newest handed-in files silently go missing from the page.
   - **F1 (still open).** Staging and Production must not share one Google Drive. The new Production plan (a separate Google account) fixes this, as long as it is followed.
2. **Weak spots to fix in the next few weeks (P2).** Some rules are checked only in the app, so a teacher can skip them by calling the database directly (E3). The GitHub test run is not switched on yet, because the workflow file was never copied into `.github/` (E8). There are no backups of the database or the Drive files beyond Supabase's plan (E10), and there is no error monitoring (F21). Login limits may treat everyone as one person (E5, a check). Migrations are still pasted by hand (F6), and the Production rebuild is the ideal moment to change that.
3. **Tidying (P3–P4).** Security headers, the reset-password page, Git hygiene, and the old architecture items F8, F11–F13, F20.

**Overall rating: 8 out of 10** (up from about 7 on 3 November). It would be about 9 once E1, E2, D6 and the backup question are dealt with.

| Area | Rating | Note |
|---|---|---|
| Data security (database rules) | Strong | 511 checks, all passing. The gaps are rules only checked by the app (E2, E3) |
| App security | Good | Login checks right, no secrets in code. Dependency advisories (E1) and headers (E6) |
| Correctness at larger sizes | Needs work | 1,000-row limit on the batch page and the dashboard (D6, F2) |
| Reliability and operations | Needs work | No monitoring, no backups beyond the plan, manual migrations, test run not switched on |
| Code quality and maintainability | Strong | Type check and lint clean, clear structure, excellent comments and guides |
| Performance | Good | Fast database rules, loading skeletons, parallel queries. D5 and P1 are still checks |
| Testing | Good, database only | No unit or browser tests yet (F9) |

---

## 2. Earlier findings: where they stand today

I checked each open item against today's code. ✅ done · 🟡 partly · ⬜ open · ⏳ your decision · 🔍 a settings check only you can do.

### Architecture review (guide 17)

| # | Finding | Today | What I found |
|---|---|---|---|
| F1 | Staging and Production share one Drive | ⬜ P1 | Still the case in code. The Drive root name `PencilMaths` is now written in **four** places (class notes added `lib/classNotes.ts:44` to `drive.ts:102`, `homework/sheets.ts:32` and `lesson-library/actions.ts:80`). The 9 Nov Production plan uses a separate Google account, which solves it if followed. A `DRIVE_ROOT_FOLDER` setting would still be a cheap second guard |
| F2 | 1,000-row limit | 🟡 P1 | Dashboard: the "not handed in" list reads every pending result of the last 90 days (`_dashboard/homework.ts:57`), and **all enquiries ever** (`_dashboard/data.ts:64`). Students list: whole `student_list`. See the sizes under E4 |
| F3 | Non-atomic saves | ✅ | `save_batch`, `set_homework`, `complete_topic`, `complete_lesson`, `save_register` |
| F4 | Error pages | ✅ | |
| F5, F18 | `/auth/callback` | ✅ | Removed. `/auth/confirm` checks `next` |
| F6 | Migrations by hand | ⬜ P1 | 28 scripts now. Production is being rebuilt from scratch, so this is the cheapest moment to start with `supabase db push` (see E12) |
| F7 | Access checks on actions | ✅ | Every action I read calls `requireStaff`, `requireAdmin` or `requireStaffOrTeacher`, or checks `getViewer()` |
| F8 | Generated database types | ⬜ P2 | 14 `as unknown as` casts remain |
| F9 | Tests and CI | 🟡 | 511 database checks. The GitHub run is **not active** (E8). No unit tests |
| F10 | Drive folder ids | ✅ | Plus one retry. `wordToPdf` still calls Google without the retry (minor) |
| F11 | Hand-made XLSX reader | ⬜ P3 | `inflateRawSync` still has no size limit (`lib/lessons/xlsx.ts:30`). Admin-only, so low risk |
| F12 | Messages in the address | ⬜ P4 | Also see E13 |
| F13 | `batches/actions.ts` too big | 🟡 | New features went into their own files (`classActions.ts`, `notesActions.ts`), which is the right direction. The main file is still 30 kB |
| F14 | Two lesson-plan systems | ⏳ | Still both. Class notes now offer both kinds of topic too, so the cost of keeping two keeps growing |
| F15 | Shared login code | ✅ | `lib/logins.ts` |
| F16 | `file_links` without database links | 🟡 | Clean-up in `deleteHomework` is done. No trigger yet |
| F17 | Rules only in the app | ⬜ P2 | Now has concrete, tested cases: see E3 |
| F19 | Tailwind | ✅ | `web/README.md` still has the default text |
| F20 | Formatter | ⬜ P4 | `login/actions.ts:21-24` is still mis-indented |
| F21 | Error monitoring | ⬜ P2 | 105 `console.error` calls and nothing that alerts you |
| F22 | Rate limits on public pages | ⬜ P3 | Unchanged. E2 makes the hand-in functions more worth protecting |
| F23 | RLS helpers per row | ✅ | Done by guide 18 D1 |
| F24 | Marking drawings unchecked | ⬜ P3 | Confirmed: any JSON is stored (E3) |
| §15 | Repository hygiene | ⬜ | See E9 |

### Database performance review (guide 18)

| # | Today | Note |
|---|---|---|
| D1–D4 | ✅ | In `20261106000001_faster_database.sql`. The tests check that new rules keep the fast pattern |
| D5 `jit` | 🔍 | Run `show jit;` in both Supabase projects |
| D6 batch page files | ⬜ **P1** | Not fixed. `HomeworkSection.tsx:48-63` reads every hand-in and corrected-sheet row for every homework the batch has ever had. See E4 |
| D7 student list figures | ⬜ P3 | Unchanged |

### Page speed review (guide 19)

| # | Today | Note |
|---|---|---|
| P1 region check | 🔍 | Supabase is in London (guide 01). Check that Vercel's **Function Region** is London (`lhr1`) for both projects |
| P2–P5 | ✅ | |
| P6 dashboard counting | 🟡 | Same as F2 |
| P8 streaming | 🟡 | The batch page now has folding sections. The homework part still loads before the page shows |
| P9 index | ✅ | Covered by the `enrolments_one_active (student_id, subject_id)` index |

---

## 3. New findings

Priorities as in guide 17: **P1** before real families use Production, **P2** in the next few weeks, **P3** when you next work in that area, **P4** optional.

### E1. Libraries with published security problems (P1)

> ✅ **Built (11 Nov)** in the folder: Next.js and `eslint-config-next` 15.5.29, `pdfjs-dist` 6.5.438, and an `overrides` entry that lifts the PostCSS copy inside Next.js to 8.5.32. `npm audit --omit=dev` now finds 0 problems. The marking page was tested with the new viewer (a 2-page PDF and a photo, both drawn and marked with the pen). The GitHub run now includes the security check and uses Node.js 22. Still to do by hand: delete the five unused SVG files in `web/public`.

`npm audit` on today's `package-lock.json` reports:

| Package | Installed | Problem (as the advisory states it) | Fix |
|---|---|---|---|
| `next` | 15.5.27 | **Critical:** remote code execution in the image optimiser when SVG files are used. Also a denial of service through Server Actions | `15.5.29`, a patch release in the same line |
| `pdfjs-dist` | 5.7.284 | **High:** a crafted PDF can run JavaScript when it is opened | `6.2.108` or later, a new major version |
| `postcss` (inside Next.js) | ≤ 8.5.22 | High, but only at build time | Comes with the Next.js update |

**Why it matters here:** the marking page (`batches/[id]/mark/Marker.tsx`) opens families' handed-in PDFs with `pdfjs-dist`. Anyone with a hand-in link can upload a PDF. If a crafted PDF ran script on that page, it would run as the signed-in staff member, with their access to every family's records. `web/public` also still holds the default `create-next-app` SVG files (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`). Nothing in the app uses them.

**Do:**
1. Set `"next": "15.5.29"` and `"eslint-config-next": "15.5.29"`, then run `npm install`, build and test on Staging.
2. Upgrade `pdfjs-dist` to the latest 6.x. The import path in `Marker.tsx:94` (`legacy/build/pdf.worker.min.mjs`) may change, so test marking a PDF and a photo on Staging.
3. Delete the five unused SVG files.
4. Add `npm audit --omit=dev --audit-level=high` to the GitHub run (E8), so a new advisory turns the run red.

**Effort:** 1–2 hours with testing.

### E2. The hand-in link's "record a file" function accepts any web address (P1)

> ✅ **Built (11 Nov)** in the folder: migration `20261111000003_handin_server_only.sql` lets only the server record a hand-in, saves the Drive address worked out from the file id (any address sent is ignored), refuses anything that isn't a Drive id, and locks the homework row so two uploads at once can't pass 20 files. `my_handin_record` is removed. The app records with `createAdminClient()` and bins the Drive file if recording fails (this also covers recommendation 6, orphaned uploads). 7 new checks; 518 pass.

- **Files:** `20261011000001_homework_handin.sql` (`handin_record`, granted to `anon`), `20261020000001_student_login.sql` (`my_handin_record`), and `HomeworkSection.tsx:36, 146, 182, 193`.
- **Now:** the app uploads the photo to Drive on the server and then calls `handin_record(code, sheet, file_id, url, label)` to save it. But the public key is in every browser, so anyone with the WhatsApp link can call `handin_record` directly, with any `url`, `file_id` and `label`. A student login can do the same through `my_handin_record`.
- **Tested** on the test database, signed out, using a fixture link code:
  `select handin_record('sam-handin-code', '<homework id>', 'anything', 'https://phishing.example/login', 'Week 3 answers.pdf');` was accepted, and the row appears in `file_links` as a normal Google Drive hand-in.
- **Why it matters:**
  1. On the batch page, staff open a hand-in through its stored `url` (`HomeworkSection.tsx:36`). A planted link therefore looks exactly like "Week 3 answers.pdf" from that student, and opens any website. Hand-in links are shared in WhatsApp groups and can be forwarded. (React 19 blocks `javascript:` links, so this is a phishing risk, not script injection.)
  2. The student's file route (`/me/homework/file/[id]`) downloads whatever Drive id the row holds, using the app's own Drive access. Someone who learns the id of another app-made file could record it as their own hand-in and download it. Drive ids are long and hard to guess, so this is unlikely, but it is a hole in the wall between families.
  3. It also lets someone fill a homework with 20 junk entries.
- **Do instead (recommended):** make recording a hand-in a server-only step.
  1. `revoke execute on function handin_record(...) from anon, authenticated;` and the same for `my_handin_record`, so the browser can no longer call them.
  2. In `h/[code]/actions.ts` and `me/homework/actions.ts`, call the record function with the server's full-rights client (`createAdminClient()`), after the upload the server has just done. `handin_target` and `handin_page` stay public, because they only read.
  3. Build the stored `url` from the file id in SQL (`'https://drive.google.com/file/d/' || p_file_id || '/view'`), and check that the id looks like a Drive id (`^[A-Za-z0-9_-]{20,}$`).
  4. Add a test in `40-handin-link.test.sql`: signed out, `handin_record` must be refused.
- **Benefit:** only files the server really uploaded can appear as hand-ins. **Cost:** about 2 hours, including the test.

### E3. Rules the app checks, but the database doesn't (P2)

This is F17 with tested examples. A teacher's login can talk to Supabase directly with the public key, just as the app does. So any rule that lives only in a server action can be skipped. Each of these was accepted on the test database when signed in as `teacher1`:

| Direct change | App's check that was skipped | Effect |
|---|---|---|
| `update homework_results set mark = 9999` on a 10-mark homework | `markHomework` refuses marks above the maximum | Wrong marks reach families and the dashboard |
| Insert a `homework_correction` row in `file_links` with any `url` | Corrected sheets come from the marking page | A link to any site shows up as "corrected sheet" for the student |
| Insert a `class_notes` row with `provider = 'google_drive'` and another student's Drive file id | `saveClassNote` checks the file is in the batch's notes folder | The batch's students can download that file through `/me/notes/[id]` |
| Upsert `homework_markups.data` with any JSON | none (F24) | Can break the marking page when it is reopened |

Staff can also give a result row to a student who is not in the batch (`markHomework` upserts without checking membership).

Teachers are staff you trust, so this is P2, not P1. But the design promise in guide 15 is that the database decides, and these four cases break it.

**Do:**
- A trigger on `homework_results` that refuses `mark > homework_sheets.max_mark`, and refuses a result for a student with no open enrolment in that homework's batch (the enrolment check on insert only).
- For `file_links` (teacher rows) and `class_notes`: take away the teachers' direct `insert` rights and let the server save these rows, like E2, after it has checked the Drive file. Alternatively, a trigger can require that `external_id` matches a file the server registered.
- For drawings: a `check (jsonb_typeof(data) = 'array' and pg_column_size(data) < 2000000)` or a small shape check in `keepDrawings`.
- Add each case to `20-teacher-access.test.sql`.

**Effort:** half a day with tests.

### E4. How soon the 1,000-row limit bites (P1, finishes D6 and F2)

Supabase returns at most 1,000 rows per request unless *Max rows* is raised. It does not report an error when it stops. Rough sizes at normal use:

| Query | Grows by | Passes 1,000 rows | What goes wrong |
|---|---|---|---|
| Batch page, hand-ins and corrected sheets (`HomeworkSection.tsx:48`) | 12 students × 3 homework a week × about 2 files ≈ 70 rows a week, per batch, for ever | **About 14 weeks: one term** | The list is sorted oldest first, so the **newest** hand-ins are the ones left out: staff see "no files" for this week's homework |
| Dashboard "not handed in" (`_dashboard/homework.ts:57`) | One row per student per homework, kept 90 days | Around 80 current students at 3 homework a week | The "not handed in" list and nudges are incomplete |
| Dashboard enquiries (`data.ts:64`) | Every enquiry ever | After 1,000 enquiries | "Waiting 7+ days" may miss some |
| Students list (`students/page.tsx:21`) | Students | 1,000 students | Far off |

**Do:**
1. Batch page: only fetch the files of the homework shown open, or of homework still pending or received, and load older homework on demand. At least add `.range(0, 4999)`, and show a warning when the count is higher.
2. Dashboard: count in SQL (one `dashboard_homework()` function that returns the finished lists), as P6 in guide 19 planned. Filter enquiries to open stages.
3. Today: in both Supabase projects, **Project Settings › API › Max rows**, write the value down, and raise it (for example to 10,000) as a stop-gap.

### E5. Logins all come from Vercel's servers (P2, a check)

`signIn`, `sendReset` and `changeMyPassword` call Supabase Auth from the server action, so Supabase sees Vercel's address, not the student's phone. Supabase's Auth rate limits (**Authentication › Rate Limits**) are counted per address. Two possible effects:
- At a busy moment, such as a class of students signing in at 16:00, the shared limit may refuse real people.
- The limit against password guessing is spread across everyone, so it protects each account less.

Supabase's built-in email also sends only a handful of emails an hour for the whole project, which a few password resets can use up. The Production plan already moves to your own SMTP.

**Do:** look at the numbers on that settings page, then try 20–30 sign-ins in a few minutes on Staging. If it refuses them, either raise the sign-in limit or move `signInWithPassword` into the browser (`createBrowserClient` in `LoginForm.tsx`), which sends each person's own address. **Effort:** 30 minutes to check.

### E6. Security headers (P3)

`next.config.ts` sets no headers. Add the usual set in `headers()`:
- `X-Frame-Options: DENY` (or `frame-ancestors 'none'`), so the portal can't be shown inside another site to trick a click.
- `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
- For the four file routes (`/files/[id]`, `/class-notes/[id]`, `/me/homework/file/[id]`, `/me/notes/[id]`), which pass on files from Drive under the app's own address, also `Content-Security-Policy: sandbox`. Then nothing inside a file can run as the app.

A full Content-Security-Policy is worth doing later, but it needs testing with the PDF viewer and Supabase.

### E7. "Choose your password" works for any signed-in session (P3)

`/me/password` asks for the current password, "so someone using a phone left signed in can't change it". But `/reset-password` (`reset-password/actions.ts`) changes the password with no current password, for anyone already signed in. So the same person can simply open `/reset-password`. **Do:** only allow `/reset-password` straight after an invite or reset link. For example, `/auth/accept` can set a short-lived cookie that the action checks, or the action can check that the session came from a recovery or invite link. **Effort:** 30–60 minutes.

### E8. The GitHub test run is not switched on (P2)

The workflow file is still only at `Automation Testing/setup/automation-tests.yml`. Nothing under `.github/` is in Git, so GitHub has never run the tests. Guide 13's go-live **step 0** ("the latest run is green") can't be met yet. **Do:** copy it into `.github/workflows/` (guide 20 §5), commit to `staging`, and check that **Actions** shows a green run. Add the `npm audit` line from E1. **Effort:** 15 minutes.

### E9. Git hygiene (P3)

From the Git index:
- **`Lesson Planner/`** (the term plan spreadsheets and 21 worksheet PDFs) is still tracked in Git, although it is gone from the folder. The deletion was never committed. If the GitHub repo is public (project memory says it was), those teaching materials are public too. Commit the deletion, and make the repo private unless there is a reason for it to be public. Note that old commits keep the files: making the repo private is the real fix.
- There is still no `.gitignore` at the top of the project (only `web/.gitignore`), so stray files at the top level can be committed by accident.
- The AI scripts and guides are not in Git on either branch yet, so the folder is their only copy.
- `web/README.md` still holds the default Next.js text. Point it to `Help/README.md`.

### E10. Backups (P2)

Guide 13 says Supabase Pro has daily backups and the free plan needs manual exports. Nothing in the project makes or tests a backup. Drive files have no second copy either, beyond Google's bin (30 days). **Do, before real data goes in:**
1. Choose: Supabase Pro (daily backups, 7 days kept), or a scheduled `pg_dump` of Production. A GitHub Action can run one nightly and keep it as a private artifact or in private storage.
2. Restore one backup into a throwaway project once, so you know it works.
3. For Drive: the Production Google account's own storage is the only copy. Consider Google Workspace's retention, or a monthly export.

### E11. Large class-note files pass through the server (P2, a check)

Class notes allow files up to 50 MB, uploaded straight from the browser to Drive. But teachers and students open them through the app (`/class-notes/[id]`, `/me/notes/[id]`), which streams the whole file through a Vercel function. Vercel limits how long a function may run (and, for responses that are not streamed, their size). **Do:** on Staging, add a 30–50 MB PDF as a class note and open it as a student on a phone connection. If it fails, either lower the limit (for example to 20 MB) or save big files as links.

### E12. Use the Production rebuild to start migration tracking (P1 timing for F6)

Production is being rebuilt from an empty project. That is the cheapest moment to apply the 28 scripts with the Supabase CLI (`supabase link`, then `supabase db push`), which records what has run in `supabase_migrations.schema_migrations`. Every later go-live is then one command, and Staging can be brought under the same tracking with `supabase migration repair`. The CLI only reads the files directly in `supabase/migrations`, so the `AI` folder stays out until you decide on AI.

### E13. Messages in the address can be faked (P4)

Pages show `?ok=` and `?error=` text from the address (F12). It is shown as plain text, so it can't run script, but anyone can send staff a link such as `/students?error=Your account is locked, call 07…`. If you move messages off the address one day (F12), this goes away. Until then, it is a reason not to trust odd messages in the app.

### E14. Office staff can do everything admins can, except settings (P3)

The database's `staff_all` rule lets any active staff role (admin, operations, head teacher) add, change and **delete** students, families, batches, homework and enquiries. Only Settings (staff, curriculum, lesson library, bulk import) is admin-only. That is fine for a small trusted team. Before more staff join, add the **audit log** (already next on the roadmap), so you can see who deleted or changed what. Consider making deletes of students and batches admin-only.

---

## 4. What is done well

- **Security in the database, with proof.** RLS on every table, `security_invoker` views, `SECURITY DEFINER` functions with fixed `search_path`, column grants hiding date of birth and hand-in codes, and 511 tests that rebuild the database from scratch on every run. I checked that the only full-rights functions open to signed-out users are the three hand-in functions plus harmless helpers.
- **Careful public surfaces.** The hand-in code is 128-bit, every id is checked against a pattern before use, uploads are checked for type and size, file names are cleaned, and `/auth/confirm` checks where it redirects.
- **Server-side checks on browser uploads.** Marked sheets and class notes uploaded straight to Drive are checked to be in the right folder before they are saved, and binned if the save fails.
- **Clean build.** Type check, lint and build all pass with no warnings. There are only 8 runtime libraries.
- **Good failure handling.** All-or-nothing saves, friendly messages with the real error logged, and the "database script not run yet" cases explained to the user.
- **Documentation.** The Help guides and code comments are excellent and up to date.

---

## 5. Suggested order

| # | Do | Finding | Effort | When |
|---|---|---|---|---|
| 1 | Next.js 15.5.29, `pdfjs-dist` 6.x, delete unused SVGs | E1 | 1–2 h | Before Production go-live |
| 2 | Make hand-in recording server-only, with a test | E2 | 2 h | Before Production go-live |
| 3 | Check and raise *Max rows*; limit the batch page's file query | E4, D6 | 1–2 h | Before Production go-live |
| 4 | Switch on the GitHub run (and add `npm audit`) | E8 | 15 min | Now |
| 5 | Production: separate Google account (as planned); build with `supabase db push` | F1, E12 | part of go-live | Go-live |
| 6 | Decide on backups and test a restore | E10 | 1–2 h | Before real data |
| 7 | Check login rate limits; test a 50 MB class note | E5, E11 | 1 h | Next week |
| 8 | Database checks for marks, teacher file rows, drawings | E3, F24 | ½ day | Next few weeks |
| 9 | Error monitoring (Sentry free tier, tagged Staging/Production) | F21 | 1 h | Next few weeks |
| 10 | Dashboard homework lists counted in SQL | F2, P6 | ½–1 day | Next few weeks |
| 11 | Security headers; `/reset-password` only after an email link | E6, E7 | 1–2 h | When next in that area |
| 12 | Git: commit the `Lesson Planner` deletion, root `.gitignore`, private repo | E9 | 15 min | Any time |
| 13 | Generated types, unit tests for the parsers, formatter | F8, F9, F20 | 1 day | When convenient |
| 14 | Audit log, then admin-only deletes | E14 | as planned | Roadmap |
| 15 | Settings checks: `show jit;`, Vercel function region London | D5, P1 | 10 min | Any time |

---

## 6. How the checks were done (to repeat them)

- **Database:** `bash "Automation Testing/run-database-tests.sh"` against a local PostgreSQL 16 (guide 20).
- **E2:** in a test database built by that script, run as `tests.as(null)` (signed out): `select handin_record('sam-handin-code', '70000000-0000-0000-0000-000000000001', 'anything', 'https://phishing.example/login', 'Week 3 answers.pdf');`. It should be refused after the fix.
- **E3:** the same, as `tests.as('teacher1')`: `update homework_results set mark = 9999 …`, an insert into `file_links` with `owner_type = 'homework_correction'` and an outside `url`, an insert into `class_notes` with another student's `external_id`, and an upsert of `homework_markups` with `data = '{"junk":"x"}'`.
- **Which full-rights functions anyone can call:** `select proname from pg_proc where pronamespace = 'public'::regnamespace and prosecdef and has_function_privilege('anon', oid, 'execute');`. Today: `handin_page`, `handin_target`, `handin_record`, `is_staff`, `is_admin`, and five trigger functions (which can't be called directly).
- **App:** in `web/`: `npm ci`, `npx tsc --noEmit`, `npx eslint`, `npx next build`, `npm audit --omit=dev`.

---

## 7. Follow-up audit: 11 November 2026

This section records the audit of the current working tree after the original review above. It keeps the earlier findings and adds a repeatable checklist for future reviews.

### Current verification

| Check | Result |
|---|---|
| `npm run lint` | ✅ Passed |
| `npx tsc --noEmit` | ✅ Passed |
| `npm run build` | ✅ Passed after allowing the build to fetch Geist from Google Fonts |
| `npm audit --omit=dev --audit-level=high` | ✅ 0 production dependency vulnerabilities |
| Database automation suite | ⚠️ Not completed: no responding local PostgreSQL server was available in this environment. The earlier 511-check result in section 1 was not independently reproduced. |

The build reported about 137 KB shared first-load JavaScript. Most routes are about 135–161 KB; `/batches/[id]/mark` is about 341 KB, largely due to the PDF viewer.

### Current findings

#### P1 — Fix or verify before Production use

1. **Public homework recording trusts browser-supplied file metadata.** `handin_record` is executable by `anon` and `authenticated` and accepts a client-supplied Drive ID, URL and label. A caller with a hand-in code can record an arbitrary URL as a submission. Revoke direct execution and record only server-uploaded files; derive the stored URL from the Drive ID and verify the file is in the expected folder. See `supabase/migrations/20261011000001_homework_handin.sql` and `web/src/app/h/[code]/actions.ts`.
2. **Test runner’s destructive host guard is incomplete.** `Automation Testing/run-database-tests.sh` drops the configured database. Its check rejects hosts containing `supabase`, but does not prove any other configured host is disposable. Restrict it to localhost or an explicitly allowed test host and require a test-only database name.
3. **Unbounded reads can silently hit Supabase’s row cap.** Batch homework/files, dashboard pending homework/enquiries and the Students list are loaded without pagination or truncation checks. Add bounded filters/pages and database-side summary queries where useful. See `web/src/app/(portal)/batches/HomeworkSection.tsx`, `web/src/app/(portal)/_dashboard/homework.ts`, `web/src/app/(portal)/_dashboard/data.ts` and `web/src/app/(portal)/students/page.tsx`.
4. **Verify Staging/Production Drive isolation.** Drive folder roots use the same `PencilMaths` name in code. Deployed Google credentials and accounts were not inspected. Confirm separate accounts or roots before real data is stored.

#### P2 — Address in the next engineering cycle

5. **Database invariants are weaker than some application checks.** The earlier audit found teacher writes that can bypass app-only rules for marks, file references and markup JSON. Recheck and enforce persisted invariants in SQL, then cover each rule in the database suite.
6. **Uploads can leave orphaned Drive files or duplicate retries.** Hand-ins upload to Drive before the database records them; a failed record leaves the file behind. Add cleanup on DB failure and verify retry behavior. Make the 20-file limit atomic if concurrent submissions become material.
7. **Large class-note downloads proxy through Next.js.** Measure large-file downloads on Staging and mobile connections; move to authorized short-lived downloads or lower the supported size only if measurement shows a problem.
8. **Release automation is incomplete.** The workflow YAML is under `Automation Testing/setup`, not `.github/workflows`, so GitHub Actions will not run it automatically. Move it to the standard location and verify a real green run. Migrations are still applied manually; start migration tracking before the Production rebuild.
9. **Operational recovery is not verified.** Confirm database backups, perform a restore drill, and choose a recovery plan for Drive files. Production settings and monitoring were not accessible during this audit.
10. **No unit or browser tests were found.** Keep the database suite; add focused tests for high-risk pure logic and critical hand-in/marking flows rather than a broad test framework.

#### P3 — Incremental improvements

- Add baseline security headers and test sandboxing on file proxy routes with the PDF viewer.
- Restrict password reset updates to sessions created through invite/recovery flows.
- Add a root `.gitignore`; commit the pending lesson-plan asset deletions and intended dependency updates.
- Introduce generated Supabase types incrementally to reduce `as unknown as` casts.
- Self-host Geist if offline or network-restricted production builds are a requirement; the current build fetches it from Google Fonts.

### Scores for this audit snapshot

| Area | Score / 10 |
|---|---:|
| Architecture | 8 |
| Code quality | 8 |
| Next.js practices | 8 |
| Database design | 7 |
| Query optimization | 6 |
| Google Drive integration | 8 |
| Security | 6 |
| Performance | 7 |
| Scalability | 6 |
| Reliability | 6 |
| Testing | 7 |
| Maintainability | 8 |

**Overall: 7/10.** The architecture fits the current product and does not need a rewrite. Highest-value work is tightening the public hand-in write boundary, making the test runner safer, bounding high-growth queries, and confirming Production isolation/recovery settings.

### Repeat this audit

Run from the repository root. The database runner drops and recreates the database named by `TEST_DATABASE`; use a fresh, disposable local database name and a local PostgreSQL server only.

```powershell
Set-Location web
npm run lint
npx tsc --noEmit
npm run build
npm audit --omit=dev --audit-level=high
Set-Location ..
$env:TEST_DATABASE = 'pencilmaths_audit_test'
bash 'Automation Testing/run-database-tests.sh'
```

Before interpreting results, check that the workflow is active under `.github/workflows`, that the database suite includes every intended migration and test file, and that Production-only facts (row limits, Google credentials, backups, Vercel region and monitoring) are checked in their respective consoles. Do not put production database credentials in the test runner environment.
