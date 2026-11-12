# Automation Testing

Automated checks that the app still works as intended. Run them before every go-live (Staging to Production).
The full guide is [Help/20-automation-testing.md](../Help/20-automation-testing.md).

| What | Where |
|---|---|
| Runner: builds a fresh test database from every migration, then runs all the checks | `run-database-tests.sh` |
| The checks, one file per area | `database/*.test.sql` |
| Test data used by every check (fixed people, batches, homework) | `database/fixtures.sql` |
| Check functions (`tests.eq`, `tests.throws` …) and signing in as a test person (`tests.as`) | `database/helpers.sql` |
| Supabase's basics, so the migrations run on a plain Postgres | `database/supabase-stub.sql` |
| The automatic run on GitHub. Copy it to `.github/workflows/` once (Help/20, section 5) | `setup/automation-tests.yml` |

**How to run them:** push to `staging` (they run by themselves), or open GitHub › **Actions** › **Automation tests** › **Run workflow**.
A green tick means every check passed. They never touch Staging or Production.

**Areas covered:** staff access, teacher access, student and family logins, the WhatsApp hand-in link, batches (places,
class-time clashes, closing), homework (Set homework, Mark completed, marking), saving students, Bulk import, GCSE - H / GCSE - F year groups,
and whole-database safety rules. The app job also runs the type check, lint and build.
