-- Faster database: the same access rules, worked out once per query instead of once per row,
-- plus indexes for the dashboard and a faster Batches list.
-- From the database performance review (Help/18-database-performance-review.md, findings D1-D4).
-- Measured on a local copy of all migrations with a few years' worth of test data:
--   staff dashboard homework list 20.7 s -> 0.02 s, Batches list 24.6 s -> 0.02 s, Students list 31.2 s -> 0.05 s.
-- Who can see and change what does NOT change: a teacher and an admin see exactly the same rows as before,
-- and a teacher can still only add or change homework, results and files in their own batches.
-- No app change is needed. Safe to run twice.
-- Run after 20261105000002_lesson_homework_marks.sql. Run on Staging first; on Production at go-live.

-- 1. Staff and admin checks worked out once per query instead of once per row: (select is_staff()).
--    Rewrites every rule whose check is exactly is_staff() or is_admin(). Running it again changes nothing.
do $$
declare p record; q text; c text;
begin
  for p in select tablename, policyname, cmd, qual, with_check, array_to_string(roles, ', ') as roles from pg_policies
           where schemaname = 'public' and permissive = 'PERMISSIVE'
             and coalesce(qual, 'is_staff()') in ('is_staff()', 'is_admin()')
             and coalesce(with_check, 'is_staff()') in ('is_staff()', 'is_admin()') loop
    execute format('drop policy %I on %I', p.policyname, p.tablename);
    q := case when p.qual is not null then format(' using ((select %s))', p.qual) else '' end;
    c := case when p.with_check is not null then format(' with check ((select %s))', p.with_check) else '' end;
    execute format('create policy %I on %I for %s to %s%s%s', p.policyname, p.tablename, p.cmd, p.roles, q, c);
  end loop;
end $$;

