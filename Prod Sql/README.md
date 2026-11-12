# Prod Sql: a new Production database in 4 steps

These scripts build a **new, empty Production database** in one go. They replace running the 29 files in `supabase/migrations` one by one.

| Step | File | What it does |
|---|---|---|
| 1 | `01_schema.sql` | Everything the app needs: 28 tables, 4 views, 65 functions, 21 triggers, 78 indexes, 62 row-level security rules and all permissions. No data. |
| 2 | `02_seed.sql` | The starting data: 4 subjects and 54 curriculum topics (the same as `supabase/seed.sql`). |
| 3 | `03_first_admin.sql` | Makes your own login an admin. Change the name and email in it first. |
| 4 | `04_check.sql` | A read-only check. Every row must say **yes**. |

Built on 12 November 2026 from the 29 migration scripts up to `20261111000003_handin_server_only.sql`.

## How to run them

1. Supabase › open the **Production** project. Check the project name at the top left.
2. **SQL Editor › New query.**
3. Open `01_schema.sql` in VS Code, select all (Ctrl+A), copy, paste into the SQL Editor, **Run**. It should say "Success. No rows returned".
4. New query again for `02_seed.sql`, then `03_first_admin.sql` (after creating your login, see the top of that file), then `04_check.sql`.

Run each file **once**, in order.

## What is better than running the 29 scripts

- **One file instead of 29.** Every table, function, view and rule appears once, in its final form. Functions that were replaced 3 or 4 times over the weeks are written once.
- **Nothing Staging-only.** No deletes (the GCSE script's Year 11–13 delete), no "list old clashes / full batches" queries.
- **All-or-nothing.** Step 1 runs inside one transaction: if anything fails, nothing is kept and you can run it again after the fix.
- **The same database.** Checked on 12 Nov 2026: a database built from these files is identical to one built from the 29 scripts (same tables, columns, functions, views, rules, triggers, indexes and permissions), and all 455 automated database checks pass on it. It was also tried as a normal (non-superuser) owner like Supabase's, and on a project where new tables get no rights by default: the permissions came out the same both times.

To re-check on your computer: `PROD_SQL=yes bash "Automation Testing/run-database-tests.sh"` (guide 20).

## Never run on Production

- `supabase/dummy_data.sql`, `supabase/clear_dummy_data.sql`, `supabase/clear_all_people_data.sql`.
- The migration files up to `20261111000003`: they are already inside `01_schema.sql`.
- `supabase/migrations/AI/` (the question bank): not included. It stays on its own branch until you decide.

## After Production is set up

Any new file in `supabase/migrations` dated **after** `20261111000003` is run on Production on its own, just before merging into `main` (guide 13, section 4).

If migration files change **before** you set up Production, ask Claude to rebuild this folder first, so it matches.

## If something goes wrong

| What you see | What to do |
|---|---|
| An error in step 1 | Nothing was kept. Copy the error message to Claude. |
| `The citext extension is already switched on in schema "extensions"` | Supabase › Database › Extensions › switch **citext** off, then run step 1 again. |
| `type "attendance_source" already exists` | Step 1 has already run on this project. Go on to step 2. |
| Step 3 shows no row | The email doesn't match the login. Check Authentication › Users, fix the email in the file, run it again. |
| Step 4 says **NO** on a row | Stop and send the result to Claude before going further. |
| The SQL Editor says the query is too large | Ask Claude to split `01_schema.sql` into smaller parts. |
