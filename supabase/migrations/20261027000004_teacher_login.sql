-- Teacher login: a teacher signs in and sees only their own batches, the students in them, and that
-- homework. Teachers are NOT staff, so every existing rule (is_staff()) still shows them nothing; the
-- teacher rules below are added next to the staff rules (Supabase allows a row if any rule allows it).
-- The link: teachers.auth_user_id → batches.teacher_id → current enrolments → students.
-- Teachers get no rule at all on families, guardians, enquiries, staff, teachers, student notes or
-- student Drive folders, so those always come back empty for them.
-- Run after 20261027000003_homework_marking.sql.

-- 1. Removing a teacher's login clears the link (like students), instead of being refused.
alter table teachers drop constraint if exists teachers_auth_user_id_fkey;
alter table teachers add constraint teachers_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete set null;

-- 2. One login is never both a teacher and a student/family login (staff + teacher is fine: staff view wins).
create or replace function login_kind_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.auth_user_id is null then return new; end if;
  if tg_table_name = 'teachers' and exists (select 1 from students where auth_user_id = new.auth_user_id) then
    raise exception 'That email is a student or family login. Use a different email for the teacher.';
  end if;
  if tg_table_name = 'students' and exists (select 1 from teachers where auth_user_id = new.auth_user_id) then
    raise exception 'That email is a teacher login. Use a different email for the student.';
  end if;
  return new;
end $$;
drop trigger if exists teachers_login_kind on teachers;
create trigger teachers_login_kind before insert or update of auth_user_id on teachers
  for each row execute function login_kind_check();
drop trigger if exists students_login_kind on students;
create trigger students_login_kind before insert or update of auth_user_id on students
  for each row execute function login_kind_check();

-- 3. Who is signed in, and what they teach. Security definer, so the rules below don't loop through each other.
-- A teacher marked Left gets nothing, even with a working password.
create or replace function current_teacher_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from teachers where auth_user_id = auth.uid() and status <> 'left'
$$;

-- For the app: the signed-in teacher's name (the teachers table itself stays hidden from teachers).
create or replace function current_teacher() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'first_name', first_name, 'last_name', last_name, 'subject_id', subject_id)
  from teachers where id = current_teacher_id()
$$;

-- An open batch this teacher teaches. Closed batches drop out of the teacher's view.
create or replace function teaches_batch(p_batch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from batches where id = p_batch and closed_on is null and teacher_id = current_teacher_id())
$$;

-- A student currently in one of this teacher's open batches.
create or replace function teaches_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrolments e join batches b on b.id = e.batch_id
    where e.student_id = p_student and e.ended_on is null and b.closed_on is null and b.teacher_id = current_teacher_id())
$$;

-- A student currently in this particular batch, which this teacher teaches.
create or replace function teaches_student_in_batch(p_batch uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select teaches_batch(p_batch) and exists (
    select 1 from enrolments where batch_id = p_batch and student_id = p_student and ended_on is null)
$$;

-- A homework set in one of this teacher's batches (with a student: that student's copy of it).
create or replace function teaches_sheet(p_sheet uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from homework_sheets where id = p_sheet and teaches_batch(batch_id))
$$;

create or replace function teaches_sheet_student(p_sheet uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from homework_sheets where id = p_sheet and teaches_student_in_batch(batch_id, p_student))
$$;

-- A Lesson library lesson for the subject and year of one of this teacher's open batches.
create or replace function teaches_lesson(p_lesson uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lessons l join batches b on b.subject_id = l.subject_id and b.year_group = l.year_group
    where l.id = p_lesson and b.closed_on is null and b.teacher_id = current_teacher_id())
$$;

revoke execute on function current_teacher_id(), current_teacher(), teaches_batch(uuid), teaches_student(uuid),
  teaches_student_in_batch(uuid, uuid), teaches_sheet(uuid), teaches_sheet_student(uuid, uuid), teaches_lesson(uuid)
  from public, anon;
