#!/usr/bin/env bash
# PencilMaths Admin: automated database tests.
#
# Builds a brand-new, empty test database from every script in supabase/migrations and supabase/migrations/AI
# (in date order, plus supabase/seed.sql),
# then runs each database/*.test.sql file against it. Each test file starts from the same test data
# (database/fixtures.sql) and everything it changes is thrown away afterwards.
#
# It never touches Staging or Production: it only uses the Postgres server it is pointed at.
#
#   Run:    bash "Automation Testing/run-database-tests.sh"
#   Needs:  psql, createdb and dropdb (PostgreSQL 15 or later), and a Postgres server it may create a database on.
#           Point it at the server with the usual PGHOST, PGPORT, PGUSER and PGPASSWORD settings.
#   Result: one line per check; the last line says how many passed. Exit code 0 = all passed, 1 = something failed.
#
# GitHub runs this automatically (.github/workflows/automation-tests.yml). See Help/20-automation-testing.md.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DB="${TEST_DATABASE:-pencilmaths_test}"
ONLY="${1:-}"                      # optional: run only test files whose name contains this text, e.g. "teacher"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

red=$'\e[31m'; green=$'\e[32m'; bold=$'\e[1m'; plain=$'\e[0m'
[ -t 1 ] || { red=''; green=''; bold=''; plain=''; }

fail_setup() { echo "${red}${bold}Could not build the test database:${plain} $1"; echo "$2" | tail -20; exit 1; }

# Safety: only ever a local or GitHub test server, never a Supabase project.
case "${PGHOST:-localhost}" in
  *supabase*) echo "${red}PGHOST points at Supabase (${PGHOST}). These tests must run on an empty test server, never on Staging or Production.${plain}"; exit 1 ;;
esac

# 1. A fresh, empty database.
dropdb --if-exists "$DB" >/dev/null 2>&1
createdb "$DB" || { echo "${red}Could not create the test database \"$DB\". Is Postgres running, and are PGHOST/PGUSER set?${plain}"; exit 1; }

# 2. Supabase's basics, every migration in order, the starting data, then the test helpers.
out=$("${PSQL[@]}" < "$HERE/database/supabase-stub.sql" 2>&1) || fail_setup "supabase-stub.sql" "$out"
# Migrations in supabase/migrations and its AI/ folder, together in date order (by file name).
migrations=()
while IFS=$'\t' read -r _ path; do migrations+=("$path"); done < <(
  for f in "$ROOT"/supabase/migrations/*.sql "$ROOT"/supabase/migrations/AI/*.sql; do
    [ -e "$f" ] && printf '%s\t%s\n' "$(basename "$f")" "$f"
  done | sort)
count=0
for f in "${migrations[@]}"; do
  out=$("${PSQL[@]}" < "$f" 2>&1) || fail_setup "$(basename "$f")" "$out"
  count=$((count + 1))
done
out=$("${PSQL[@]}" < "$ROOT/supabase/seed.sql" 2>&1) || fail_setup "seed.sql" "$out"
out=$("${PSQL[@]}" < "$HERE/database/helpers.sql" 2>&1) || fail_setup "helpers.sql" "$out"
echo "${bold}Test database built from $count migration scripts.${plain}"
echo

{ echo "## Database tests"; echo; echo "Built from $count migration scripts."; echo; echo "| Test file | Passed | Failed |"; echo "|---|---|---|"; } >> "$SUMMARY"

# 3. Each test file, in its own transaction that is rolled back at the end.
total_pass=0; total_fail=0; failed_files=()
for f in "$HERE"/database/*.test.sql; do
  name="$(basename "$f" .test.sql)"
  [ -n "$ONLY" ] && [[ "$name" != *"$ONLY"* ]] && continue
  out=$( { echo "begin;"; cat "$HERE/database/fixtures.sql"; cat "$f"; echo; echo "select tests.as_owner();"; \
           echo "select line from tests.report() as line;"; echo "rollback;"; } \
         | psql -X -q -At -v ON_ERROR_STOP=1 -d "$DB" 2>&1 )
  status=$?
  pass=$(grep -c '^PASS|' <<< "$out")
  fail=$(grep -c '^FAIL|' <<< "$out")
  echo "${bold}$name${plain}"
  while IFS='|' read -r result check detail; do
    case "$result" in
      PASS) echo "  ${green}✔${plain} $check" ;;
      FAIL) echo "  ${red}✘ $check${plain}"; echo "      ${red}$detail${plain}" ;;
    esac
  done <<< "$out"
  if [ $status -ne 0 ]; then
    # The file stopped part-way with an error that no check expected.
    echo "  ${red}✘ The test file stopped with an unexpected error:${plain}"
    grep -v '^PASS|\|^FAIL|' <<< "$out" | grep -v '^$' | tail -5 | sed 's/^/      /'
    fail=$((fail + 1))
  fi
  total_pass=$((total_pass + pass)); total_fail=$((total_fail + fail))
  [ "$fail" -gt 0 ] && failed_files+=("$name")
  echo "| $name | $pass | $fail |" >> "$SUMMARY"
  echo
done

if [ "$total_fail" -eq 0 ]; then
  echo "${green}${bold}All $total_pass checks passed.${plain}"
  { echo; echo "**All $total_pass checks passed.**"; } >> "$SUMMARY"
  dropdb --if-exists "$DB" >/dev/null 2>&1
  exit 0
else
  echo "${red}${bold}$total_fail failed, $total_pass passed.${plain} Failed in: ${failed_files[*]}"
  { echo; echo "**$total_fail failed**, $total_pass passed."; } >> "$SUMMARY"
  exit 1
fi
