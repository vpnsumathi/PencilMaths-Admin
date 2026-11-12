# PencilMaths Admin: architecture review

**First written:** 3 November 2026 (read-only review). **Last updated:** 3 November 2026, evening, after the fixes made the same day.
**Scope:** `web/` (Next.js 15.5 App Router, React 19, TypeScript), `supabase/` (19 migrations, scripts), and the Help guides, as they stand in the folder today. That includes the uncommitted bulk import and login logo work.
**Method:** I read every `.ts`/`.tsx` file under `web/src` (115 files), every migration, `package.json` and the config files, and the guides `01`, `10` and `13`. I ran no code and changed no files.
**Not read:** `web/src/app/(student)/me/homework/file/[id]/route.ts`. It is nested too deep for the folder tool to copy. It mirrors `(portal)/files/[id]/route.ts`, which I did read.

**About line numbers:** the file and line references below are from the original review. Several files have changed since, so treat line numbers as a rough guide and search for the function name instead.

---

## Progress since the review

| Status | Findings |
|---|---|
| ✅ **Done** | F3 atomic saves, F4 error and not-found pages (plus loading placeholders), F5 and F18 `/auth/callback` removed, F7 access checks on every action, F10 Drive folder ids saved plus one retry, F15 shared login code, F19 Tailwind removed |
| 🟡 **Partly done** | F2 (the attendance part of the dashboard is gone; homework and student list still read every row), F16 (`homework_correction` added to the delete clean-up; no database trigger yet), F9 (database tests and GitHub checks done on 6 Nov, guide 20; unit tests still to do) |
| ⏳ **Waiting for your decision** | F14 (curriculum topics or the Lesson library) |
| ⬜ **Not started** | F1 separate Drive for Staging, F6 migration tracking, F8 generated types, F21 monitoring, F11, F12, F13, F17, F20, F22, F23, F24, repository hygiene (§15) |

Everything marked done is in the folder for **Staging** only and is not committed yet. Three new database scripts must also run on Production at go-live, in this order: `20261103000001_atomic_saves.sql` (F3), `20261103000002_created_modified_dates.sql` (a feature, not a finding) and `20261103000003_drive_folder_ids.sql` (F10). Guide 13 has the full list.

Changes made the same day that were not review findings: a Created / modified column on the four lists, and faster pages from the [page speed review](19-page-speed-review.md) (one login check per request, loading placeholders, batch page queries side by side, a lighter dashboard). See the change log in guide 01.

---

## How to read this report

Each finding gives the file, what the code does now, why that matters, what to do instead, the benefit and the cost, and a priority.

| Priority | Meaning |
|---|---|
| **P1** | Fix before more real data goes into Production, or before the next go-live. It is a real risk to data or correctness. |
| **P2** | Fix in the next few weeks. A genuine weakness that will hurt as usage grows. |
| **P3** | Fix when you next work in that area. It is a maintainability problem, not urgent. |
| **P4** | Optional. Mostly tidiness or a preference. I label it as a preference where that is the case. |

Every recommendation keeps the current design (Next.js with Server Actions, Supabase with RLS, Google Drive for files). Nothing here needs a rewrite, a new service layer, a repository pattern or new infrastructure.

---

## Executive summary

For a medium-sized app run by one developer, the architecture is **sound and mostly well judged**. The strongest choice is to put the security in the database. Row-level security, `security_invoker` views, `SECURITY DEFINER` functions that always pin `search_path`, and column grants that hide date of birth and hand-in codes mean that a bug in a page cannot leak another family's data. The code is server-first. Client components sit only at the leaves where interaction needs them. There is almost no client state and very few dependencies.

The main risks are not in the code's shape. They are in **operations and in data correctness at larger sizes**:

1. Staging and Production write to the **same Google Drive folder**, and both databases number students from `PM-1001`. A staging test student can therefore be given a real child's Drive folder (F1). **Still open, and still the top risk.**
2. Supabase returns **at most 1,000 rows per query** by default. Several dashboard and list queries pull every row and count them in JavaScript, so the numbers will quietly go wrong as data grows (F2). **Partly done:** the attendance queries are gone.
3. Several multi-step saves are **not atomic**. A failure halfway leaves half-saved data, and some of those failures are only logged (F3). **Done.**
4. **Migrations are run by hand** in the SQL Editor and tracked in prose. Ten scripts are now waiting for Production (F6). **Still open.**
5. There are **no error pages, no generated database types, no automated tests and no CI** (F4, F8, F9). **Error pages done; database tests and CI done (6 Nov, guide 20);** types and unit tests still open.

None of these needs a redesign. Each one is a small, contained change.

---

## Findings by area

### 1. Next.js App Router architecture

**Overall:** good. Route groups separate the three audiences cleanly: `(portal)` for staff and teachers, `(student)` for students and families, and `h/[code]` for the public hand-in link. Layouts guard each group (`(portal)/layout.tsx`, `(student)/layout.tsx`). Private folders such as `_dashboard` keep page helpers next to the page that uses them. Dynamic segments take `params` and `searchParams` as Promises, which is correct for Next 15.

#### F4. No error, loading or not-found boundaries — P1
> ✅ **Done (3 Nov).** `app/error.tsx`, `global-error.tsx`, `not-found.tsx`, `error.tsx` in `(portal)` and `(student)`, `(portal)/not-found.tsx`, and `loading.tsx` skeletons in `(portal)` and `(student)` (`components/ProblemPage.tsx`, `components/Skeleton.tsx`).

