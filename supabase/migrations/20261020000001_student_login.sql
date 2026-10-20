-- Student login: students sign in and see their own dashboard and homework.
-- Signed-in students are NOT staff, so every table's security rule (is_staff()) still shows them nothing.
-- They reach their own data only through the functions below, which work for the signed-in student alone.
-- Needs 20261011000001_homework_handin.sql (the hand-in functions) to have been run first.

-- 1. Link a student to their login. Removing the login clears the link.
alter table students add column auth_user_id uuid unique references auth.users(id) on delete set null;

-- 2. The student who is signed in, or nothing (staff, unknown logins, and students who have left).
create or replace function current_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from students where auth_user_id = auth.uid() and status <> 'left'
$$;

-- 3. Dashboard: the student's details and their current classes (subject, batch, teacher).
create or replace function my_dashboard() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', s.first_name,
    'last_name', s.last_name,
    'code', s.code,
    'year_group', s.year_group,
    'school', s.school,
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', sub.name,
        'batch_code', b.code,
        'teacher', nullif(concat_ws(' ', t.first_name, t.last_name), '')
      ) order by sub.sort, sub.name)
      from enrolments e
      join subjects sub on sub.id = e.subject_id
      left join batches b on b.id = e.batch_id
      left join teachers t on t.id = e.teacher_id
      where e.student_id = s.id and e.ended_on is null
    ), '[]'::jsonb)
  )
  from students s
  where s.id = current_student_id()
$$;

-- 4. Homework, and handing it in: the same as the WhatsApp link, using the signed-in student's own code.
create or replace function my_homework() returns jsonb
language sql stable security definer set search_path = public as $$
  select handin_page(s.handin_code) -> 'homework' from students s where s.id = current_student_id()
$$;

create or replace function my_handin_target(p_sheet uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select handin_target(s.handin_code, p_sheet) from students s where s.id = current_student_id()
$$;

create or replace function my_handin_record(p_sheet uuid, p_file_id text, p_url text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare code text;
begin
  select handin_code into code from students where id = current_student_id();
  if code is null then raise exception 'Not a student login'; end if;
  perform handin_record(code, p_sheet, p_file_id, p_url, p_label);
end $$;

-- 5. Only signed-in users may call these (they return nothing for anyone who isn't a student).
revoke execute on function current_student_id(), my_dashboard(), my_homework(), my_handin_target(uuid),
  my_handin_record(uuid, text, text, text) from public, anon;
grant execute on function current_student_id(), my_dashboard(), my_homework(), my_handin_target(uuid),
  my_handin_record(uuid, text, text, text) to authenticated;
