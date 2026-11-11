-- Created and last modified dates on the Students, Batches, Teachers and Subjects lists.
--  1. Subjects get the two dates the other tables already have (created_at, updated_at). The database never
--     recorded when the existing subjects were added, so their dates stay empty until they are next changed.
--  2. "Modified" now only moves when something in the record really changes. Pressing Save without changing
--     anything, reordering subjects (which rewrites every subject's place), or running the same bulk import
--     again no longer counts as a change.
--  3. The student, batch and teacher list views include both dates (added at the end of each view).
-- Run after 20261103000001_atomic_saves.sql. Run on Staging first; on Production at go-live.

-- 1. Subjects ---------------------------------------------------------------------------------------------------
alter table subjects add column if not exists created_at timestamptz;
alter table subjects add column if not exists updated_at timestamptz;
-- New subjects from now on get today's date and time (set after adding the columns, so existing ones stay empty).
alter table subjects alter column created_at set default now();
alter table subjects alter column updated_at set default now();

-- 2. Only a real change moves "modified" ------------------------------------------------------------------------
drop trigger if exists subjects_updated on subjects;
create trigger subjects_updated before update on subjects for each row
  when (old.* is distinct from new.*) execute function set_updated_at();
drop trigger if exists students_updated on students;
create trigger students_updated before update on students for each row
  when (old.* is distinct from new.*) execute function set_updated_at();
drop trigger if exists teachers_updated on teachers;
create trigger teachers_updated before update on teachers for each row
  when (old.* is distinct from new.*) execute function set_updated_at();
drop trigger if exists batches_updated on batches;
create trigger batches_updated before update on batches for each row
  when (old.* is distinct from new.*) execute function set_updated_at();

-- 3. List views -------------------------------------------------------------------------------------------------
-- As in 20260928000002_views_and_functions.sql, with created_at and updated_at added at the end.
create or replace view student_list with (security_invoker = true) as
select s.id, s.code, s.first_name, s.last_name, s.year_group, s.school, s.status, s.start_date,
  coalesce(array_agg(e.subject_id order by sub.sort) filter (where e.id is not null), '{}') as subject_ids,
  coalesce(string_agg(sub.name, ', ' order by sub.sort), '') as subjects,
  coalesce(array_agg(distinct e.teacher_id) filter (where e.teacher_id is not null), '{}') as teacher_ids,
  coalesce(string_agg(coalesce(t.first_name || ' ' || t.last_name, 'Not assigned'), ', ' order by sub.sort) filter (where e.id is not null), '') as teachers,
  coalesce(string_agg(coalesce(b.code, '—'), ', ' order by sub.sort) filter (where e.id is not null), '') as batches,
  coalesce(bool_or(e.teacher_id is null) filter (where e.id is not null), false) as missing_teacher,
  coalesce(bool_or(e.batch_id is null) filter (where e.id is not null), false) as missing_batch,
  st.attendance_pct, st.homework_pct,
  s.created_at, s.updated_at
from students s
left join enrolments e on e.student_id = s.id and e.ended_on is null
left join subjects sub on sub.id = e.subject_id
left join teachers t on t.id = e.teacher_id
left join batches b on b.id = e.batch_id
left join student_stats st on st.student_id = s.id
group by s.id, st.attendance_pct, st.homework_pct;

-- As in 20261102000001_bulk_import.sql, with created_at and updated_at added at the end.
create or replace view batch_list with (security_invoker = true) as
select b.id, b.code, b.subject_id, sub.name as subject, b.year_group, b.teacher_id,
  t.first_name || ' ' || t.last_name as teacher, b.capacity, b.started_on, b.closed_on,
  (select count(*) from enrolments e where e.batch_id = b.id and e.ended_on is null) as member_count,
  (select string_agg(st.first_name || coalesce(' ' || nullif(left(st.last_name, 1), '') || '.', ''), ', ' order by st.first_name)
     from enrolments e join students st on st.id = e.student_id where e.batch_id = b.id and e.ended_on is null) as members,
  (select string_agg(case bs.weekday when 1 then 'Mon' when 2 then 'Tue' when 3 then 'Wed' when 4 then 'Thu' when 5 then 'Fri' when 6 then 'Sat' else 'Sun' end
       || ' ' || to_char(bs.start_time, 'HH24:MI'), ', ' order by bs.weekday) from batch_slots bs where bs.batch_id = b.id) as schedule,
  (select count(*) from batch_topics bt where bt.batch_id = b.id and bt.status = 'complete') as topics_done,
  (select count(*) from batch_topics bt where bt.batch_id = b.id) as topics_total,
  (select max(cs.class_date) from class_sessions cs where cs.batch_id = b.id) as last_class_on,
  (select count(*) from homework_results r join homework_sheets h on h.id = r.sheet_id where h.batch_id = b.id and r.status = 'received') as to_mark,
  b.name,
  b.created_at, b.updated_at
from batches b
join subjects sub on sub.id = b.subject_id
left join teachers t on t.id = b.teacher_id;

-- As in 20260928000004_student_functions.sql, with created_at and updated_at added at the end.
create or replace view teacher_list with (security_invoker = true) as
select t.id, t.code, t.first_name, t.last_name, t.personal_email, t.phone, t.subject_id, sub.name as subject,
  t.year_min, t.year_max, t.status, t.joined_on,
  (select count(*) from batches b where b.teacher_id = t.id and b.closed_on is null) as batch_count,
  (select count(distinct e.student_id) from enrolments e join students s on s.id = e.student_id
    where e.teacher_id = t.id and e.ended_on is null and s.status <> 'left') as student_count,
  t.created_at, t.updated_at
from teachers t left join subjects sub on sub.id = t.subject_id;