- **Files:** none exist. There is no `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` anywhere under `web/src/app`.
- **Now:** `loadDashboard` (`_dashboard/data.ts:83-85`) throws on any query error. Pages call `notFound()`, which shows Next's default 404.
- **Problem:** if Supabase or Drive has a problem, staff see Next's generic "Application error" screen with no way back. Families on `/h/<code>` or `/me` see the same. There is also no loading feedback on slow pages such as the dashboard, which runs about 10 queries.
- **Do instead:** add `app/global-error.tsx`, plus an `error.tsx` in `(portal)` and in `(student)`. Each should show a friendly message, a "Try again" button (`reset()`) and a link home. Add a `not-found.tsx` styled like the app. Optionally add `(portal)/loading.tsx` with a simple skeleton.
- **Benefit:** failures stay contained to one section and users can recover. **Cost:** about four small files.

#### F18. Three auth landing routes, only one in use — P2
> ✅ **Done (3 Nov).** `/auth/callback` is now a stub that redirects to `/login`; delete its folder. `/auth/confirm` says at the top that it is kept for custom SMTP.

- **Files:** `app/auth/callback/route.ts` (PKCE `?code=`), `app/auth/confirm/route.ts` (`token_hash`), `app/auth/accept/page.tsx` (implicit `#access_token`).
- **Now:** invites and password resets all land on `/auth/accept`. `confirm` is kept "for custom SMTP later". `callback` looks like an early leftover.
- **Problem:** three ways into a session is three places to keep secure. `callback` does not check its `next` parameter (see F5).
- **Do instead:** delete `callback` if nothing links to it. Keep `confirm` only with a comment saying when it becomes live.
- **Benefit:** a smaller attack surface and less to understand.

#### F5. `auth/callback` builds its redirect from an unchecked `next` — P2
> ✅ **Done (3 Nov)** by removing the route (F18).

- **File:** `app/auth/callback/route.ts:8` — `NextResponse.redirect(`${origin}${next}`)`.
- **Problem:** a value such as `next=@evil.example` produces `https://yoursite@evil.example`, which browsers treat as a link to `evil.example`. This is hard to exploit, because the redirect only happens after a valid code exchange in the victim's own browser. Still, `auth/confirm/route.ts:13` already has the right check (`/^\/(?!\/)/`).
- **Do instead:** delete the route (F18), or reuse the same check.

### 2. Server Components and Client Components

**Overall: a strength.** There are 21 client components, all leaves: forms with pending state, pickers, the marking canvas, the nav shell and the charts' hover. Pages, layouts and data loading are all Server Components. Heavy libraries load only when needed: `pdf-lib` is dynamically imported in `makePdf.ts:42`, and `pdfjs-dist` in `Marker.tsx`. The secret-key client and the Drive module are fenced with `import 'server-only'`.

There are no problems to fix here. Two small notes:
- `components/AppShell.tsx` is a client component that renders the whole sidebar. That is fine at this size. Only `usePathname` and the mobile toggle need the client. If the menu grows, the static link list could be server-rendered with only the toggle on the client. **P4, preference.**
- `Marker.tsx` is about 500 lines of client code. That is justified, because it is an interactive drawing tool. Keeping the pure drawing and PDF code in `marks.ts`, as it is now, is the right split.

### 3. Server Actions and Route Handlers

**Overall:** the pattern is consistent. Forms post `FormData` to `'use server'` actions, the action validates, writes, calls `revalidatePath`, and redirects with `?ok=` or `?error=`. Interactive flows (hand-in, marking, import) return typed results (`{ ok: true } | { ok: false; error }`) instead. Both route handlers (`(portal)/files/[id]` and `(student)/me/homework/file/[id]`) stream Drive files through the server, so Drive links never have to be public. That is a good design.

#### F3. Multi-step writes are not atomic — P1
> ✅ **Done (3 Nov).** `save_batch`, `set_homework`, `complete_topic` and `complete_lesson` RPCs in `20261103000001_atomic_saves.sql`. Creating a login then linking it still cannot be one transaction; the clean-up on failure now lives in `lib/logins.ts` (`discardNewLogin`).

- **Files and code:**
  - `batches/actions.ts:170-191` `insertHomework`: inserts the homework, then inserts one result per student. If the second insert fails, the error is only logged (`:188`). The homework then exists, but nobody has it, and staff are told it was set "for N students".
  - `batches/actions.ts:98-118` `updateBatch`: updates the batch, then the enrolments' teacher, then **deletes every class time and inserts the new ones** as separate requests. If the insert fails, the batch is left with no times at all.
  - `batches/actions.ts:375-395` `completeLesson`: loops Hw-1 to Hw-3, each as several writes, then marks the lesson complete.
  - `students/actions.ts:131-185` `givePortalAccess` and the teacher equivalent: create the auth user, then link it, and delete the user if linking fails. That compensation is good, but a failure in the delete is not handled.
- **Why it matters:** each Supabase call from the app is its own transaction. A network blip or a rule refusal halfway leaves data that the UI never expects.
- **Do instead:** use the pattern you already use for `save_student` and `bulk_import`. Move "set homework for a batch", "save batch with times" and "complete lesson" into Postgres functions (`set_homework(batch, fields)`, `save_batch(p jsonb)`, `complete_lesson(...)`) and call them with `supabase.rpc`. Keep Drive uploads outside the function: upload first, then call the RPC with the file ids. Leave the auth-user flow as it is, because it cannot be transactional across Supabase Auth.
- **Benefit:** all or nothing, and fewer round trips. **Cost:** three functions, roughly 40–80 lines of SQL each. Some logic moves from TypeScript to SQL, which you are already comfortable maintaining.

