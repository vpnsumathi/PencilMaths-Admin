-- Bulk import (Settings › Bulk import): load students, their batch, year, teacher and class times from a spreadsheet.
--  1. Batches get an optional name ("Batch 1"), so the same batch is found again on the next import.
--  2. Students and teachers can be saved with a first name only (many are known by one name).
--  3. bulk_import(rows, dry_run) matches or creates teachers, batches and students, and puts each student in their batch.
--     Running it twice with the same file changes nothing the second time (no duplicates).
--     dry_run = true (the default) only reports what would happen and saves nothing.
-- Run after 20261027000004_teacher_login.sql. Run on Staging first; on Production at go-live.

-- 1. Batch name ------------------------------------------------------------------------------------------
alter table batches add column if not exists name text;
-- Two open batches of the same subject and year can't share a name (closed batches can).
create unique index if not exists batches_open_name
  on batches (subject_id, year_group, lower(name)) where closed_on is null and name is not null;

-- The batch list view, as in 20261027000004_teacher_login.sql with the name added at the end
-- (and no stray "." after a student who has no last name).
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
  b.name
from batches b
join subjects sub on sub.id = b.subject_id
left join teachers t on t.id = b.teacher_id;

-- 2. Last name optional ----------------------------------------------------------------------------------
-- Many students (and some teachers) are known by one name, as in the import spreadsheet ("Ithika", "Agnes").
-- save_student is as in 20260928000004_student_functions.sql, except only the first name is required
-- (and a family with no surname is named after the child's first name).
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
  if coalesce(trim(p->>'first_name'), '') = '' then raise exception 'The first name is required'; end if;
  if jsonb_array_length(coalesce(p->'enrolments', '[]')) = 0 then raise exception 'Add at least one subject'; end if;
  if (select count(*) <> count(distinct x->>'subject_id') from jsonb_array_elements(p->'enrolments') x) then
    raise exception 'Each subject can only be added once';
  end if;

  if sid is null then
    insert into families (display_name) values (coalesce(nullif(trim(p->>'last_name'), ''), trim(p->>'first_name')) || ' family') returning id into fid;
    insert into students (family_id, first_name, last_name, year_group, school, date_of_birth, status, start_date, created_by)
    values (fid, trim(p->>'first_name'), coalesce(trim(p->>'last_name'), ''), (p->>'year_group')::smallint, nullif(trim(p->>'school'), ''),
            nullif(p->>'date_of_birth', '')::date, (p->>'status')::student_status, coalesce(nullif(p->>'start_date', '')::date, current_date), auth.uid())
    returning id into sid;
  else
    update students set first_name = trim(p->>'first_name'), last_name = coalesce(trim(p->>'last_name'), ''), year_group = (p->>'year_group')::smallint,
      school = nullif(trim(p->>'school'), ''), date_of_birth = nullif(p->>'date_of_birth', '')::date,
      status = (p->>'status')::student_status, start_date = coalesce(nullif(p->>'start_date', '')::date, start_date)
    where id = sid returning family_id into fid;
    if not found then raise exception 'Student not found'; end if;
    if fid is null then
      insert into families (display_name) values (coalesce(nullif(trim(p->>'last_name'), ''), trim(p->>'first_name')) || ' family') returning id into fid;
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

-- 3. Import helpers ---------------------------------------------------------------------------------------------
-- Trims and squeezes spaces; empty becomes null.
create or replace function import_norm(t text) returns text language sql immutable as $$
  select nullif(regexp_replace(trim(coalesce(t, '')), '\s+', ' ', 'g'), '')
$$;

-- Reads class times written like the spreadsheet, one per line (or separated by ";"):
--   "Monday: 4.30 to 5.30 p.m."  →  Monday 16:30
--   "Saturday: 11 am to 12 p.m." →  Saturday 11:00
--   "Thu 17:00"                  →  Thursday 17:00
-- Returns [{weekday, start_time}] sorted by day and time ([] for an empty cell), or null if a line can't be read.
-- Only the start time is kept (batches store start times only). With no am/pm anywhere, 1–7 o'clock is taken as pm.
create or replace function import_parse_times(t text) returns jsonb language plpgsql immutable as $$
declare
  part text;
  m text[];
  wd int; sh int; sm int; eh int; em int;
  start_min int; end_min int;
  slots jsonb := '[]';
begin
  for part in select trim(x) from regexp_split_to_table(coalesce(t, ''), E'[\\n\\r;]+') x loop
    continue when part = '';
    m := regexp_match(lower(part),
      '^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*[:,-]?\s*(\d{1,2})(?:[.:](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?'
      || '(?:\s*(?:to|-|–|until)\s*(\d{1,2})(?:[.:](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?)?');
    if m is null then return null; end if;
    wd := array_position(array['mon','tue','wed','thu','fri','sat','sun'], m[1]);
    sh := m[2]::int; sm := coalesce(m[3], '0')::int;
    if sh > 23 or sm > 59 then return null; end if;
    end_min := null;
    if m[5] is not null and m[7] is not null then
      eh := m[5]::int % 12 + case when m[7] like 'p%' then 12 else 0 end;
      em := coalesce(m[6], '0')::int;
      end_min := eh * 60 + em;
    end if;

    if m[4] is not null then
      start_min := (sh % 12 + case when m[4] like 'p%' then 12 else 0 end) * 60 + sm;
    elsif sh >= 13 then
      start_min := sh * 60 + sm;                                  -- 24-hour clock
    elsif end_min is not null then
      -- "4.30 to 5.30 pm" → 16:30; "11 to 12 pm" → 11:00: the latest of am/pm that is not after the end.
      start_min := (sh % 12) * 60 + sm;
      if start_min + 720 <= end_min then start_min := start_min + 720; end if;
    else
      start_min := (sh % 12 + case when sh between 1 and 7 then 12 else 0 end) * 60 + sm;
    end if;

    slots := slots || jsonb_build_object('weekday', wd,
      'start_time', lpad((start_min / 60)::text, 2, '0') || ':' || lpad((start_min % 60)::text, 2, '0'));
  end loop;

  -- Sorted and without repeats, so two cells with the same times compare equal.
  return coalesce((select jsonb_agg(s order by (s->>'weekday')::int, s->>'start_time')
                   from (select distinct s from jsonb_array_elements(slots) s) d), '[]');
end $$;

-- "Monday 16:30, Wednesday 16:30" for messages.
create or replace function import_times_label(slots jsonb) returns text language sql immutable as $$
  select coalesce(string_agg((array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[(s->>'weekday')::int] || ' ' || (s->>'start_time'), ', '
                             order by (s->>'weekday')::int, s->>'start_time'), 'no times')
  from jsonb_array_elements(coalesce(slots, '[]')) s
$$;

-- 4. The import ------------------------------------------------------------------------------------------
-- p_rows: [{ row, year, batch, student, teacher, time, subject? }] — one per spreadsheet row, as text.
--   year "Year 2" (or "2"), batch "Batch 1", student "Nevaeh Mariam", teacher "Agnes", time as above,
--   subject optional (Maths when left out; a subject id or name such as "Science").
-- Matching (so nothing is added twice):
--   Teacher: same full name (not left). A first name alone matches the only teacher with that first name.
--   Batch:   same subject, year and name among open batches; or else an unnamed open batch with the same subject,
--            year, teacher and times (it gets the name).
--   Student: same full name (not left); if two, the one in the same year. A first name alone matches the only
--            student with that first name in that year.
-- A matched student in another batch of the subject is moved. A batch's places are raised if the file needs more.
-- Students already in a batch but not in the file are left where they are (listed as a warning).
create or replace function bulk_import(p_rows jsonb, p_dry_run boolean default true) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  r record;
  g record;
  ids uuid[];
  tid uuid; bid uuid; sid uuid; fid uuid; eid uuid; cur_batch uuid;
  n int; cap int;
  b_action text; b_changes text[];
  v_first text; v_last text;
  errors jsonb := '[]';
  warnings jsonb := '[]';
  rep_teachers jsonb := '[]';
  rep_batches jsonb := '[]';
  rep_students jsonb := '[]';
  new_ids jsonb := '[]';
  saved boolean := false;
  seqs jsonb;
begin
  -- Admins in the app; the service key and the SQL editor (for the standalone script) are allowed too.
  if current_user::text not in ('postgres', 'service_role', 'supabase_admin') and not is_admin() then
    raise exception 'Only admins can bulk import.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Nothing to import.'; end if;

  drop table if exists pg_temp.imp_rows;
  create temp table imp_rows on commit drop as
  select coalesce(nullif(x->>'row', '')::int, i::int) as rn,
    import_norm(x->>'year') as year_text, import_norm(x->>'batch') as batch, import_norm(x->>'student') as student,
    import_norm(x->>'teacher') as teacher, x->>'time' as time_text, import_norm(x->>'subject') as subject_text,
    null::int as year, null::jsonb as times, null::text as subject_id, null::text as problem, null::uuid as student_id
  from jsonb_array_elements(p_rows) with ordinality as t(x, i);
  delete from imp_rows where student is null and batch is null and teacher is null and year_text is null and import_norm(time_text) is null;
  if not exists (select 1 from imp_rows) then raise exception 'Nothing to import: the file has no student rows.'; end if;

  -- Read and check each row.
  update imp_rows set
    year = (regexp_match(year_text, '(\d{1,2})'))[1]::int,
    times = import_parse_times(time_text),
    subject_id = case when subject_text is null then 'maths'
      else (select s.id from subjects s where lower(s.id) = lower(subject_text) or lower(s.name) = lower(subject_text) limit 1) end
  where true;  -- Supabase refuses an UPDATE with no WHERE when called from the app ("UPDATE requires a WHERE clause")
  update imp_rows set problem = case
    when student is null then 'The student name is missing.'
    when year is null or year not between 1 and 13 then format('The year "%s" is not Year 1 to Year 13.', coalesce(year_text, ''))
    when batch is null then 'The batch is missing.'
    when teacher is null then 'The teacher name is missing.'
    when subject_id is null then format('Unknown subject "%s".', subject_text)
    when times is null then format('The batch time "%s" could not be read. Write it like "Monday: 4.30 to 5.30 p.m.", one day per line.',
                                   replace(trim(time_text), E'\n', ' / '))
  end
  where true;
  select errors || coalesce(jsonb_agg(jsonb_build_object('row', rn, 'message', problem) order by rn), '[]')
    into errors from imp_rows where problem is not null;

  -- One batch must have one teacher and one set of times in the whole file; a student is listed once per subject.
  for g in
    select subject_id, year, lower(batch) as k, min(batch) as batch, min(rn) as first_row,
      count(distinct lower(teacher)) as teachers, count(distinct times::text) as timings
    from imp_rows where problem is null group by subject_id, year, lower(batch)
  loop
    if g.teachers > 1 then
      errors := errors || jsonb_build_object('row', g.first_row,
        'message', format('Year %s %s has more than one teacher in the file. Use one teacher per batch.', g.year, g.batch));
    end if;
    if g.timings > 1 then
      errors := errors || jsonb_build_object('row', g.first_row,
        'message', format('Year %s %s has different batch times on different rows. Make them the same.', g.year, g.batch));
    end if;
  end loop;
  for g in
    select lower(student) as k, min(student) as student, subject_id, array_agg(rn order by rn) as rows_
    from imp_rows where problem is null group by lower(student), subject_id having count(*) > 1
  loop
    errors := errors || jsonb_build_object('row', g.rows_[2],
      'message', format('%s is listed more than once (rows %s). A student can only be in one batch per subject.',
                        g.student, array_to_string(g.rows_, ', ')));
  end loop;

  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('ok', false, 'saved', false, 'dry_run', p_dry_run, 'errors', errors, 'warnings', warnings);
  end if;

  -- Where the B-/PM-/T codes are up to, so a dry run doesn't use up numbers (see the end).
  begin
    seqs := jsonb_build_object(
      'batch', (select jsonb_build_object('v', last_value, 'c', is_called) from batch_code_seq),
      'student', (select jsonb_build_object('v', last_value, 'c', is_called) from student_code_seq),
      'teacher', (select jsonb_build_object('v', last_value, 'c', is_called) from teacher_code_seq));
  exception when others then seqs := null;
  end;

  -- Everything below is undone at the end for a dry run, or if any problem is found on the way.
  begin
    drop table if exists pg_temp.imp_teachers;
    create temp table imp_teachers (k text primary key, id uuid) on commit drop;
    drop table if exists pg_temp.imp_batches;
    create temp table imp_batches (subject_id text, year int, k text, id uuid, label text, teacher text, times jsonb,
                                   action text, changes text[], primary key (subject_id, year, k)) on commit drop;

    -- Teachers.
    for g in
      select lower(teacher) as k, min(teacher) as name, min(year) as ymin, max(year) as ymax, min(subject_id) as subject_id, min(rn) as first_row
      from imp_rows group by lower(teacher) order by 2
    loop
      select array_agg(id) into ids from teachers
      where status <> 'left' and lower(import_norm(first_name || ' ' || last_name)) = g.k;
      if ids is null and position(' ' in g.k) = 0 then
        select array_agg(id) into ids from teachers where status <> 'left' and lower(trim(first_name)) = g.k;
      end if;
      if cardinality(ids) > 1 then
        errors := errors || jsonb_build_object('row', g.first_row,
          'message', format('More than one teacher matches "%s". Write their full name as on the Teachers page.', g.name));
        continue;
      elsif ids is not null then
        tid := ids[1];
        rep_teachers := rep_teachers || (select jsonb_build_object('name', g.name, 'action', 'existing', 'code', t.code,
          'matched', import_norm(t.first_name || ' ' || t.last_name)) from teachers t where t.id = tid);
      else
        v_first := split_part(g.name, ' ', 1);
        v_last := coalesce(nullif(substr(g.name, length(v_first) + 2), ''), '');
        insert into teachers (first_name, last_name, subject_id, year_min, year_max, status, joined_on)
        values (v_first, v_last, g.subject_id, g.ymin, g.ymax, 'active', current_date)
        returning id into tid;
        rep_teachers := rep_teachers || jsonb_build_object('name', g.name, 'action', 'new');
      end if;
      insert into imp_teachers values (g.k, tid);
    end loop;

    -- Batches.
    for g in
      select subject_id, year, lower(batch) as k, min(batch) as batch, min(lower(teacher)) as tk, min(teacher) as teacher,
        min(times::text)::jsonb as times, count(*)::int as students
      from imp_rows group by subject_id, year, lower(batch) order by year, lower(batch)
    loop
      select id into tid from imp_teachers where k = g.tk;
      continue when tid is null;  -- the teacher had a problem (reported above)
      b_changes := '{}';
      select id into bid from batches
      where subject_id = g.subject_id and year_group = g.year and lower(name) = g.k and closed_on is null;
      if bid is null then
        -- A batch made by hand before (no name) with the same teacher and times: use it and give it the name.
        select b.id into bid from batches b
        where b.subject_id = g.subject_id and b.year_group = g.year and b.teacher_id = tid and b.closed_on is null and b.name is null
          and coalesce((select jsonb_agg(jsonb_build_object('weekday', s.weekday, 'start_time', to_char(s.start_time, 'HH24:MI'))
                          order by s.weekday, s.start_time) from batch_slots s where s.batch_id = b.id), '[]') = g.times
        order by b.created_at limit 1;
        if bid is not null then
          update batches set name = g.batch where id = bid;
          b_action := 'existing';
          b_changes := b_changes || 'named'::text;
        end if;
      else
        b_action := 'existing';
      end if;

      if bid is null then
        -- New batch. Creating it copies the subject's curriculum into its lesson plan (a database trigger).
        insert into batches (subject_id, year_group, teacher_id, capacity, name)
        values (g.subject_id, g.year, tid, least(12, greatest(3, g.students)), g.batch)
        returning id into bid;
        insert into batch_slots (batch_id, weekday, start_time)
        select bid, (s->>'weekday')::int, (s->>'start_time')::time from jsonb_array_elements(g.times) s;
        b_action := 'new';
      else
        if (select teacher_id from batches where id = bid) <> tid then
          update batches set teacher_id = tid where id = bid;
          -- Students in the batch follow its teacher, as when the batch is saved on its page.
          update enrolments set teacher_id = tid where batch_id = bid and ended_on is null;
          b_changes := b_changes || 'teacher'::text;
        end if;
        if coalesce((select jsonb_agg(jsonb_build_object('weekday', s.weekday, 'start_time', to_char(s.start_time, 'HH24:MI'))
                       order by s.weekday, s.start_time) from batch_slots s where s.batch_id = bid), '[]') <> g.times then
          delete from batch_slots where batch_id = bid;
          insert into batch_slots (batch_id, weekday, start_time)
          select bid, (s->>'weekday')::int, (s->>'start_time')::time from jsonb_array_elements(g.times) s;
          b_changes := b_changes || 'class times'::text;
        end if;
      end if;
      insert into imp_batches values (g.subject_id, g.year, g.k, bid, format('Year %s %s', g.year, g.batch), g.teacher, g.times, b_action, b_changes);
    end loop;

    -- Students: find or add each one (their batch place comes after).
    for r in select * from imp_rows order by year, lower(batch), rn loop
      select array_agg(id) into ids from students
      where status <> 'left' and lower(import_norm(first_name || ' ' || last_name)) = lower(r.student);
      if cardinality(ids) > 1 then
        select array_agg(id) into ids from students where id = any(ids) and year_group = r.year;
      end if;
      if ids is null and position(' ' in r.student) = 0 then
        select array_agg(id) into ids from students where status <> 'left' and lower(trim(first_name)) = lower(r.student) and year_group = r.year;
      end if;

      if cardinality(ids) > 1 then
        errors := errors || jsonb_build_object('row', r.rn,
          'message', format('More than one student called %s in Year %s. Write their full name as on the Students page.', r.student, r.year));
        continue;
      elsif ids is not null then
        sid := ids[1];
        if (select year_group from students where id = sid) <> r.year then
          update students set year_group = r.year where id = sid;
          warnings := warnings || jsonb_build_object('row', r.rn, 'message', format('%s moved to Year %s.', r.student, r.year));
        end if;
      else
        v_first := split_part(r.student, ' ', 1);
        v_last := coalesce(nullif(substr(r.student, length(v_first) + 2), ''), '');
        insert into families (display_name) values (coalesce(nullif(v_last, ''), v_first) || ' family') returning id into fid;
        insert into students (family_id, first_name, last_name, year_group, status, created_by)
        values (fid, v_first, v_last, r.year, 'active', (select id from staff where id = auth.uid()))
        returning id into sid;
        new_ids := new_ids || to_jsonb(sid);
      end if;
      update imp_rows set student_id = sid where rn = r.rn;
    end loop;

    -- Places: make room for everyone the file puts in each batch, plus anyone already there who stays.
    for g in
      select ib.id, ib.label, count(*)::int as from_file, array_agg(i.student_id) as sids
      from imp_rows i join imp_batches ib on ib.subject_id = i.subject_id and ib.year = i.year and ib.k = lower(i.batch)
      where i.student_id is not null group by ib.id, ib.label
    loop
      select count(*) into n from enrolments where batch_id = g.id and ended_on is null and not (student_id = any(g.sids));
      select capacity into cap from batches where id = g.id;
      if n + g.from_file > 12 then
        errors := errors || jsonb_build_object('row', null,
          'message', format('%s would have %s students, more than the 12 places a batch can have.', g.label, n + g.from_file));
      elsif n + g.from_file > cap then
        update batches set capacity = n + g.from_file where id = g.id;
        update imp_batches set changes = changes || format('places %s → %s', cap, n + g.from_file) where id = g.id;
      end if;
      if n > 0 then
        warnings := warnings || jsonb_build_object('row', null, 'message', format('%s also has %s student(s) who are not in the file: %s. They stay in the batch.',
          g.label, n, (select string_agg(import_norm(s.first_name || ' ' || s.last_name), ', ' order by s.first_name)
                       from enrolments e join students s on s.id = e.student_id
                       where e.batch_id = g.id and e.ended_on is null and not (e.student_id = any(g.sids)))));
      end if;
    end loop;

    -- Batch places for each student.
    for r in
      select i.*, ib.id as bid, ib.label from imp_rows i
      join imp_batches ib on ib.subject_id = i.subject_id and ib.year = i.year and ib.k = lower(i.batch)
      where i.student_id is not null order by i.year, lower(i.batch), i.rn
    loop
      eid := null; cur_batch := null;
      select id, batch_id into eid, cur_batch from enrolments
      where student_id = r.student_id and subject_id = r.subject_id and ended_on is null;
      if eid is null then
        insert into enrolments (student_id, subject_id, batch_id) values (r.student_id, r.subject_id, r.bid);
        b_action := 'added';
      elsif cur_batch is distinct from r.bid then
        update enrolments set batch_id = r.bid where id = eid;
        b_action := case when cur_batch is null then 'added' else 'moved' end;
      else
        b_action := 'unchanged';
      end if;
      rep_students := rep_students || jsonb_build_object(
        'row', r.rn, 'student', r.student, 'year', r.year, 'batch', r.label,
        'status', case when new_ids @> to_jsonb(r.student_id) then 'new' else 'existing' end,
        'place', b_action,
        'from', case when b_action = 'moved' then coalesce(
          (select coalesce('Year ' || b.year_group || ' ' || b.name, b.code) from batches b where b.id = cur_batch), 'no batch') end);
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('batch', label, 'teacher', teacher, 'times', import_times_label(times),
             'action', action, 'changes', to_jsonb(changes)) order by year, k), '[]')
      into rep_batches from imp_batches;

    if p_dry_run or jsonb_array_length(errors) > 0 then
      raise exception 'undo' using errcode = 'PMDRY';
    end if;
    saved := true;
  exception
    when sqlstate 'PMDRY' then saved := false;
    when others then
      errors := errors || jsonb_build_object('row', null, 'message', sqlerrm);
      saved := false;
  end;

  -- Nothing was saved: put the code numbers back, so the next real batch is still B-001 and not B-009.
  -- Never below a code already in use (in case someone else added one meanwhile).
  if not saved and seqs is not null then
    begin
      perform setval('batch_code_seq', greatest((seqs#>>'{batch,v}')::bigint, coalesce((select max(substring(code from '\d+$')::bigint) from batches), 0)),
                     (seqs#>>'{batch,c}')::boolean or exists (select 1 from batches));
      perform setval('student_code_seq', greatest((seqs#>>'{student,v}')::bigint, coalesce((select max(substring(code from '\d+$')::bigint) from students), 0)),
                     (seqs#>>'{student,c}')::boolean or exists (select 1 from students));
      perform setval('teacher_code_seq', greatest((seqs#>>'{teacher,v}')::bigint, coalesce((select max(substring(code from '\d+$')::bigint) from teachers), 0)),
                     (seqs#>>'{teacher,c}')::boolean or exists (select 1 from teachers));
    exception when others then null;  -- only tidiness; never fail the check because of it
    end;
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(errors) = 0,
    'saved', saved,
    'dry_run', p_dry_run,
    'errors', errors,
    'warnings', warnings,
    'teachers', rep_teachers,
    'batches', rep_batches,
    'students', rep_students,
    'new_student_ids', case when saved then new_ids else '[]'::jsonb end);
end $$;

revoke execute on function bulk_import(jsonb, boolean) from public, anon;
grant execute on function bulk_import(jsonb, boolean) to authenticated, service_role;
