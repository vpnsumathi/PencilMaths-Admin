-- Marking hand-ins in the browser: the teacher's pen marks, text, ticks and crosses for one student's homework,
-- kept so the marked sheet can be reopened and changed later. The marked PDF itself is the corrected sheet
-- (file_links owner_type 'homework_correction'); this table keeps the drawings behind it.
-- Run after 20261027000002_family_login.sql.

create table if not exists homework_markups (
  sheet_id uuid not null references homework_sheets(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  source_file_id uuid not null,        -- the handed-in file (file_links id) that was marked
  data jsonb not null,                 -- the drawings, as the marking page saves them
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (sheet_id, student_id)
);

alter table homework_markups enable row level security;
drop policy if exists staff_all on homework_markups;
create policy staff_all on homework_markups for all to authenticated using (is_staff()) with check (is_staff());
grant select, insert, update, delete on homework_markups to authenticated;

-- Save & close: a marked sheet that is saved but not sent to the student yet. It waits in the student's
-- Drive Homework folder until someone presses Send on the batch page (or Save & send on the marking page).
alter table homework_markups add column if not exists draft_file_id text;            -- Google Drive file
alter table homework_markups add column if not exists draft_name text;
alter table homework_markups add column if not exists draft_mark numeric(6,2) check (draft_mark >= 0);
alter table homework_markups add column if not exists draft_saved_at timestamptz;