grant execute on function current_teacher_id(), current_teacher(), teaches_batch(uuid), teaches_student(uuid),
  teaches_student_in_batch(uuid, uuid), teaches_sheet(uuid), teaches_sheet_student(uuid, uuid), teaches_lesson(uuid)
  to authenticated;

-- 4. Teacher rules. Each one is named teacher_<what it allows>, so they're easy to find and drop.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and policyname like 'teacher\_%' loop
    execute format('drop policy %I on %I', p.policyname, p.tablename);
  end loop;
end $$;

-- Reference data and the class itself: read only.
create policy teacher_read on subjects for select to authenticated using (current_teacher_id() is not null);
create policy teacher_read on batches for select to authenticated using (teaches_batch(id));
create policy teacher_read on batch_slots for select to authenticated using (teaches_batch(batch_id));
create policy teacher_read on enrolments for select to authenticated using (ended_on is null and teaches_batch(batch_id));
create policy teacher_read on students for select to authenticated using (teaches_student(id));
create policy teacher_read on lessons for select to authenticated using (teaches_lesson(id));
create policy teacher_read on lesson_homework for select to authenticated using (teaches_lesson(lesson_id));

-- Lesson plan progress: Start, Undo and Complete for topics and lessons.
create policy teacher_read on batch_topics for select to authenticated using (teaches_batch(batch_id));
create policy teacher_update on batch_topics for update to authenticated using (teaches_batch(batch_id)) with check (teaches_batch(batch_id));
create policy teacher_read on batch_lessons for select to authenticated using (teaches_batch(batch_id));
create policy teacher_add on batch_lessons for insert to authenticated with check (teaches_batch(batch_id));
create policy teacher_update on batch_lessons for update to authenticated using (teaches_batch(batch_id)) with check (teaches_batch(batch_id));

-- Homework: set it, give it, mark it (no deleting: that stays with staff).
create policy teacher_read on homework_sheets for select to authenticated using (teaches_batch(batch_id));
create policy teacher_add on homework_sheets for insert to authenticated with check (teaches_batch(batch_id));
create policy teacher_read on homework_results for select to authenticated using (teaches_sheet_student(sheet_id, student_id));
create policy teacher_add on homework_results for insert to authenticated with check (teaches_sheet_student(sheet_id, student_id));
create policy teacher_update on homework_results for update to authenticated
  using (teaches_sheet_student(sheet_id, student_id)) with check (teaches_sheet_student(sheet_id, student_id));
create policy teacher_read on homework_markups for select to authenticated using (teaches_sheet_student(sheet_id, student_id));
create policy teacher_add on homework_markups for insert to authenticated with check (teaches_sheet_student(sheet_id, student_id));
create policy teacher_update on homework_markups for update to authenticated
  using (teaches_sheet_student(sheet_id, student_id)) with check (teaches_sheet_student(sheet_id, student_id));

-- Files: homework worksheets, hand-ins and corrected sheets only. Never the student's Drive folder.
create policy teacher_read on file_links for select to authenticated using (
  (owner_type = 'homework_sheet' and teaches_sheet(owner_id))
  or (owner_type in ('homework_submission', 'homework_correction') and teaches_sheet_student(owner_id, student_id)));
create policy teacher_add on file_links for insert to authenticated with check (
  (owner_type = 'homework_sheet' and teaches_sheet(owner_id))
  or (owner_type = 'homework_correction' and teaches_sheet_student(owner_id, student_id)));
create policy teacher_remove on file_links for delete to authenticated using (
  (owner_type = 'homework_sheet' and teaches_sheet(owner_id))
  or (owner_type = 'homework_correction' and teaches_sheet_student(owner_id, student_id)));