#### F7. Who may call an action is not stated consistently — P2
> ✅ **Done (3 Nov).** `requireStaffOrTeacher()` in `lib/auth.ts` is called by every homework, marking and lesson action (alongside the first read, so no slower). `requireAdmin` reuses `getViewer`, and Settings › Staff actions use `requireAdmin`. Writes that the database may refuse now check that a row was really changed.

- **Files:** `students/`, `enquiries/` and `teachers/` actions call `requireStaff()` or `requireAdmin()`. The homework, lesson and marking actions in `batches/actions.ts` and `batches/[id]/mark/actions.ts` (`createHomework`, `completeTopic`, `markHomework`, `startMarkedUpload`…) call no guard and rely entirely on RLS. This is deliberate, because teachers may use them. `settings/staff/actions.ts:9-15` only checks that someone is signed in.
- **Why it matters:** RLS is the real guard and it is solid, so this is **not a hole today**. But the intent cannot be seen in the code. A future action that does a Drive call before its first RLS-checked read would let an anonymous caller trigger Drive work. Server Actions are public HTTP endpoints.
- **Do instead:** add one helper, `requirePortalUser()` (staff or teacher, built on the cached `getViewer()`), and call it on the first line of every portal action that does not already call `requireStaff` or `requireAdmin`. Make `requireAdmin` reuse `getViewer()` instead of running its own `staff` query (`lib/auth.ts:34-43`).
- **Benefit:** every action states its audience in one line, and anonymous calls fail before any side effect. **Cost:** a few lines per file.

#### F12. Messages travel in the address (`?ok=` / `?error=`) — P4, mostly preference
> ⬜ Not started.

- **Files:** `lib/form.ts:13-15`, `components/Alerts.tsx`.
- **Trade-off:** this is simple, works without JavaScript and survives redirects, which makes it a sensible choice. The downsides are that the message shows again on refresh or Back, and that anyone can craft a link that shows any green or red sentence on your admin site. React escapes the text, so this is cosmetic, not a script injection.
- **Do instead:** keep it. `settings/staff/actions.ts` and `reset-password/actions.ts` build these URLs by hand without encoding. Switch them to `redirectWith` for consistency. Moving to a short-lived flash cookie later is optional.

#### F24. Marking drawings are saved from the browser without checks — P3
> ⬜ Not started.

- **File:** `batches/[id]/mark/actions.ts:69,120` — `drawings: unknown` is written straight to `homework_markups.data`.
- **Do instead:** check the shape before saving: `v === 1`, `marks` is an array, and a sensible maximum length (for example, 20,000 marks). Reject anything else.
- **Benefit:** a bad or hostile request cannot store a 5 MB blob or a structure that breaks the marker when it is reopened.

### 4. Separation of presentation, business logic and data access

**Overall:** pragmatic and appropriate. Pages query Supabase directly, actions hold the validation and the writes, `lib/` holds shared domain helpers (`homework/`, `import/`, `lessons/`, `google/`), and the heaviest rules live in SQL. For this size, **do not add a repository or service layer**. Supabase's query builder already is the data-access layer.

#### F17. Some business rules live in two places, or only in the app — P3
> ⬜ Not started. (The batch save is now one RPC, `save_batch`, but closing a batch is still checked in the app.)

- **Examples:**
  - `batches/actions.ts:107-108` updates enrolments' teacher by hand, while the comment says the enrolment trigger copies it from the batch. One of the two is redundant, or the trigger only covers inserts.
  - "A batch can only close when it is empty" (`batches/actions.ts:133-138`) is checked in the app with a count and then an update, so two people acting at once can get past it. Capacity, by contrast, is enforced by a trigger (`20261027000001_batch_capacity.sql`).
  - `deleteHomework` removes `file_links` by hand because there is no foreign key (see F16).
- **Do instead:** when a rule protects data integrity, put it in the database (a trigger or a check inside an RPC). Keep the app check only for a friendly early message.
- **Benefit:** one source of truth that holds for every route in, including bulk import and the SQL Editor.

### 5. Feature and module organisation

**Overall:** good. Folders follow features (`batches`, `students`, `enquiries`, `lesson-library`, `settings/import`), and each feature keeps its page, form, actions and CSS module together.

#### F13. `batches/actions.ts` has grown into four features — P3
> ⬜ Not started (the file is now 557 lines).

- **File:** `app/(portal)/batches/actions.ts`, 562 lines: batches, curriculum topics, lesson planner, homework set, give, mark and delete, and corrected sheets.
- **Do instead:** split it by concern in the same folder, without changing behaviour: `actions.ts` (batch create, update, close), `homework-actions.ts`, `lesson-actions.ts`. Optionally move the homework UI (`HomeworkSection`, `MarkButtons`, `CorrectionPicker`, `GivePastHomework`) into `batches/homework/`.
- **Benefit:** easier to find code, smaller diffs and fewer merge clashes. **Cost:** import path changes only.

#### F14. Two lesson-plan systems run side by side — P3 (a product decision)
> ⏳ **Waiting for your decision.**

