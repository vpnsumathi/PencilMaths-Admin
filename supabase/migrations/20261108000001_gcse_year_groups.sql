-- GCSE - H and GCSE - F instead of Year 11, 12 and 13.
-- Year groups are still stored as numbers: 1-10 are Year 1 to Year 10, 11 is GCSE - H (Higher) and 12 is GCSE - F
-- (Foundation). 13 is no longer allowed. The app shows the labels; year_label() gives the same words in the database.
--
-- ⚠️ As asked on 8 Nov 2026, this script DELETES everything that is in Year 11, 12 or 13 today:
--   * students in Year 11-13, with their subjects, homework results, hand-ins, notes and file rows
--     (their families and parents too, when the family has no other student),
--   * batches of Year 11-13, with their class times, lesson plan, classes and homework,
--   * enquiries for Year 11-13,
--   * Lesson library lessons and curriculum topics for Year 11-13 (import the GCSE lesson plans again afterwards).
-- Files in Google Drive are not deleted. Logins (auth users) of deleted students stay, but open nothing.
-- Teachers are kept: a lowest or highest year above 12 becomes GCSE - F.
-- Bulk import reads "GCSE-H", "GCSE - H", "GCSE H", "GCSE Higher", "Higher" (and the same for F / Foundation);
-- a file that still says Year 11, 12 or 13 is refused with a message.
-- Run after 20261106000001_faster_database.sql. Run on Staging first; on Production at go-live.
-- Before running on Production, see what will be deleted (Help/02, "GCSE year groups").

-- 1. Labels ---------------------------------------------------------------------------------------------
create or replace function year_label(y int) returns text language sql immutable as $$
  select case when y = 11 then 'GCSE - H' when y = 12 then 'GCSE - F' when y is null then null else 'Year ' || y end
$$;

-- A spreadsheet's Year cell → the stored number: "Year 5" / "5" → 5, "GCSE-H" → 11, "GCSE - F" → 12.
-- "Year 11" etc. comes back as 11-13, so bulk_import can say those years are no longer used.
create or replace function import_year(t text) returns int language sql immutable as $$
  select case
    when t is null then null
    when lower(t) ~ '^gcse\s*[-–]?\s*(h|higher)(\s*tier)?$' or lower(t) ~ '^higher(\s*tier)?$' then 11
    when lower(t) ~ '^gcse\s*[-–]?\s*(f|foundation)(\s*tier)?$' or lower(t) ~ '^foundation(\s*tier)?$' then 12
    when lower(t) ~ '^(year|yr|y)?\s*\d{1,2}$' then (regexp_match(t, '(\d{1,2})'))[1]::int
    else null end
$$;

-- 2. Delete everything in Year 11-13 --------------------------------------------------------------------
drop table if exists gcse_old_families;
create temp table gcse_old_families as
  select distinct family_id as id from students where year_group >= 11 and family_id is not null;
-- Anyone (of another year) placed in a Year 11-13 batch loses that place; the subject stays.
update enrolments set batch_id = null
where batch_id in (select id from batches where year_group >= 11) and student_id in (select id from students where year_group < 11);
delete from students where year_group >= 11;
delete from families f where f.id in (select id from gcse_old_families)
  and not exists (select 1 from students s where s.family_id = f.id);
drop table gcse_old_families;
delete from enrolments where batch_id in (select id from batches where year_group >= 11);
delete from batches where year_group >= 11;
delete from enquiries where year_group >= 11;
delete from lessons where year_group >= 11;
delete from curriculum_topics where year_group >= 11;
update teachers set year_min = 12 where year_min > 12;
update teachers set year_max = 12 where year_max > 12;

-- 3. Only Year 1-10, GCSE - H (11) and GCSE - F (12) from now on --------------------------------------
alter table students drop constraint if exists students_year_group_check;
alter table students add constraint students_year_group_check check (year_group between 1 and 12);
alter table batches drop constraint if exists batches_year_group_check;
alter table batches add constraint batches_year_group_check check (year_group between 1 and 12);
alter table enquiries drop constraint if exists enquiries_year_group_check;
alter table enquiries add constraint enquiries_year_group_check check (year_group between 1 and 12);
alter table lessons drop constraint if exists lessons_year_group_check;
alter table lessons add constraint lessons_year_group_check check (year_group between 1 and 12);
alter table curriculum_topics drop constraint if exists curriculum_topics_year_group_check;
alter table curriculum_topics add constraint curriculum_topics_year_group_check check (year_group between 1 and 12);
alter table teachers drop constraint if exists teachers_year_min_check;
alter table teachers add constraint teachers_year_min_check check (year_min between 1 and 12);
alter table teachers drop constraint if exists teachers_year_max_check;
alter table teachers add constraint teachers_year_max_check check (year_max between 1 and 12);

-- 4. Bulk import reads GCSE-H / GCSE-F (as in 20261102000001_bulk_import.sql, with the year reading and the
--    messages changed).
create or replace function bulk_import(p_rows jsonb, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    year = import_year(year_text),
    times = import_parse_times(time_text),
    subject_id = case when subject_text is null then 'maths'
      else (select s.id from subjects s where lower(s.id) = lower(subject_text) or lower(s.name) = lower(subject_text) limit 1) end
  where true;  -- Supabase refuses an UPDATE with no WHERE when called from the app ("UPDATE requires a WHERE clause")
  update imp_rows set problem = case
    when student is null then 'The student name is missing.'
    when year between 11 and 13 and year_text !~* '(gcse|higher|foundation)' then
      format('"%s" is no longer a year group. Use GCSE-H or GCSE-F.', year_text)
    when year is null or year not between 1 and 12 then
      format('The year "%s" is not Year 1 to Year 10, GCSE-H or GCSE-F.', coalesce(year_text, ''))
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
        'message', format('%s %s has more than one teacher in the file. Use one teacher per batch.', year_label(g.year), g.batch));
    end if;
    if g.timings > 1 then
      errors := errors || jsonb_build_object('row', g.first_row,
        'message', format('%s %s has different batch times on different rows. Make them the same.', year_label(g.year), g.batch));
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
      insert into imp_batches values (g.subject_id, g.year, g.k, bid, format('%s %s', year_label(g.year), g.batch), g.teacher, g.times, b_action, b_changes);
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
          'message', format('More than one student called %s in %s. Write their full name as on the Students page.', r.student, year_label(r.year)));
        continue;
      elsif ids is not null then
        sid := ids[1];
        if (select year_group from students where id = sid) <> r.year then
          update students set year_group = r.year where id = sid;
          warnings := warnings || jsonb_build_object('row', r.rn, 'message', format('%s moved to %s.', r.student, year_label(r.year)));
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
          (select coalesce(year_label(b.year_group) || ' ' || b.name, b.code) from batches b where b.id = cur_batch), 'no batch') end);
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
end $function$;

revoke execute on function bulk_import(jsonb, boolean) from public, anon;
grant execute on function bulk_import(jsonb, boolean) to authenticated, service_role;
