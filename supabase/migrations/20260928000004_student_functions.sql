-- Student save and status changes, done in one transaction each.

-- When a student leaves, they give up their batch places (teacher history is kept).
create or replace function student_left_release_places() returns trigger language plpgsql as $$
begin
  if new.status = 'left' and old.status is distinct from 'left' then
    update enrolments set batch_id = null where student_id = new.id and ended_on is null;
    new.left_on := coalesce(new.left_on, current_date);
  elsif new.status <> 'left' then
    new.left_on := null;
  end if;
  return new;
end $$;
create trigger students_left before update of status on students for each row execute function student_left_release_places();

-- Create or update a student with guardian, subjects and folder link.
-- p = { id?, first_name, last_name, year_group, school, date_of_birth, status, start_date,
--       guardian: { full_name, relationship, phone, email },
--       enrolments: [ { id?, subject_id, teacher_id?, batch_id? } ], folder_url? }
create or replace function save_student(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  sid uuid := nullif(p->>'id', '')::uuid;
  fid uuid;
  e jsonb;
  eid uuid;
  keep uuid[];
  g jsonb := coalesce(p->'guardian', '{}');
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if coalesce(trim(p->>'first_name'), '') = '' or coalesce(trim(p->>'last_name'), '') = '' then raise exception 'First and last name are required'; end if;
  if jsonb_array_length(coalesce(p->'enrolments', '[]')) = 0 then raise exception 'Add at least one subject'; end if;
  if (select count(*) <> count(distinct x->>'subject_id') from jsonb_array_elements(p->'enrolments') x) then
    raise exception 'Each subject can only be added once';
  end if;

  if sid is null then
    insert into families (display_name) values (trim(p->>'last_name') || ' family') returning id into fid;
    insert into students (family_id, first_name, last_name, year_group, school, date_of_birth, status, start_date, created_by)
    values (fid, trim(p->>'first_name'), trim(p->>'last_name'), (p->>'year_group')::smallint, nullif(trim(p->>'school'), ''),
            nullif(p->>'date_of_birth', '')::date, (p->>'status')::student_status, coalesce(nullif(p->>'start_date', '')::date, current_date), auth.uid())
    returning id into sid;
  else
    update students set first_name = trim(p->>'first_name'), last_name = trim(p->>'last_name'), year_group = (p->>'year_group')::smallint,
      school = nullif(trim(p->>'school'), ''), date_of_birth = nullif(p->>'date_of_birth', '')::date,
      status = (p->>'status')::student_status, start_date = coalesce(nullif(p->>'start_date', '')::date, start_date)
    where id = sid returning family_id into fid;
    if not found then raise exception 'Student not found'; end if;
    if fid is null then
      insert into families (display_name) values (trim(p->>'last_name') || ' family') returning id into fid;
      update students set family_id = fid where id = sid;
    end if;
  end if;

  if coalesce(trim(g->>'full_name'), '') <> '' then
    update guardians set full_name = trim(g->>'full_name'), relationship = nullif(g->>'relationship', ''),
      phone = nullif(trim(g->>'phone'), ''), email = nullif(trim(g->>'email'), '')::citext
    where family_id = fid and is_primary;
    if not found then
      insert into guardians (family_id, full_name, relationship, phone, email, is_primary)
      values (fid, trim(g->>'full_name'), nullif(g->>'relationship', ''), nullif(trim(g->>'phone'), ''), nullif(trim(g->>'email'), '')::citext, true);
    end if;
  end if;

  -- End subjects that were removed, then add or update the rest.
  select coalesce(array_agg((x->>'id')::uuid) filter (where coalesce(x->>'id', '') <> ''), '{}') into keep from jsonb_array_elements(p->'enrolments') x;
  update enrolments set ended_on = current_date where student_id = sid and ended_on is null and not (id = any(keep));
  for e in select * from jsonb_array_elements(p->'enrolments') loop
    eid := nullif(e->>'id', '')::uuid;
    if eid is null then
      insert into enrolments (student_id, subject_id, teacher_id, batch_id)
      values (sid, e->>'subject_id', nullif(e->>'teacher_id', '')::uuid, nullif(e->>'batch_id', '')::uuid);
    else
      update enrolments set subject_id = e->>'subject_id', teacher_id = nullif(e->>'teacher_id', '')::uuid, batch_id = nullif(e->>'batch_id', '')::uuid
      where id = eid and student_id = sid;
    end if;
  end loop;
  if p->>'status' = 'left' then
    update enrolments set batch_id = null where student_id = sid and ended_on is null;
  end if;

  if coalesce(trim(p->>'folder_url'), '') = '' then
    delete from file_links where student_id = sid and owner_type = 'student_folder' and provider = 'external_link';
  else
    insert into file_links (owner_type, owner_id, student_id, provider, url, label)
    values ('student_folder', sid, sid, 'external_link', trim(p->>'folder_url'), 'Student folder')
    on conflict (student_id) where owner_type = 'student_folder'
    do update set url = excluded.url, provider = 'external_link', external_id = null;
  end if;

  return sid;
end $$;
grant execute on function save_student(jsonb) to authenticated;

create or replace view teacher_list with (security_invoker = true) as
select t.id, t.code, t.first_name, t.last_name, t.personal_email, t.phone, t.subject_id, sub.name as subject,
  t.year_min, t.year_max, t.status, t.joined_on,
  (select count(*) from batches b where b.teacher_id = t.id and b.closed_on is null) as batch_count,
  (select count(distinct e.student_id) from enrolments e join students s on s.id = e.student_id
    where e.teacher_id = t.id and e.ended_on is null and s.status <> 'left') as student_count
from teachers t left join subjects sub on sub.id = t.subject_id;