- **Files:** curriculum topics (`batch_topics`, `CompleteTopic.tsx`, `setTopicStatus`, `completeTopic`) and the Lesson library (`batch_lessons`, `LessonPlanner.tsx`, `CompleteLesson.tsx`, `setLessonStatus`, `completeLesson`). The batch page picks one at run time (`batches/[id]/page.tsx:56-59`). `homework_sheets` carries both `topic_id` and `lesson_homework_id`.
- **Why it matters:** this is the **largest piece of avoidable complexity** in the app. Every homework feature has to handle both origins, and both paths need testing.
- **Do instead:** decide on the target. If the Lesson library will cover every subject and year, freeze the topics path (no new features), migrate batches as their year gets a library, and then remove it. If topics are meant to stay as a fallback for subjects without a library, write that down in guide 14 so the duplication is deliberate.
- **Benefit:** about half the lesson-plan code eventually goes. **Cost:** it needs a decision about teaching content first.

### 6. Component design and reusability

**Overall:** fit for purpose. Shared building blocks (`Field`, `Alerts`, `FocusMessage`, `ConfirmButton`, `StatusBadge`, `icons`) plus one design-token stylesheet (`globals.css`) and `ui.module.css` are about the right amount for this app. Forms are shared between create and edit (`StudentForm`, `TeacherForm`, `BatchForm`, `EnquiryForm`).

#### F15. Student and teacher login code is duplicated — P3
> ✅ **Done (3 Nov).** `web/src/lib/logins.ts` has `inviteOrFindLogin`, `resendInvite`, `deleteLogin` and `discardNewLogin`; Students and Teachers both use it.

- **Files:** `students/actions.ts:114-240` and `teachers/actions.ts:293-406`. "Invite, or link an existing login", "resend invite" and "remove login unless shared" are written twice, with small differences.
- **Do instead:** move the Supabase Auth parts into `lib/logins.ts`: `inviteOrFind(email, meta)`, `resendInvite(userId)` and `deleteLoginIfUnused(userId)`. Keep the student- and teacher-specific linking in each action.
- **Benefit:** a fix to the invite flow lands once. **Cost:** a small refactor. Do it when you next touch logins, for example when the audit log is added.

#### Inline styles — P4, preference
There are 67 `style={{…}}` attributes. They are harmless. Move them into the page's CSS module when you are already editing that page.

### 7. State management

**A strength.** There is no global store. The server is the source of truth, and pages are re-rendered with `revalidatePath`. Client state is local (`useState`, `useActionState`, `useTransition`), and the marking page keeps an unsent draft in `localStorage`, guarded by `try/catch`. Do not add Redux, Zustand or React Query. Nothing here needs them.

### 8. API and integration architecture (Google Drive)

**Overall:** a thin, readable client (`lib/google/drive.ts`) with no SDK. It caches the token between requests, uses resumable browser uploads for big marked PDFs, and the server then checks that the uploaded file really sits in the student's folder (`corrections.ts:48-54`). Using Drive as the file store is an accepted product decision, and this review does not reopen it.

#### F1. Staging and Production share one Drive folder, and student codes overlap — P1
> ⬜ **Not started. Still the top risk.** Do this before importing the real spreadsheet into Staging. Note: since F10, Staging and Production also each save their own folder ids, which does not change this risk; the shared Drive account is the problem.

- **Files:** `lib/google/drive.ts:63` (`findOrCreateFolder('PencilMaths')`), `lib/homework/sheets.ts:27`, `lesson-library/actions.ts:79`, and `20260928000001_schema.sql:95` (`student_code_seq start 1001` in both databases). Guide 13 §1 and §9 confirm that both sites use the same `GOOGLE_*` values and the same `PencilMaths` folder.
- **Why it matters:** student folders are found **by name**: `PencilMaths/Students/<code> <first> <last>`. Both databases hand out `PM-1001`, `PM-1002`… in order. If the same spreadsheet is bulk-imported into Staging for testing and into Production for real, which is the plan in guide 16, the two will produce **identical folder names**. `findOrCreateFolder` will then return the real child's folder to Staging, and test hand-ins and corrected sheets will land in a real family's Drive folder. Even without a name clash, test data is mixed in with real data.
- **Do instead (best first):**
  1. Give Staging its **own Google account or OAuth refresh token**, so it cannot see Production's folders at all (the `drive.file` scope only shows files the token created).
  2. At minimum, add the planned `DRIVE_ROOT_FOLDER` setting (`PencilMaths Staging` on Staging), read it in one place, and use it in all three files above. Today the root name is written in three files.
  3. Optionally start Staging's `student_code_seq` at a different number (for example 9001) so codes never match.
- **Benefit:** removes the one realistic way for test activity to touch a real family's files. **Cost:** one environment variable plus a small code change (option 2), or a new Google OAuth client (option 1).
- **Timing:** before any real spreadsheet is imported into either environment.

#### F10. Folders are looked up by name on every upload — P2
> ✅ **Done (3 Nov).** Folder ids are saved in a server-only table `drive_folders` (`20261103000003_drive_folder_ids.sql`, `lib/google/folderIds.ts`). Two uploads at once no longer make two folders. `drive.ts` retries once on 429, and on 5xx for reads and changes. A folder that has gone is forgotten and found again. The folder names are still written in several files (§12).

