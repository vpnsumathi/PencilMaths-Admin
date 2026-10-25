-- Lesson planner: a library of lessons per subject and year (term, module, lesson, three homework sheets),
-- each class's progress through it, and the teacher's corrected sheets for students.
-- Imported from a "Term Lesson Plan - Year N" spreadsheet on the Lesson library page.
-- Run after 20261023000001_homework_for_new_students.sql.

-- 1. The library. Lesson codes look like Y5-T1L1; homework codes like Y5-A001.
create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references subjects(id),
  year_group smallint not null check (year_group between 1 and 13),
  term smallint not null check (term between 1 and 3),
  module text not null,
  code text not null unique,
  name text not null,
  position smallint not null,          -- order within the term, as in the spreadsheet
  created_at timestamptz not null default now()
);
create index if not exists lessons_plan_idx on lessons(subject_id, year_group, term, position);

-- Hw-1, Hw-2 and Hw-3 of a lesson. The worksheet is uploaded to Google Drive through the app.
create table if not exists lesson_homework (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  code text not null unique,
  drive_file_id text,
  url text,
  file_name text,
  uploaded_at timestamptz,
  unique (lesson_id, slot)
);

-- 2. Each class's progress. No row yet means Not started.
create table if not exists batch_lessons (
  batch_id uuid not null references batches(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  status topic_status not null default 'not_started',
  started_on date,
  completed_on date,
  primary key (batch_id, lesson_id)
);

-- 3. Homework sent from a lesson remembers which sheet it was, so a class never gets the same sheet twice.
alter table homework_sheets add column if not exists lesson_homework_id uuid references lesson_homework(id) on delete set null;
create unique index if not exists homework_sheets_one_per_lesson_sheet
  on homework_sheets(batch_id, lesson_homework_id) where lesson_homework_id is not null;

-- 4. A new kind of file: the teacher's corrected sheet for one student (owner_id = the homework id).
alter table file_links drop constraint if exists file_links_owner_type_check;
alter table file_links add constraint file_links_owner_type_check
  check (owner_type in ('student_folder', 'homework_submission', 'homework_sheet', 'homework_correction', 'assessment'));

-- 5. Security: all staff read the library, only admins change it. Class progress is for all staff.
alter table lessons enable row level security;
alter table lesson_homework enable row level security;
alter table batch_lessons enable row level security;
drop policy if exists staff_read on lessons;
drop policy if exists admin_write on lessons;
drop policy if exists staff_read on lesson_homework;
drop policy if exists admin_write on lesson_homework;
drop policy if exists staff_all on batch_lessons;
create policy staff_read on lessons for select to authenticated using (is_staff());
create policy admin_write on lessons for all to authenticated using (is_admin()) with check (is_admin());
create policy staff_read on lesson_homework for select to authenticated using (is_staff());
create policy admin_write on lesson_homework for all to authenticated using (is_admin()) with check (is_admin());
create policy staff_all on batch_lessons for all to authenticated using (is_staff()) with check (is_staff());
-- Signed-in users may try; the rules above decide (Supabase usually grants this by itself).
grant select, insert, update, delete on lessons, lesson_homework, batch_lessons to authenticated;

-- 6. Import (or re-import) one year's plan in one go.
-- p_lessons = [{ term, module, code, name, position, homework: [code1, code2, code3] }]
-- Updates lessons by code and adds new ones; never deletes. A homework slot whose code changes loses its file.
create or replace function import_lessons(p_subject text, p_year smallint, p_lessons jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  l jsonb;
  lid uuid;
  i int;
  hw text;
  added int := 0;
  updated int := 0;
  sheets int := 0;
begin
  if not is_admin() then raise exception 'Not allowed'; end if;
  for l in select * from jsonb_array_elements(p_lessons) loop
    if exists (select 1 from lessons where code = l->>'code') then updated := updated + 1; else added := added + 1; end if;
    insert into lessons (subject_id, year_group, term, module, code, name, position)
    values (p_subject, p_year, (l->>'term')::smallint, l->>'module', l->>'code', l->>'name', (l->>'position')::smallint)
    on conflict (code) do update
      set subject_id = excluded.subject_id, year_group = excluded.year_group, term = excluded.term,
          module = excluded.module, name = excluded.name, position = excluded.position
    returning id into lid;

    for i in 1..3 loop
      hw := nullif(trim(l->'homework'->>(i - 1)), '');
      continue when hw is null;
      sheets := sheets + 1;
      insert into lesson_homework (lesson_id, slot, code) values (lid, i, hw)
      on conflict (lesson_id, slot) do update
        set code = excluded.code,
            drive_file_id = case when lesson_homework.code = excluded.code then lesson_homework.drive_file_id end,
            url = case when lesson_homework.code = excluded.code then lesson_homework.url end,
            file_name = case when lesson_homework.code = excluded.code then lesson_homework.file_name end,
            uploaded_at = case when lesson_homework.code = excluded.code then lesson_homework.uploaded_at end;
    end loop;
  end loop;
  return jsonb_build_object('added', added, 'updated', updated, 'sheets', sheets);
end $$;
grant execute on function import_lessons(text, smallint, jsonb) to authenticated;

-- 7. Students: My homework also lists the teacher's corrected sheets as "corrected" (id and name).
-- Same as 20261020000006 otherwise.
create or replace function my_homework() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(h || jsonb_build_object(
           'sheets', coalesce((
             select jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label) order by f.created_at)
             from file_links f
             where f.owner_type = 'homework_sheet' and f.owner_id = (h ->> 'sheet_id')::uuid
           ), '[]'::jsonb),
           'handed', coalesce((
             select jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label) order by f.created_at)
             from file_links f
             where f.owner_type = 'homework_submission' and f.owner_id = (h ->> 'sheet_id')::uuid and f.student_id = s.id
           ), '[]'::jsonb),
           'corrected', coalesce((
             select jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label) order by f.created_at)
             from file_links f
             where f.owner_type = 'homework_correction' and f.owner_id = (h ->> 'sheet_id')::uuid and f.student_id = s.id
           ), '[]'::jsonb)
         ) order by n), '[]'::jsonb)
  from students s
  cross join lateral jsonb_array_elements(handin_page(s.handin_code) -> 'homework') with ordinality as e(h, n)
  where s.id = current_student_id()
$$;

-- 8. Students can open their own corrected sheets too. Same as 20261023000001 otherwise.
create or replace function my_homework_file(p_file uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('provider', f.provider, 'external_id', f.external_id, 'url', f.url, 'label', f.label)
  from file_links f
  where f.id = p_file
    and (
      (f.owner_type = 'homework_sheet' and exists (
         select 1 from homework_sheets h
         join enrolments e on e.batch_id = h.batch_id and e.ended_on is null
         join homework_results r on r.sheet_id = h.id and r.student_id = e.student_id
         where h.id = f.owner_id and e.student_id = current_student_id()))
      or (f.owner_type in ('homework_submission', 'homework_correction') and f.student_id = current_student_id())
    )
$$;

revoke execute on function my_homework(), my_homework_file(uuid) from public, anon;
grant execute on function my_homework(), my_homework_file(uuid) to authenticated;