-- Classes and attendance (ready for class updates; no screen for them yet).
create policy teacher_read on class_sessions for select to authenticated using (teaches_batch(batch_id));
create policy teacher_add on class_sessions for insert to authenticated with check (teaches_batch(batch_id));
create policy teacher_update on class_sessions for update to authenticated using (teaches_batch(batch_id)) with check (teaches_batch(batch_id));
create policy teacher_read on attendance for select to authenticated using (
  exists (select 1 from class_sessions cs where cs.id = session_id and teaches_student_in_batch(cs.batch_id, student_id)));
create policy teacher_add on attendance for insert to authenticated with check (
  exists (select 1 from class_sessions cs where cs.id = session_id and teaches_student_in_batch(cs.batch_id, student_id)));
create policy teacher_update on attendance for update to authenticated
  using (exists (select 1 from class_sessions cs where cs.id = session_id and teaches_student_in_batch(cs.batch_id, student_id)))
  with check (exists (select 1 from class_sessions cs where cs.id = session_id and teaches_student_in_batch(cs.batch_id, student_id)));

-- 5. Two student columns are never read directly by anyone signed in: date of birth, and the secret
-- hand-in code (the WhatsApp link works like a password). Rules work per row, so this is done per column.
-- Staff read them through student_private() below. A NEW column on students must be added to this list,
-- or nobody can read it.
revoke select on students from anon, authenticated;
grant select (id, code, family_id, first_name, last_name, year_group, school, status, start_date, left_on,
  created_by, created_at, updated_at, auth_user_id) on students to authenticated;

create or replace function student_private(p_student uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('date_of_birth', date_of_birth, 'handin_code', handin_code)
  from students where id = p_student and is_staff()
$$;
revoke execute on function student_private(uuid) from public, anon;
grant execute on function student_private(uuid) to authenticated;

-- 6. The student's Drive folder id, for putting corrected sheets in their Homework folder.
-- Staff, or the student's teacher. Nothing if they have no Drive folder yet.
create or replace function student_drive_folder(p_student uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_staff() or teaches_student(p_student)) then raise exception 'Not allowed'; end if;
  return (select external_id from file_links
          where student_id = p_student and owner_type = 'student_folder' and provider = 'google_drive');
end $$;
revoke execute on function student_drive_folder(uuid) from public, anon;
grant execute on function student_drive_folder(uuid) to authenticated;

-- 7. Batch list: a teacher can't read the teachers table, so join it with "left join"
-- (the teacher column is empty in a teacher's own view). Otherwise the same as before.
create or replace view batch_list with (security_invoker = true) as
select b.id, b.code, b.subject_id, sub.name as subject, b.year_group, b.teacher_id,
  t.first_name || ' ' || t.last_name as teacher, b.capacity, b.started_on, b.closed_on,
  (select count(*) from enrolments e where e.batch_id = b.id and e.ended_on is null) as member_count,
  (select string_agg(st.first_name || ' ' || left(st.last_name, 1) || '.', ', ' order by st.first_name)
     from enrolments e join students st on st.id = e.student_id where e.batch_id = b.id and e.ended_on is null) as members,
  (select string_agg(case bs.weekday when 1 then 'Mon' when 2 then 'Tue' when 3 then 'Wed' when 4 then 'Thu' when 5 then 'Fri' when 6 then 'Sat' else 'Sun' end
       || ' ' || to_char(bs.start_time, 'HH24:MI'), ', ' order by bs.weekday) from batch_slots bs where bs.batch_id = b.id) as schedule,
  (select count(*) from batch_topics bt where bt.batch_id = b.id and bt.status = 'complete') as topics_done,
  (select count(*) from batch_topics bt where bt.batch_id = b.id) as topics_total,
  (select max(cs.class_date) from class_sessions cs where cs.batch_id = b.id) as last_class_on,
  (select count(*) from homework_results r join homework_sheets h on h.id = r.sheet_id where h.batch_id = b.id and r.status = 'received') as to_mark
from batches b
join subjects sub on sub.id = b.subject_id
left join teachers t on t.id = b.teacher_id;