- **Files:** `lib/homework/handin.ts:46`, `lib/homework/sheets.ts:27-28`, `lib/homework/corrections.ts:24`, `lesson-library/actions.ts:79-81`.
- **Now:** each upload runs 1–3 Drive "list" calls in sequence to find `PencilMaths`, then `Homework sheets` or `Homework library/<subject year>`, or the student's `Homework` folder, before the upload itself.
- **Problems:** (a) extra latency and Drive quota on every hand-in; (b) two uploads that arrive at the same moment for a student with no `Homework` folder can each create one, giving duplicate folders; (c) renaming a folder in Drive breaks the lookup and silently creates a new one; (d) there is no retry on Drive's `429` or `5xx` responses.
- **Do instead:** store folder ids once they are known. Root ids can go in a small `settings` table or in env vars. The student's Homework folder id can sit next to the student folder in `file_links` (for example `owner_type = 'student_homework_folder'`). Fall back to find-or-create only when an id is missing. Add one retry with a short back-off in `drive()`.
- **Benefit:** faster uploads and no duplicate folders. **Cost:** small.

#### F22. Public endpoints have no rate limit — P4
> ⬜ Not started.

`h/[code]/actions.ts` and `lib/homework/convert.ts` run Drive uploads and conversions for unauthenticated callers. They are protected by a 128-bit code and a cap of 20 files per homework, which is adequate for now. If abuse ever appears, add a per-code limit, for example a counter row or Vercel's firewall rules.

### 9. Supabase integration

**A strength, with two operational gaps.**

