-- Family login: one email and password can open several students (brothers and sisters).
-- The parent picks which child they're looking at; every my_... function follows that pick.
-- Run after 20261027000001_batch_capacity.sql.

-- 1. One login may now be linked to several students.
alter table students drop constraint if exists students_auth_user_id_key;
create index if not exists students_auth_user_idx on students(auth_user_id) where auth_user_id is not null;

-- 2. The child each login last picked. Only reached through the functions below.
create table if not exists login_current_student (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table login_current_student enable row level security;
-- No policies: nobody reads or writes it directly.

-- 3. The student who is signed in: the child picked last, if it's still theirs and hasn't left;
-- otherwise their first child by name. Nothing for staff, unknown logins, or if every child has left.
create or replace function current_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select s.id
  from students s
  left join login_current_student c on c.user_id = auth.uid() and c.student_id = s.id
  where s.auth_user_id = auth.uid() and s.status <> 'left'
  order by (c.student_id is not null) desc, s.first_name, s.last_name, s.id
  limit 1
$$;

-- 4. The children this login can switch between (for the top bar), with the current one marked.
create or replace function my_students() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'first_name', s.first_name, 'last_name', s.last_name,
           'current', s.id = current_student_id()
         ) order by s.first_name, s.last_name), '[]'::jsonb)
  from students s
  where s.auth_user_id = auth.uid() and s.status <> 'left'
$$;

-- 5. Switch to another child. Only to a child linked to this same login.
create or replace function switch_student(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from students where id = p_student and auth_user_id = auth.uid() and status <> 'left') then
    raise exception 'Not your student';
  end if;
  insert into login_current_student (user_id, student_id) values (auth.uid(), p_student)
  on conflict (user_id) do update set student_id = excluded.student_id, updated_at = now();
end $$;

revoke execute on function my_students(), switch_student(uuid) from public, anon;
grant execute on function my_students(), switch_student(uuid) to authenticated;