-- 2. Teacher rules as lists worked out once per query (Supabase's recommended pattern), instead of a
--    teaches_...() call on every row. For staff, students and families the lists are simply empty.
create or replace function my_batch_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from batches where closed_on is null and teacher_id = current_teacher_id()
$$;
create or replace function my_student_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct e.student_id from enrolments e
  where e.ended_on is null and e.batch_id in (select my_batch_ids())
$$;
create or replace function my_sheet_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from homework_sheets where batch_id in (select my_batch_ids())
$$;
-- Each homework of the teacher's batches, with each student now in that batch (same as teaches_sheet_student).
create or replace function my_sheet_students() returns table (sheet_id uuid, student_id uuid)
language sql stable security definer set search_path = public as $$
  select h.id, e.student_id from homework_sheets h
  join enrolments e on e.batch_id = h.batch_id and e.ended_on is null
  where h.batch_id in (select my_batch_ids())
$$;
create or replace function my_lesson_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select l.id from lessons l join batches b on b.subject_id = l.subject_id and b.year_group = l.year_group
  where b.closed_on is null and b.teacher_id = current_teacher_id()
$$;
revoke execute on function my_batch_ids(), my_student_ids(), my_sheet_ids(), my_sheet_students(), my_lesson_ids() from public, anon;
grant execute on function my_batch_ids(), my_student_ids(), my_sheet_ids(), my_sheet_students(), my_lesson_ids() to authenticated;

-- The 29 teacher rules from 20261027000004_teacher_login.sql, replaced one for one below.
drop policy if exists teacher_add on attendance;
drop policy if exists teacher_read on attendance;
drop policy if exists teacher_update on attendance;
drop policy if exists teacher_add on batch_lessons;
drop policy if exists teacher_read on batch_lessons;
drop policy if exists teacher_update on batch_lessons;
drop policy if exists teacher_read on batch_slots;
drop policy if exists teacher_read on batch_topics;
drop policy if exists teacher_update on batch_topics;
drop policy if exists teacher_read on batches;
drop policy if exists teacher_add on class_sessions;
drop policy if exists teacher_read on class_sessions;
drop policy if exists teacher_update on class_sessions;
drop policy if exists teacher_read on enrolments;
drop policy if exists teacher_add on file_links;
drop policy if exists teacher_read on file_links;
drop policy if exists teacher_remove on file_links;
drop policy if exists teacher_add on homework_markups;
drop policy if exists teacher_read on homework_markups;
drop policy if exists teacher_update on homework_markups;
drop policy if exists teacher_add on homework_results;
drop policy if exists teacher_read on homework_results;
drop policy if exists teacher_update on homework_results;
drop policy if exists teacher_add on homework_sheets;
drop policy if exists teacher_read on homework_sheets;
drop policy if exists teacher_read on lesson_homework;
drop policy if exists teacher_read on lessons;
drop policy if exists teacher_read on students;
drop policy if exists teacher_read on subjects;
create policy teacher_read on subjects for select to authenticated using ((select current_teacher_id()) is not null);
create policy teacher_read on batches for select to authenticated using (id in (select my_batch_ids()));
create policy teacher_read on batch_slots for select to authenticated using (batch_id in (select my_batch_ids()));
create policy teacher_read on enrolments for select to authenticated using (ended_on is null and batch_id in (select my_batch_ids()));
create policy teacher_read on students for select to authenticated using (id in (select my_student_ids()));
create policy teacher_read on lessons for select to authenticated using (id in (select my_lesson_ids()));
create policy teacher_read on lesson_homework for select to authenticated using (lesson_id in (select my_lesson_ids()));
create policy teacher_read on batch_topics for select to authenticated using (batch_id in (select my_batch_ids()));
create policy teacher_update on batch_topics for update to authenticated using (batch_id in (select my_batch_ids())) with check (batch_id in (select my_batch_ids()));
create policy teacher_read on batch_lessons for select to authenticated using (batch_id in (select my_batch_ids()));
create policy teacher_add on batch_lessons for insert to authenticated with check (batch_id in (select my_batch_ids()));
create policy teacher_update on batch_lessons for update to authenticated using (batch_id in (select my_batch_ids())) with check (batch_id in (select my_batch_ids()));
create policy teacher_read on homework_sheets for select to authenticated using (batch_id in (select my_batch_ids()));
create policy teacher_add on homework_sheets for insert to authenticated with check (batch_id in (select my_batch_ids()));
create policy teacher_read on homework_results for select to authenticated using ((sheet_id, student_id) in (select * from my_sheet_students()));
create policy teacher_add on homework_results for insert to authenticated with check ((sheet_id, student_id) in (select * from my_sheet_students()));
create policy teacher_update on homework_results for update to authenticated
  using ((sheet_id, student_id) in (select * from my_sheet_students())) with check ((sheet_id, student_id) in (select * from my_sheet_students()));
create policy teacher_read on homework_markups for select to authenticated using ((sheet_id, student_id) in (select * from my_sheet_students()));
create policy teacher_add on homework_markups for insert to authenticated with check ((sheet_id, student_id) in (select * from my_sheet_students()));
create policy teacher_update on homework_markups for update to authenticated
  using ((sheet_id, student_id) in (select * from my_sheet_students())) with check ((sheet_id, student_id) in (select * from my_sheet_students()));
create policy teacher_read on file_links for select to authenticated using (
  (owner_type = 'homework_sheet' and owner_id in (select my_sheet_ids()))
  or (owner_type in ('homework_submission', 'homework_correction') and (owner_id, student_id) in (select * from my_sheet_students())));
create policy teacher_add on file_links for insert to authenticated with check (
  (owner_type = 'homework_sheet' and owner_id in (select my_sheet_ids()))
  or (owner_type = 'homework_correction' and (owner_id, student_id) in (select * from my_sheet_students())));
create policy teacher_remove on file_links for delete to authenticated using (
  (owner_type = 'homework_sheet' and owner_id in (select my_sheet_ids()))
  or (owner_type = 'homework_correction' and (owner_id, student_id) in (select * from my_sheet_students())));
create policy teacher_read on class_sessions for select to authenticated using (batch_id in (select my_batch_ids()));
create policy teacher_add on class_sessions for insert to authenticated with check (batch_id in (select my_batch_ids()));
create policy teacher_update on class_sessions for update to authenticated using (batch_id in (select my_batch_ids())) with check (batch_id in (select my_batch_ids()));
-- Attendance has no screen yet: keep the row check, but skip it at once for anyone who isn't a teacher.
create policy teacher_read on attendance for select to authenticated using ((select current_teacher_id()) is not null and
  exists (select 1 from class_sessions cs where cs.id = session_id and teaches_student_in_batch(cs.batch_id, student_id)));
create policy teacher_add on attendance for insert to authenticated with check ((select current_teacher_id()) is not null and
  exists (select 1 from class_sessions cs where cs.id = session_id and teaches_student_in_batch(cs.batch_id, student_id)));
create policy teacher_update on attendance for update to authenticated
  using ((select current_teacher_id()) is not null and exists (select 1 from class_sessions cs where cs.id = session_id and teaches_student_in_batch(cs.batch_id, student_id)))
  with check ((select current_teacher_id()) is not null and exists (select 1 from class_sessions cs where cs.id = session_id and teaches_student_in_batch(cs.batch_id, student_id)));

-- 3. Indexes for the dashboard's homework lists and counts, and for foreign keys that are searched or cascaded.
create index if not exists homework_results_received_idx on homework_results (sheet_id) where status = 'received';
create index if not exists homework_results_pending_idx on homework_results (sheet_id) where status = 'pending';
create index if not exists homework_results_received_on_idx on homework_results (received_on) where received_on is not null;
create index if not exists homework_results_marked_on_idx on homework_results (marked_on) where status = 'marked';
create index if not exists homework_markups_drafts_idx on homework_markups (sheet_id) where draft_file_id is not null;
create index if not exists homework_markups_student_idx on homework_markups (student_id);
create index if not exists guardians_family_idx on guardians (family_id);
create index if not exists enquiry_events_enquiry_idx on enquiry_events (enquiry_id, at desc);
create index if not exists batches_teacher_idx on batches (teacher_id) where closed_on is null;
create index if not exists file_links_student_idx on file_links (student_id) where student_id is not null;

-- 4. Batch list: each count worked out once for all batches and joined, instead of 8 sub-queries per batch.
--    Same columns, same order and same results as the current batch_list (checked row by row).
create or replace view batch_list with (security_invoker = true) as
with members as (
  select e.batch_id, count(*) as member_count,
    string_agg(st.first_name || coalesce(' ' || nullif(left(st.last_name, 1), '') || '.', ''), ', ' order by st.first_name) as members
  from enrolments e join students st on st.id = e.student_id where e.ended_on is null group by e.batch_id),
slots as (
  select batch_id, string_agg((array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[weekday] || ' ' || to_char(start_time, 'HH24:MI'), ', ' order by weekday) as schedule
  from batch_slots group by batch_id),
topics as (
  select batch_id, count(*) filter (where status = 'complete') as topics_done, count(*) as topics_total from batch_topics group by batch_id),
classes as (select batch_id, max(class_date) as last_class_on from class_sessions group by batch_id),
marking as (
  select h.batch_id, count(*) as to_mark from homework_results r join homework_sheets h on h.id = r.sheet_id
  where r.status = 'received' group by h.batch_id)
select b.id, b.code, b.subject_id, sub.name as subject, b.year_group, b.teacher_id,
  t.first_name || ' ' || t.last_name as teacher, b.capacity, b.started_on, b.closed_on,
  coalesce(m.member_count, 0) as member_count, m.members, sl.schedule,
  coalesce(tp.topics_done, 0) as topics_done, coalesce(tp.topics_total, 0) as topics_total,
  c.last_class_on, coalesce(mk.to_mark, 0) as to_mark, b.name, b.created_at, b.updated_at
from batches b
join subjects sub on sub.id = b.subject_id
left join teachers t on t.id = b.teacher_id
left join members m on m.batch_id = b.id
left join slots sl on sl.batch_id = b.id
left join topics tp on tp.batch_id = b.id
left join classes c on c.batch_id = b.id
left join marking mk on mk.batch_id = b.id;

analyze homework_results, homework_markups, guardians, enquiry_events, batches, file_links;