What is done well:
- RLS on every table. Policies are generated in one place (`20260928000003_security.sql`), with teacher policies layered on through `teaches_*()` helpers.
- All 40 `SECURITY DEFINER` functions set `search_path`. Views use `security_invoker = true`, so RLS still applies through them.
- Column-level grants hide `date_of_birth` and `handin_code`, and `student_private()` returns them to staff only.
- Complex writes are single RPCs (`save_student`, `bulk_import`, `import_lessons`), and `bulk_import` has a dry-run mode that uses the same code path.
- The secret-key client (`lib/supabase/admin.ts`) is `server-only` and used only for Auth admin calls and one documented teacher case.
- `getClaims()` (since 3 Nov; it checks the login token's signature on the server) or `getUser()`, never `getSession()`, is used to decide access.

#### F2. Queries that pull all rows hit Supabase's 1,000-row limit — P1
> 🟡 **Partly done (3 Nov).** The dashboard no longer reads attendance or `student_list` (it reads `students` with their open enrolments). Still at risk: the dashboard's Homework panel reads every received and pending result, and the Students list reads the whole `student_list`. Check *Max rows* in both projects.

- **Files:**
  - `_dashboard/data.ts:58-82`: `student_list`, `attendance` over up to 90 days, `homework_results` since the start of the range, and all `enquiries`, all fetched in full and counted in JavaScript.
  - `_dashboard/homework.ts:57-72`: all `received` and all `pending` results across all time, and all open enrolments.
  - `students/page.tsx:22`: the whole `student_list`.
- **Why it matters:** Supabase's API returns **at most 1,000 rows per request** unless you change *Max rows* in its API settings, and it does so **without an error**. A rough example: 150 students with 2 classes a week gives about 3,900 attendance rows in 90 days. The dashboard would count only the first 1,000 and show wrong percentages with no warning. Pending homework results grow by about one row per student per homework.
- **Do instead:**
  1. For the dashboard, move the counting into one or two SQL functions (`dashboard_summary(p_from, p_to)`) that return the finished numbers and chart rows. RLS still applies if they are `security invoker`, so teachers still see only their own figures.
  2. For lists, add `.range()` pagination or a search box. At minimum, request `count: 'exact'` and show a warning if the count is above the rows returned.
  3. Short term: check *Max rows* in both Supabase projects.
- **Benefit:** correct numbers at any size, and a faster dashboard, since less data crosses the network. **Cost:** one SQL function, plus moving the arithmetic out of `data.ts`.

#### F6. Migrations are applied by hand and tracked in prose — P1
> ⬜ Not started. Production is now 10 scripts behind Staging (guide 13 lists them in order).

- **Files:** `supabase/migrations/*.sql` and guide 13 §4 ("Keep a note of which scripts Production has had").
- **Now:** each script is pasted into the SQL Editor of each project. Production is 7 scripts behind Staging (`20261023000001` to `20261102000001`). Functions such as `my_dashboard` and `my_homework` are redefined in up to 4 migrations, so the current version of a function can only be found by reading the latest file that mentions it.
- **Why it matters:** at go-live, one missed or out-of-order script breaks Production, and nothing records which scripts have run.
- **Do instead (pick one):**
  - **Recommended:** use the Supabase CLI. `supabase link --project-ref …` for each project, then `supabase db push`. It records applied migrations in `supabase_migrations.schema_migrations` and only runs new ones. Your file names already match its format.
  - **Minimal:** end every script with `insert into public.applied_migrations(name) values ('20261102000001_bulk_import');` and run `select * from applied_migrations order by name;` before and after each go-live.
  - Either way, commit a schema snapshot (`supabase db dump --schema-only > supabase/schema.sql`) after each release, so the current definition of every function can be read in one place.
- **Benefit:** go-live becomes one command or one checklist, with proof of what ran. **Cost:** a one-off setup of about an hour.

#### F16. `file_links` has no foreign keys, so rows are left behind — P2
> 🟡 **Partly done (3 Nov).** `deleteHomework` now deletes the homework first and then all its file rows, including `homework_correction`. The database trigger is not added yet.

- **Files:** `20260928000001_schema.sql:287-300` (`owner_type`/`owner_id`) and `batches/actions.ts:515`.
- **Now:** `deleteHomework` removes `homework_submission` and `homework_sheet` links but **not `homework_correction`** links, so corrected-sheet rows outlive their homework.
- **Do instead:** add `'homework_correction'` to that delete now. Better, add a trigger on `homework_sheets` delete (and on `students` delete) that removes the matching `file_links` rows, so every route is covered.
- **Benefit:** no orphan rows. **Cost:** one line now, or about 10 lines of SQL.

#### F23. RLS helpers are called once per row — P4
> ⬜ Not started.

Policies call `is_staff()` and `teaches_*()` directly. Supabase recommends writing `(select is_staff())` so Postgres works it out once per query. This makes no difference at today's size. Apply it the next time the policies are edited.

### 10. TypeScript architecture and type safety

`strict: true` is on, the `@/*` alias is used throughout, discriminated unions are used for results (`HandInResult`, `Step<T>`, `ConvertResult`), and `Mark` is a well-typed union.

#### F8. No generated database types — P2
> ⬜ Not started (11 `as unknown as` casts remain).

- **Evidence:** 14 `as unknown as` casts across 9 files (for example `batches/[id]/page.tsx:74-76`, `_dashboard/data.ts:113`, `lesson-library/actions.ts:74`). Every `.from()` result is effectively untyped, and RPC results are typed by hand (`Dashboard`, `ImportReport`, `Homework`).
- **Why it matters:** renaming or removing a column in a migration does not show up in the build. It shows up as a blank field or a runtime error on Staging, if someone happens to look.
- **Do instead:** run `npx supabase gen types typescript --project-id <staging> > web/src/lib/supabase/database.types.ts` and pass `<Database>` to `createServerClient` and `createClient` in `lib/supabase/server.ts`, `admin.ts` and `middleware.ts`. The casts on joined rows can then go. Keep the hand-written types for `jsonb` RPC results, but put them next to their SQL function.
- **Benefit:** schema drift is caught by `tsc`. **Cost:** one command after each migration (add an npm script, `npm run db:types`).

### 11. Dependency management

**A strength:** only 8 runtime dependencies, all mainstream, with Next pinned to an exact version and React at a fixed minor.

#### F19. Unused Tailwind toolchain — P4
> ✅ **Done (3 Nov).** Both packages removed; delete `web/postcss.config.mjs` and run `npm install`. `web/README.md` still has the default text.

`tailwindcss` and `@tailwindcss/postcss` are installed and `postcss.config.mjs` loads the plugin, but `globals.css` never imports Tailwind and the app uses CSS Modules. Remove both packages and the PostCSS config, which is less to upgrade. Also replace the default `create-next-app` text in `web/README.md` with a pointer to `Help/`.

#### F11. Hand-written XLSX, ZIP and CSV readers — P3
> ⬜ Not started.

- **File:** `lib/lessons/xlsx.ts` (zip and XML by regex), `lib/import/rows.ts:27-47` (CSV).
- **Trade-off:** no dependency, small, and good enough for the known spreadsheets. It is admin-only, so the risk is low. Weaknesses: no ZIP64 support; `inflateRawSync` has no output limit (a "zip bomb" could exhaust server memory); dates and formatted numbers come back as raw values; regex XML parsing can break on unusual files.
- **Do instead:** keep it, but add `inflateRawSync(data, { maxOutputLength: 50 * 1024 * 1024 })` and unit tests with your real sample files (F9). Switch to a maintained reader only if real files start failing.

### 12. Coupling and cohesion

The modules hold together well. One feature is one folder, and `lib/homework/*` is shared by the hand-in link, the student portal and marking.

The points of tighter coupling are:
- **The Drive folder layout is spread across five files** (⬜ still true) as string literals (`'PencilMaths'`, `'Students'`, `'Homework'`, `'Homework sheets'`, `'Homework library'`). Put the layout in `lib/google/folders.ts` (it ties in with F1 and F10).
- **`lib/homework/convert.ts` is a `'use server'` file inside `lib/`.** That works, but it is the only action outside `app/`, which makes it easy to miss when reviewing public endpoints. Move it next to `HandInForm` (`app/h/[code]/`) or leave a comment in `lib/homework/handin.ts`. **P4.**
- **`corrections.ts` calls `isTeacher()`** to decide whether to use the secret-key client. That puts the viewer's identity inside a homework helper. Passing it in as a parameter from the action would make the helper easier to test. **P4, preference.**

### 13. Error handling

The approach is consistent: user-facing messages are kind and specific, raw database errors are logged and replaced with friendly text, and `P0001` messages raised on purpose are passed through. `unstable_rethrow` is used correctly around `redirect` inside `try` blocks.

Gaps:
- **F4:** there are no error boundaries (see §1).
- **F21. No error monitoring — P2.** ⬜ Not started. There are 80 `console.error` calls. Vercel keeps function logs only for a short time, and nobody is alerted. Before more families use Production, add Sentry's Next.js SDK (free tier) or a Vercel log drain, so you hear about failures before families do. Tag each event with `staging` or `production`.
- **Silent partial failures:** see F3. ✅ Fixed by the RPCs on 3 Nov.
- **Generic 1,000-row truncation:** see F2. This is a correctness failure that produces no error at all.

### 14. Maintainability and extensibility

The comments are excellent. They explain *why*, in plain English, and the Help guides are unusually thorough for a project this size. Naming is clear and the code reads easily.

#### F9. No automated tests or CI — P2
> 🟡 **Partly done (6 Nov).** Item 2 is done and goes further than planned: 272 database checks run on a fresh database built from every migration, not on Staging. Item 3 is done too: a GitHub Action runs the database tests, `tsc`, lint and build on every push to `staging` ([guide 20](20-automation-testing.md)). Item 1 (Vitest unit tests) is still to do.

- **Now:** testing is manual (guide 10). Every change is checked by clicking through Staging.
- **Do instead (small and targeted, not a full test pyramid):**
  1. **Vitest unit tests** for the pure functions that are easy to get wrong: `lib/import/rows.ts` (headings, CSV quoting), `lib/lessons/plan.ts`, `lib/lessons/xlsx.ts` (with the real sample `.xlsx` files), `nextClass()` in `me/dashboard.ts`, `markAt` and `shapeLines` in `marks.ts`, and `cleanName`. Roughly 20–30 tests.
  2. **RLS checks** as a SQL script, or pgTAP, run against Staging. Sign in as a teacher, a student and anonymous, and check what each can see in `students`, `homework_results` and `file_links`. RLS carries the whole security model, so this is the most valuable test you can have.
  3. **A GitHub Action** on pushes to `staging`: `npm ci`, `tsc --noEmit`, `npm run lint`, `vitest run`, `next build`.
- **Benefit:** refactors such as F3 and F13 become safe, and the go-live checklist gets shorter. **Cost:** about a day to set up, then minutes per feature.

#### F20. No code formatter — P4
> ⬜ Not started.

`students/actions.ts:65-74` and `login/actions.ts:296-299` have broken indentation. Add Prettier with format-on-save in VS Code.

### 15. Other engineering practices

- **Repository hygiene — P2.** Project memory records the GitHub repo as **public**. The code holds no secrets (`.env*` is ignored), but the Help guides describe internals, URLs and processes in detail. Make the repo private unless there is a reason for it to be public. Also check that `tmp/`, `output/` and `Lesson Planner/` at the top of the folder are not committed, or add a root `.gitignore`.
- **Uncommitted work.** Bulk import, the login logo and all of the 3 Nov fixes are only in the folder. Commit them to `staging` once tested, so the folder is not the only copy.
- **Environment config.** `NEXT_PUBLIC_*` and `GOOGLE_*` values are read with `!` in several places (`middleware.ts:12-13`, `drive.ts:20-22`). Add a tiny `lib/env.ts` that checks the required variables once at start-up and fails with a clear message. **P4.**
- **Timezone handling** is consistently `Europe/London`, with date-only values handled as UTC. That is good.
- **Accessibility** has had real attention: focus moves to messages, `aria-current` is set, and reduced motion is respected. That is good.

---

## A. Overall architecture assessment

**Rating: solid, with operational gaps. About 7 out of 10 for production readiness, and 8.5 out of 10 for the code's design** (original review).

**After the 3 Nov fixes (once they reach Production): about 7.5 out of 10 for production readiness and 9 out of 10 for design.** Atomic saves, error pages, access checks and the simpler code are in. What holds the readiness score back is the same list as before: the shared Drive (F1), hand-run migrations (F6), and no types, tests or monitoring (F8, F9, F21).

The shape suits the job: a server-rendered Next.js app with Server Actions, a database that enforces access itself, and a thin Drive client. It is about as simple as an app with three audiences and file handling can be. The remaining risks are about **environments, scale limits, atomicity and the safety net** (types, tests, monitoring, migrations), not about structure. All of them can be fixed in place.

## B. Architectural strengths

1. **Security lives in the database.** RLS on every table, `security_invoker` views, `search_path` pinned on every definer function, column grants for sensitive fields, and teacher scoping through `teaches_*()` helpers. A page bug cannot leak data.
2. **Server-first rendering.** Client components only where interaction needs them, and heavy libraries are loaded lazily.
3. **Transactional RPCs for complex writes** (`save_student`, `bulk_import` with a real dry run), with on-purpose `P0001` messages shown to users.
4. **A careful file pipeline.** PDFs are built in the browser to stay under Vercel's 4.5 MB limit, marked sheets are uploaded straight to Drive and then checked on the server, and files are streamed through the server so Drive links stay private.
5. **Minimal state and dependencies.** There is no store and no ORM, and very few packages.
6. **Clear feature folders and excellent documentation.**
7. **`server-only` fences** around the secret key and the Drive credentials.

## C. Architectural weaknesses

1. Staging and Production share Google Drive, and student codes overlap (F1). ⬜
2. Dashboards and lists count rows in JavaScript, capped at 1,000 (F2). 🟡
3. ~~Several multi-step saves are not atomic (F3).~~ ✅
4. Migrations are manual and untracked (F6). ⬜
5. No monitoring, no automated tests, no generated types (F21, F9, F8). ⬜ ~~No error boundaries (F4).~~ ✅
6. ~~Authorization intent is not stated consistently in actions (F7).~~ ✅
7. ~~Drive folders are found by name on every upload (F10)~~ ✅, and `file_links` rows can be left behind without a trigger (F16). 🟡

## D. Unnecessary complexity

Ordered by how much it costs you:

1. **Two lesson-plan systems** (curriculum topics and the Lesson library) with two sets of components and actions, and two homework origins (F14). ⏳ Waiting for your decision.
2. ~~**Three auth landing routes** when one is used (F18).~~ ✅ Two now (`accept` in use, `confirm` kept for custom SMTP).
3. ~~**Find-or-create folders by name on every upload** instead of stored ids (F10).~~ ✅ Ids are saved.
4. **The hand-run migration process**, which is process complexity rather than code complexity (F6). ⬜
5. ~~**An unused Tailwind toolchain** (F19).~~ ✅
6. ~~**Duplicated invite and remove-login flows** for students and teachers (F15).~~ ✅

The app does **not** suffer from over-engineering: there are no unnecessary layers, abstractions or patterns. The hand-written XLSX reader is a deliberate no-dependency choice, and I would keep it with the safeguards in F11.

## E. Recommended architectural improvements

In one line each:
- Separate Drive for Staging, or at least a separate root folder (F1).
- Do dashboard counting in SQL, and paginate lists (F2).
- Put "set homework", "save batch" and "complete lesson" into RPCs (F3).
- Add `error.tsx`, `global-error.tsx` and `not-found.tsx` (F4).
- Track migrations with the Supabase CLI or an applied-migrations table, and commit a schema snapshot (F6).
- Add a `requirePortalUser()` guard on every portal action (F7).
- Generate Supabase types (F8).
- Add a few unit tests, RLS checks and a CI build (F9).
- Store Drive folder ids, and retry once on Drive errors (F10).
- Clean up `file_links` with a trigger (F16).
- Add Sentry or a log drain (F21).
- Remove unused auth routes (F5, F18).
- Decide the future of curriculum topics against the Lesson library (F14).
- Split `batches/actions.ts` (F13), and share the login code (F15).

## F. Prioritised improvement roadmap

### Phase 0: before the next Production release or any real-data import (about 1–2 days)
| # | Item | Finding | Effort | Status |
|---|---|---|---|---|
| 1 | Separate Drive for Staging (own refresh token), or a `DRIVE_ROOT_FOLDER` setting used in all three places | F1 | 1–3 h | ⬜ |
| 2 | Check *Max rows* in both Supabase projects. Add `count: 'exact'` warnings to the dashboard and student list as a stop-gap | F2 | 1 h | ⬜ |
| 3 | Set up migration tracking (Supabase CLI, or an `applied_migrations` table) before running the pending scripts on Production (10 as of 3 Nov) | F6 | 1–2 h | ⬜ |
| 4 | Add `error.tsx` in `(portal)` and `(student)`, plus `global-error.tsx` and `not-found.tsx` | F4 | 1 h | ✅ |
| 5 | Delete `auth/callback`, or add the `next` check | F5, F18 | 15 min | ✅ |
| 6 | Add `homework_correction` to the `deleteHomework` clean-up | F16 | 5 min | ✅ |

### Phase 1: the next 2–4 weeks
| # | Item | Finding | Effort | Status |
|---|---|---|---|---|
| 7 | `set_homework`, `save_batch` and `complete_lesson` RPCs | F3 | 1 day | ✅ |
| 8 | Dashboard summary SQL function, and student list pagination | F2 | 0.5–1 day | 🟡 attendance removed |
| 9 | Generated Supabase types, and removal of the `as unknown as` casts | F8 | 2–3 h | ⬜ |
| 10 | CI workflow (typecheck, lint, build) plus Vitest for the parsers | F9 | 0.5 day | ⬜ |
| 11 | RLS visibility test script (teacher, student, anonymous) | F9 | 2–3 h | ⬜ |
| 12 | Sentry or a log drain, tagged by environment | F21 | 1 h | ⬜ |
| 13 | `requirePortalUser()` on every portal action, and `requireAdmin` reusing `getViewer` | F7 | 1 h | ✅ |
| 14 | Make the GitHub repo private, and add a root `.gitignore` | §15 | 15 min | ⬜ |

### Phase 2: when you next work in each area
| # | Item | Finding | Status |
|---|---|---|---|
| 15 | Store Drive folder ids, add one retry, and centralise the folder layout | F10, §12 | ✅ ids and retry (layout ⬜) |
| 16 | Move integrity rules into the database (closing a batch, teacher copy) | F17 | ⬜ |
| 17 | Validate the shape of marking drawings | F24 | ⬜ |
| 18 | Split `batches/actions.ts` | F13 | ⬜ |
| 19 | Shared `lib/logins.ts` (good timing: alongside the audit log on the roadmap) | F15 | ✅ |
| 20 | Decide on curriculum topics against the Lesson library, and document or retire one | F14 | ⏳ your decision |

### Phase 3: optional tidying
~~Remove Tailwind (F19)~~ ✅; add an output cap and tests to the XLSX reader (F11); add Prettier (F20); add `lib/env.ts`; write RLS helpers as `(select …)` (F23); add rate limits on public endpoints (F22); move inline styles into CSS modules; use `redirectWith` everywhere (F12).

---

*The original review was read-only. The progress notes were added on 3 Nov 2026 after the fixes listed above. Suggested next steps: F1 (separate Drive for Staging) before any real import, then F6 (migration tracking) before go-live, then F8 → F21 → F9 (types, monitoring, tests).*
