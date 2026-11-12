-- PencilMaths Admin: Production database, step 1 of 4. Everything the app needs, no data.
--
-- This is the end result of the 29 scripts in supabase/migrations (20260928000001 to 20261111000003),
-- written once. Every table, function, view and rule appears once, in its final form. The steps that only
-- mattered on Staging (replacing earlier versions, deleting Year 11-13 data, listing old clashes) are gone.
-- Checked against the 29 scripts: the same tables, columns, functions, views, rules, triggers, indexes and
-- permissions, and every automated database check passes on it.
--
-- Run it ONCE, on a NEW, EMPTY Production project:
--   Supabase > SQL Editor > New query > paste this whole file > Run.
--   Check the project name at the top left first.
-- It is all-or-nothing: if anything fails, nothing is kept and you can simply run it again after the fix.
--
-- Not included: the AI question bank (supabase/migrations/AI), which stays on its own branch.
-- Next: 02_seed.sql, 03_first_admin.sql, 04_check.sql (see README.md in this folder).
-- Scripts added to supabase/migrations after 20261111000003 are run on Production one by one, as usual.

begin;

set local check_function_bodies = false;   -- functions may mention tables that are created further down
set local client_min_messages = warning;
set local search_path = '';                -- every name below is written in full (public....)

-- citext: text that ignores capital letters, used for email addresses. Kept in the public schema, as the
-- first migration script does.
do $$
declare s name;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'citext';
  if s is null then
    create extension citext with schema public;
  elsif s <> 'public' then
    begin
      execute 'alter extension citext set schema public';
    exception when others then
      raise exception 'The citext extension is already switched on in schema "%". In Supabase > Database > Extensions, switch citext off, then run this file again.', s;
    end;
  end if;
end $$;


-- ==============================================================================================================
-- 1. Fixed lists of values (enum types)
-- ==============================================================================================================

CREATE TYPE public.attendance_source AS ENUM (
    'auto',
    'link',
    'staff'
);

CREATE TYPE public.attendance_status AS ENUM (
    'present',
    'late',
    'absent'
);

CREATE TYPE public.enquiry_stage AS ENUM (
    'new',
    'assessment_sent',
    'assessment_returned',
    'results_shared',
    'confirmed',
    'enrolled',
    'not_proceeding'
);

CREATE TYPE public.file_provider AS ENUM (
    'external_link',
    'google_drive'
);

CREATE TYPE public.homework_status AS ENUM (
    'pending',
    'received',
    'marked',
    'excused'
);

CREATE TYPE public.note_category AS ENUM (
    'general',
    'call_log',
    'academic'
);

CREATE TYPE public.staff_role AS ENUM (
    'admin',
    'operations',
    'head_teacher'
);

CREATE TYPE public.student_status AS ENUM (
    'active',
    'trial',
    'paused',
    'leaving',
    'left'
);

CREATE TYPE public.teacher_status AS ENUM (
    'active',
    'on_leave',
    'onboarding',
    'left'
);

CREATE TYPE public.topic_status AS ENUM (
    'not_started',
    'in_progress',
    'complete'
);

CREATE TYPE public.update_channel AS ENUM (
    'whatsapp',
    'phone',
    'email',
    'marks_sheet',
    'other'
);


-- ==============================================================================================================
-- 2. Functions
-- ==============================================================================================================

CREATE FUNCTION public.attendance_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.source = 'staff' and (tg_op = 'INSERT' or old.status is distinct from new.status or old.source <> 'staff') then
    insert into attendance_changes (session_id, student_id, old_status, old_source, new_status, changed_by, reason)
    values (new.session_id, new.student_id,
            case when tg_op = 'UPDATE' then old.status end, case when tg_op = 'UPDATE' then old.source end,
            new.status, new.marked_by, nullif(trim(current_setting('pm.attendance_reason', true)), ''));
  end if;
  return null;
end $$;

CREATE FUNCTION public.attendance_stamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if current_user = 'authenticated' then
    new.source := 'staff';
    new.marked_by := auth.uid();
    new.updated_at := now();
    new.joined_at := case when tg_op = 'UPDATE' then old.joined_at else null end;
  end if;
  return new;
end $$;

CREATE FUNCTION public.attendance_totals(p_student uuid, p_batch uuid DEFAULT NULL::uuid, p_days integer DEFAULT 84) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with att as (
    select cs.class_date, a.status, a.source
    from attendance a
    join class_sessions cs on cs.id = a.session_id
    where a.student_id = p_student
      and (p_batch is null or cs.batch_id = p_batch)
      and cs.class_date >= (now() at time zone 'Europe/London')::date - p_days
      and not (a.source = 'auto'
               and (cs.class_date + coalesce(cs.start_time, time '00:00'))
                   + make_interval(mins => (select after_minutes from class_window()))
                   > (now() at time zone 'Europe/London'))
  )
  select jsonb_build_object(
    'present', (select count(*) from att where status = 'present'),
    'late', (select count(*) from att where status = 'late'),
    'absent', (select count(*) from att where status = 'absent'),
    'total', (select count(*) from att),
    -- Portal check-ins the teacher hasn't confirmed yet (already counted in present / late).
    'checked_in', (select count(*) from att where source = 'link'),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('class_date', r.class_date, 'status', r.status, 'source', r.source)
                                         order by r.class_date desc)
                        from (select class_date, status, source from att order by class_date desc limit 6) r), '[]'::jsonb))
$$;

CREATE FUNCTION public.batch_capacity_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare taken int;
begin
  select count(*) into taken from enrolments where batch_id = new.id and ended_on is null;
  if new.capacity < taken then
    raise exception 'Batch % has % students, so its places can''t be lower than %.', new.code, taken, taken;
  end if;
  return new;
end $$;

CREATE FUNCTION public.batch_class_link_stamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.class_link := nullif(btrim(new.class_link), '');
  if tg_op = 'UPDATE' and new.class_link is not distinct from old.class_link then
    new.class_link_updated_at := old.class_link_updated_at;
    new.class_link_updated_by := old.class_link_updated_by;
    return new;
  end if;
  if tg_op = 'INSERT' and new.class_link is null then return new; end if;
  new.class_link_updated_at := now();
  new.class_link_updated_by := (select id from staff where id = auth.uid());
  return new;
end $$;

CREATE FUNCTION public.batch_register(p_batch uuid, p_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  d date := coalesce(p_date, (now() at time zone 'Europe/London')::date);
  staff_view boolean := is_staff();
  sess uuid;
  sess_start time;
begin
  if not (staff_view or teaches_batch(p_batch)) then raise exception 'Not allowed'; end if;
  select id, start_time into sess, sess_start from class_sessions where batch_id = p_batch and class_date = d;

  return jsonb_build_object(
    'class_date', d,
    'session_id', sess,
    'start_time', coalesce(sess_start, (select min(start_time) from batch_slots
                                        where batch_id = p_batch and weekday = extract(isodow from d)::int)),
    'class_day', exists (select 1 from batch_slots where batch_id = p_batch and weekday = extract(isodow from d)::int),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'first_name', s.first_name, 'last_name', s.last_name,
               'status', a.status, 'source', a.source, 'joined_at', a.joined_at, 'updated_at', a.updated_at,
               'marked_by', coalesce((select st.full_name from staff st where st.id = a.marked_by),
                                     (select t.first_name || ' ' || t.last_name from teachers t where t.auth_user_id = a.marked_by)),
               'in_batch', m.in_batch,
               -- Every saved change for that class, oldest first.
               'history', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'at', c.changed_at, 'from', c.old_status, 'from_source', c.old_source, 'to', c.new_status,
                          'reason', c.reason,
                          'by', coalesce((select st.full_name from staff st where st.id = c.changed_by),
                                         (select t.first_name || ' ' || t.last_name from teachers t where t.auth_user_id = c.changed_by)))
                          order by c.changed_at, c.id)
                 from attendance_changes c where c.session_id = sess and c.student_id = m.student_id), '[]'::jsonb)
             ) order by s.first_name, s.last_name, s.id)
      from (
        select x.student_id, bool_or(x.in_batch) as in_batch
        from (
          select e.student_id, e.ended_on is null as in_batch from enrolments e
          where e.batch_id = p_batch and e.started_on <= d and (e.ended_on is null or e.ended_on >= d)
          union all
          select a2.student_id, false from attendance a2 where a2.session_id = sess and staff_view
        ) x
        group by x.student_id
      ) m
      join students s on s.id = m.student_id
      left join attendance a on a.session_id = sess and a.student_id = m.student_id
    ), '[]'::jsonb),
    -- The last 12 class days with a register, for the "Earlier classes" list.
    'recent', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.class_date desc)
      from (
        select cs.class_date,
               count(*) filter (where a.status = 'present') as present,
               count(*) filter (where a.status = 'late') as late,
               count(*) filter (where a.status = 'absent') as absent
        from class_sessions cs
        left join attendance a on a.session_id = cs.id
        where cs.batch_id = p_batch
        group by cs.class_date
        order by cs.class_date desc
        limit 12
      ) r
    ), '[]'::jsonb),
    'window', (select to_jsonb(w) from class_window() w)
  );
end $$;

CREATE FUNCTION public.batch_slots_clash() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform check_teacher_times(new.batch_id);
  return null;
end $$;

CREATE FUNCTION public.batch_slots_one_per_day() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if (select count(*) from batch_slots where batch_id = new.batch_id and weekday = new.weekday) > 1 then
    raise exception 'A batch can have only one class time on %. Remove the extra time, or make a second batch.',
      weekday_name(new.weekday);
  end if;
  return null;
end $$;

CREATE FUNCTION public.batches_clash() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform check_teacher_times(new.id);
  return null;
end $$;

CREATE FUNCTION public.bulk_import(p_rows jsonb, p_dry_run boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
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
end $_$;

CREATE FUNCTION public.check_teacher_times(p_batch uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  b record;
  c record;
begin
  select id, teacher_id, closed_on into b from batches where id = p_batch;
  if b.id is null or b.closed_on is not null then return; end if;
  -- One check at a time per teacher, so two saves at the same moment can't both slip through.
  perform pg_advisory_xact_lock(hashtext('teacher_times:' || b.teacher_id::text));

  select mine.weekday, mine.start_time, ob.code as their_code,
         t.first_name || coalesce(' ' || nullif(t.last_name, ''), '') as teacher
    into c
  from batch_slots mine
  join batch_slots other on other.weekday = mine.weekday and other.start_time = mine.start_time
   and other.batch_id <> mine.batch_id
  join batches ob on ob.id = other.batch_id and ob.teacher_id = b.teacher_id and ob.closed_on is null
  join teachers t on t.id = b.teacher_id
  where mine.batch_id = b.id
  order by mine.weekday, mine.start_time
  limit 1;

  if c.weekday is null then return; end if;
  raise exception '% already teaches % on % at %. Choose another time or another teacher.',
    c.teacher, c.their_code, weekday_name(c.weekday), to_char(c.start_time, 'HH24:MI');
end $$;

CREATE FUNCTION public.class_note_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- A note stays in the batch it was added to.
  if tg_op = 'UPDATE' then new.batch_id := old.batch_id; end if;
  if new.topic_id is not null and not exists (
       select 1 from batch_topics t where t.id = new.topic_id and t.batch_id = new.batch_id) then
    raise exception 'That topic is not in this batch''s lesson plan.';
  end if;
  if new.lesson_id is not null and not exists (
       select 1 from lessons l join batches b on b.subject_id = l.subject_id and b.year_group = l.year_group
       where l.id = new.lesson_id and b.id = new.batch_id) then
    raise exception 'That lesson is not in this batch''s lesson plan.';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_name := coalesce(
      (select s.full_name from staff s where s.id = auth.uid() and s.active),
      (select t.first_name || ' ' || t.last_name from teachers t where t.auth_user_id = auth.uid() and t.status <> 'left'),
      new.created_by_name);
    new.created_at := now();
  else
    -- Who added it and when never change.
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

CREATE FUNCTION public.class_window() RETURNS TABLE(before_minutes integer, after_minutes integer, late_minutes integer)
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select 15, 60, 10
$$;

CREATE FUNCTION public.complete_lesson(p_batch uuid, p_lesson uuid, p jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  lname text;
  picked uuid[];
  h record;
  hw jsonb;
  codes text[] := '{}';
  given int := 0;
begin
  select l.name into lname
  from lessons l join batches b on b.subject_id = l.subject_id and b.year_group = l.year_group
  where l.id = p_lesson and b.id = p_batch;
  if not found then raise exception 'That lesson is not part of this class''s plan.'; end if;

  select coalesce(array_agg(x::uuid), '{}') into picked from jsonb_array_elements_text(coalesce(p->'hw', '[]')) x;

  for h in
    select lh.id, lh.slot, lh.code, lh.drive_file_id, lh.url, lh.file_name
    from lesson_homework lh
    where lh.lesson_id = p_lesson and lh.id = any(picked)
      and not exists (select 1 from homework_sheets s where s.batch_id = p_batch and s.lesson_homework_id = lh.id)
    order by lh.slot
  loop
    if h.drive_file_id is null then
      raise exception '% has no worksheet yet. Upload it in the Lesson library first.', h.code;
    end if;
    -- This sheet's own maximum mark, if the form gave one (a blank box = no maximum); otherwise p.max_mark.
    hw := set_homework(p_batch, (coalesce(p, '{}') - 'hw' - 'max_marks')
      || case when coalesce(p->'max_marks', '{}') ? h.id::text
              then jsonb_build_object('max_mark', p->'max_marks'->(h.id::text)) else '{}' end
      || jsonb_build_object(
      'title', format('%s · Hw-%s (%s)', lname, h.slot, h.code),
      'lesson_homework_id', h.id,
      'files', jsonb_build_array(jsonb_build_object(
        'provider', 'google_drive', 'external_id', h.drive_file_id, 'url', h.url,
        'label', coalesce(h.file_name, h.code || '.pdf')))));
    codes := codes || h.code;
    given := (hw->>'students')::int;
  end loop;

  insert into batch_lessons (batch_id, lesson_id, status, completed_on)
  values (p_batch, p_lesson, 'complete', (now() at time zone 'Europe/London')::date)
  on conflict (batch_id, lesson_id) do update set status = excluded.status, completed_on = excluded.completed_on;

  return jsonb_build_object('codes', to_jsonb(codes), 'students', given);
end $$;

CREATE FUNCTION public.complete_topic(p_batch uuid, p_topic uuid, p jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  st topic_status;
  sent text;
  hw jsonb := '{}';
begin
  -- Locks the topic, so pressing Complete twice at once can't send its homework twice.
  select status into st from batch_topics where id = p_topic and batch_id = p_batch for update;
  if not found then raise exception 'Topic not found.'; end if;
  if st = 'complete' then raise exception 'This topic is already completed.'; end if;

  -- A topic that already sent homework (completed, undone, completed again) doesn't send it twice.
  select title into sent from homework_sheets where topic_id = p_topic;
  if sent is null then
    hw := set_homework(p_batch, coalesce(p, '{}') || jsonb_build_object('topic_id', p_topic));
  end if;

  update batch_topics set status = 'complete', completed_on = (now() at time zone 'Europe/London')::date
  where id = p_topic;
  return jsonb_build_object('already_sent', sent) || hw;
end $$;

CREATE FUNCTION public.current_student_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select s.id
  from students s
  left join login_current_student c on c.user_id = auth.uid() and c.student_id = s.id
  where s.auth_user_id = auth.uid() and s.status <> 'left'
  order by (c.student_id is not null) desc, s.first_name, s.last_name, s.id
  limit 1
$$;

CREATE FUNCTION public.current_teacher() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('id', id, 'first_name', first_name, 'last_name', last_name, 'subject_id', subject_id)
  from teachers where id = current_teacher_id()
$$;

CREATE FUNCTION public.current_teacher_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from teachers where auth_user_id = auth.uid() and status <> 'left'
$$;

CREATE FUNCTION public.enrolment_capacity_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  b batches%rowtype;
  taken int;
begin
  if new.batch_id is null or new.ended_on is not null then return new; end if;
  -- Already counted in this batch: nothing changes.
  if tg_op = 'UPDATE' and old.batch_id is not distinct from new.batch_id and old.ended_on is null then return new; end if;

  -- Lock the batch so two people saving at once can't both take the last place.
  select * into b from batches where id = new.batch_id for update;
  select count(*) into taken from enrolments
  where batch_id = new.batch_id and ended_on is null and id <> new.id;
  if taken >= b.capacity then
    raise exception 'Batch % is full (% of % places). Choose another batch or increase its places.', b.code, taken, b.capacity;
  end if;
  return new;
end $$;

CREATE FUNCTION public.enrolment_check() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare b batches%rowtype;
begin
  if new.batch_id is not null then
    select * into b from batches where id = new.batch_id;
    if b.subject_id <> new.subject_id then
      raise exception 'Batch % is for %, not %', b.code, b.subject_id, new.subject_id;
    end if;
    new.teacher_id := b.teacher_id;
  end if;
  return new;
end $$;

CREATE FUNCTION public.expected_classes(p_from date, p_to date) RETURNS TABLE(batch_id uuid, class_date date, start_time time without time zone, session_id uuid)
    LANGUAGE sql STABLE
    AS $$
  select b.id, d::date, s.start_time, cs.id
  from batches b
  join batch_slots s on s.batch_id = b.id
  cross join generate_series(greatest(p_from, b.started_on), least(p_to, coalesce(b.closed_on, p_to)), interval '1 day') d
  left join class_sessions cs on cs.batch_id = b.id and cs.class_date = d::date
  where extract(isodow from d) = s.weekday
    and exists (select 1 from enrolments e where e.batch_id = b.id and e.ended_on is null)
$$;

CREATE FUNCTION public.handin_page(p_code text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'first_name', s.first_name,
    'homework', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sheet_id', h.id, 'title', h.title, 'subject', sub.name,
        'set_on', h.set_on, 'due_on', h.due_on, 'max_mark', h.max_mark,
        'status', r.status::text, 'mark', r.mark,
        'files', (select count(*) from file_links f
                  where f.owner_type = 'homework_submission' and f.owner_id = h.id and f.student_id = s.id)
      ) order by coalesce(h.due_on, h.set_on) desc)
      from homework_sheets h
      join batches b on b.id = h.batch_id
      join subjects sub on sub.id = b.subject_id
      join homework_results r on r.sheet_id = h.id and r.student_id = s.id   -- given to this student
      where h.set_on >= current_date - 90
        and exists (select 1 from enrolments e
                    where e.student_id = s.id and e.batch_id = h.batch_id and e.ended_on is null)
    ), '[]'::jsonb)
  )
  from students s
  where s.handin_code = p_code and s.status <> 'left'
$$;

CREATE FUNCTION public.handin_record(p_code text, p_sheet uuid, p_file_id text, p_url text, p_label text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare sid uuid;
begin
  select s.id into sid
  from students s
  join homework_sheets h on h.id = p_sheet
  join enrolments e on e.student_id = s.id and e.batch_id = h.batch_id and e.ended_on is null
  join homework_results r on r.sheet_id = h.id and r.student_id = s.id
  where s.handin_code = p_code and s.status <> 'left';
  if sid is null then raise exception 'Link or homework not found'; end if;
  if p_file_id is null or p_file_id !~ '^[A-Za-z0-9_-]{10,200}$' then raise exception 'Not a Drive file id'; end if;

  -- One upload at a time per student and homework, so the count below can't be raced.
  perform 1 from homework_results where sheet_id = p_sheet and student_id = sid for update;
  if (select count(*) from file_links
      where owner_type = 'homework_submission' and owner_id = p_sheet and student_id = sid) >= 20 then
    raise exception 'Too many files for this homework';
  end if;

  -- p_url is no longer used: the address always points at the Drive file itself.
  insert into file_links (owner_type, owner_id, student_id, provider, external_id, url, label)
  values ('homework_submission', p_sheet, sid, 'google_drive', p_file_id,
          'https://drive.google.com/file/d/' || p_file_id || '/view', left(p_label, 200));

  update homework_results
    set status = case when status = 'marked' then 'marked'::homework_status else 'received'::homework_status end,
        received_on = coalesce(received_on, current_date)
  where sheet_id = p_sheet and student_id = sid;
end $_$;

CREATE FUNCTION public.handin_target(p_code text, p_sheet uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'title', h.title,
    'subject', sub.name,
    'folder_id', (select f.external_id from file_links f
                  where f.student_id = s.id and f.owner_type = 'student_folder' and f.provider = 'google_drive'),
    'files', (select count(*) from file_links f
              where f.owner_type = 'homework_submission' and f.owner_id = h.id and f.student_id = s.id)
  )
  from students s
  join homework_sheets h on h.id = p_sheet
  join batches b on b.id = h.batch_id
  join subjects sub on sub.id = b.subject_id
  where s.handin_code = p_code and s.status <> 'left'
    and exists (select 1 from enrolments e
                where e.student_id = s.id and e.batch_id = h.batch_id and e.ended_on is null)
    and exists (select 1 from homework_results r where r.sheet_id = h.id and r.student_id = s.id)
$$;

CREATE FUNCTION public.import_lessons(p_subject text, p_year smallint, p_lessons jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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

CREATE FUNCTION public.import_norm(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select nullif(regexp_replace(trim(coalesce(t, '')), '\s+', ' ', 'g'), '')
$$;

CREATE FUNCTION public.import_parse_times(t text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
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

CREATE FUNCTION public.import_times_label(slots jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select coalesce(string_agg((array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[(s->>'weekday')::int] || ' ' || (s->>'start_time'), ', '
                             order by (s->>'weekday')::int, s->>'start_time'), 'no times')
  from jsonb_array_elements(coalesce(slots, '[]')) s
$$;

CREATE FUNCTION public.import_year(t text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $_$
  select case
    when t is null then null
    when lower(t) ~ '^gcse\s*[-–]?\s*(h|higher)(\s*tier)?$' or lower(t) ~ '^higher(\s*tier)?$' then 11
    when lower(t) ~ '^gcse\s*[-–]?\s*(f|foundation)(\s*tier)?$' or lower(t) ~ '^foundation(\s*tier)?$' then 12
    when lower(t) ~ '^(year|yr|y)?\s*\d{1,2}$' then (regexp_match(t, '(\d{1,2})'))[1]::int
    else null end
$_$;

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from staff where id = auth.uid() and active and role = 'admin')
$$;

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from staff where id = auth.uid() and active)
$$;

CREATE FUNCTION public.join_class(p_batch uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  sid uuid := current_student_id();
  link text;
  result text;
  problem text;
begin
  if sid is null then raise exception 'Only a student login can join a class here.'; end if;

  select b.class_link into link
  from batches b
  join enrolments e on e.batch_id = b.id
  where b.id = p_batch and b.closed_on is null and e.student_id = sid and e.ended_on is null;
  if not found then raise exception 'This is not one of your classes.'; end if;
  if link is null then return jsonb_build_object('link', null, 'attendance', 'no_link'); end if;

  begin
    result := record_class_join(p_batch, sid, now());
  exception when others then
    result := 'error';
    problem := sqlerrm;
  end;
  return jsonb_build_object('link', link, 'attendance', result, 'problem', problem);
end $$;

CREATE FUNCTION public.login_kind_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

CREATE FUNCTION public.move_curriculum_topic(p_id uuid, p_direction text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  t curriculum_topics%rowtype;
  n curriculum_topics%rowtype;
begin
  if not is_admin() then raise exception 'Not allowed'; end if;
  if p_direction not in ('up', 'down') then raise exception 'Direction must be up or down'; end if;

  select * into t from curriculum_topics where id = p_id;
  if not found then raise exception 'Topic not found'; end if;

  select * into n from curriculum_topics
  where subject_id = t.subject_id
    and year_group is not distinct from t.year_group
    and case when p_direction = 'up' then position < t.position else position > t.position end
  order by case when p_direction = 'up' then -position else position end
  limit 1;
  if not found then return; end if; -- already first or last

  -- Park the topic at -1 first so the two never share a position (positions must be unique).
  update curriculum_topics set position = -1 where id = t.id;
  update curriculum_topics set position = t.position where id = n.id;
  update curriculum_topics set position = n.position where id = t.id;
end $$;

CREATE FUNCTION public.my_batch_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from batches where closed_on is null and teacher_id = current_teacher_id()
$$;

CREATE FUNCTION public.my_class_note_file(p_note uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('provider', n.provider, 'external_id', n.external_id, 'url', n.url,
                            'label', coalesce(n.file_name, n.title))
  from class_notes n
  where n.id = p_note and n.provider is not null
    and exists (select 1 from enrolments e
                where e.batch_id = n.batch_id and e.ended_on is null and e.student_id = current_student_id())
$$;

CREATE FUNCTION public.my_class_notes() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id,
           'title', n.title,
           'body', n.body,
           'created_at', n.created_at,
           'batch_id', b.id,
           'subject', sj.name,
           'topic', coalesce(l.code || ' ' || l.name, t.name),
           'has_file', n.provider is not null,
           'is_link', n.provider = 'external_link',
           'file_name', n.file_name
         ) order by n.created_at desc, n.title), '[]'::jsonb)
  from class_notes n
  join batches b on b.id = n.batch_id
  join subjects sj on sj.id = b.subject_id
  left join lessons l on l.id = n.lesson_id
  left join batch_topics t on t.id = n.topic_id
  where exists (select 1 from enrolments e
                where e.batch_id = n.batch_id and e.ended_on is null and e.student_id = current_student_id())
$$;

CREATE FUNCTION public.my_dashboard() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with me as (select * from students where id = current_student_id()),
  -- Homework from the last 90 days given to the student, in the classes they are in now (same rule as My homework).
  hw as (
    select h.id, h.title, sub.name as subject, h.batch_id, h.due_on, h.max_mark,
           r.status::text as status, r.mark, r.marked_on
    from me
    join enrolments e on e.student_id = me.id and e.ended_on is null
    join homework_sheets h on h.batch_id = e.batch_id and h.set_on >= current_date - 90
    join subjects sub on sub.id = e.subject_id
    join homework_results r on r.sheet_id = h.id and r.student_id = me.id   -- given to this student
  )
  select jsonb_build_object(
    'first_name', me.first_name,
    'last_name', me.last_name,
    'code', me.code,
    'year_group', me.year_group,
    'school', me.school,
    -- The check-in times around each class (minutes before, after, and late after), for the words by Join class.
    'class_window', (select to_jsonb(w) from class_window() w),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', sub.name,
        'batch_id', b.id,
        'batch_code', b.code,
        'teacher', nullif(concat_ws(' ', t.first_name, t.last_name), ''),
        'class_year', b.year_group,
        'started_on', e.started_on,
        'times', coalesce((select jsonb_agg(jsonb_build_object('weekday', bs.weekday, 'start_time', bs.start_time)
                                            order by bs.weekday, bs.start_time)
                           from batch_slots bs where bs.batch_id = b.id), '[]'::jsonb),
        'to_do', (select count(*) from hw where hw.batch_id = b.id and hw.status = 'pending'),
        'marked', (select count(*) from hw where hw.batch_id = b.id and hw.status = 'marked'),
        -- The lesson plan topic the class is on: the first In progress, otherwise the next Not started.
        'topic', (select bt.name from batch_topics bt
                  where bt.batch_id = b.id and bt.status <> 'complete'
                  order by (bt.status = 'in_progress') desc, bt.position limit 1),
        'topic_started', exists (select 1 from batch_topics bt where bt.batch_id = b.id and bt.status = 'in_progress'),
        -- "Join class" shows when the open batch has a link. Attendance: the last 12 weeks in this batch.
        'has_class_link', coalesce(b.class_link is not null and b.closed_on is null, false),
        'attendance', case when b.id is null then null else attendance_totals(me.id, b.id) end
      ) order by sub.sort, sub.name)
      from enrolments e
      join subjects sub on sub.id = e.subject_id
      left join batches b on b.id = e.batch_id
      left join teachers t on t.id = e.teacher_id
      where e.student_id = me.id and e.ended_on is null
    ), '[]'::jsonb),
    'homework', jsonb_build_object(
      'to_do', (select count(*) from hw where status = 'pending'),
      'overdue', (select count(*) from hw where status = 'pending' and due_on < current_date),
      'handed_in', (select count(*) from hw where status = 'received'),
      'recently_marked', coalesce((
        select jsonb_agg(x order by x.marked_on desc)
        from (select title, subject, mark, max_mark, marked_on from hw
              where status = 'marked' and marked_on >= current_date - 14
              order by marked_on desc limit 3) x
      ), '[]'::jsonb)
    )
  )
  from me
$$;

CREATE FUNCTION public.my_handin_target(p_sheet uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select handin_target(s.handin_code, p_sheet) from students s where s.id = current_student_id()
$$;

CREATE FUNCTION public.my_homework() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

CREATE FUNCTION public.my_homework_file(p_file uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

CREATE FUNCTION public.my_lesson_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select l.id from lessons l join batches b on b.subject_id = l.subject_id and b.year_group = l.year_group
  where b.closed_on is null and b.teacher_id = current_teacher_id()
$$;

CREATE FUNCTION public.my_sheet_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from homework_sheets where batch_id in (select my_batch_ids())
$$;

CREATE FUNCTION public.my_sheet_students() RETURNS TABLE(sheet_id uuid, student_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select h.id, e.student_id from homework_sheets h
  join enrolments e on e.batch_id = h.batch_id and e.ended_on is null
  where h.batch_id in (select my_batch_ids())
$$;

CREATE FUNCTION public.my_student_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select distinct e.student_id from enrolments e
  where e.ended_on is null and e.batch_id in (select my_batch_ids())
$$;

CREATE FUNCTION public.my_students() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'first_name', s.first_name, 'last_name', s.last_name,
           'current', s.id = current_student_id()
         ) order by s.first_name, s.last_name), '[]'::jsonb)
  from students s
  where s.auth_user_id = auth.uid() and s.status <> 'left'
$$;

CREATE FUNCTION public.record_class_join(p_batch uuid, p_student uuid, p_at timestamp with time zone DEFAULT now()) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  w record;
  at_uk timestamp := p_at at time zone 'Europe/London';   -- class times are UK times
  today date := (p_at at time zone 'Europe/London')::date;
  slot time;
  sess uuid;
  new_status attendance_status;
  was_source attendance_source;
begin
  select * into w from class_window();

  -- Today's class time whose window we are in (the nearest one, if a batch has two classes close together).
  select bs.start_time into slot
  from batch_slots bs
  where bs.batch_id = p_batch and bs.weekday = extract(isodow from today)::int
    and at_uk >= (today + bs.start_time) - make_interval(mins => w.before_minutes)
    and at_uk <= (today + bs.start_time) + make_interval(mins => w.after_minutes)
  order by abs(extract(epoch from at_uk - (today + bs.start_time)))
  limit 1;
  if slot is null then return 'outside'; end if;

  -- That day's register. The first join creates it and puts everyone in the batch on it as "did not join".
  insert into class_sessions (batch_id, class_date, start_time, received_via)
  values (p_batch, today, slot, 'other')
  on conflict (batch_id, class_date) do nothing
  returning id into sess;
  if sess is not null then
    insert into attendance (session_id, student_id, status, source, updated_at)
    select sess, e.student_id, 'absent', 'auto', p_at
    from enrolments e
    where e.batch_id = p_batch and e.ended_on is null and e.started_on <= today
    on conflict (session_id, student_id) do nothing;
  else
    select id into sess from class_sessions where batch_id = p_batch and class_date = today;
  end if;

  new_status := case when at_uk > (today + slot) + make_interval(mins => w.late_minutes)
                     then 'late' else 'present' end;
  select source into was_source from attendance where session_id = sess and student_id = p_student;

  -- First press counts. An entry set by staff or a teacher, or an earlier press, keeps its status;
  -- only the join time is filled in if it was empty.
  insert into attendance as a (session_id, student_id, status, source, joined_at, updated_at)
  values (sess, p_student, new_status, 'link', p_at, p_at)
  on conflict (session_id, student_id) do update set
    status = case when a.source = 'auto' then excluded.status else a.status end,
    source = case when a.source = 'auto' then 'link'::attendance_source else a.source end,
    updated_at = case when a.source = 'auto' then excluded.updated_at else a.updated_at end,
    joined_at = coalesce(a.joined_at, excluded.joined_at);

  return case when was_source is null or was_source = 'auto' then new_status::text else 'already' end;
end $$;

CREATE FUNCTION public.save_batch(p jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  bid uuid := nullif(p->>'id', '')::uuid;
  tid uuid := nullif(p->>'teacher_id', '')::uuid;
begin
  if not is_staff() then raise exception 'Only staff can add or change batches.'; end if;
  if tid is null then raise exception 'Choose a teacher.'; end if;

  if bid is null then
    -- Creating the batch also copies the subject's curriculum into its lesson plan (a trigger).
    insert into batches (subject_id, year_group, teacher_id, capacity, started_on, name)
    values (p->>'subject_id', (p->>'year_group')::smallint, tid, (p->>'capacity')::smallint,
            coalesce(nullif(p->>'started_on', '')::date, (now() at time zone 'Europe/London')::date),
            nullif(trim(p->>'name'), ''))
    returning id into bid;
  else
    if not exists (select 1 from batches where id = bid) then raise exception 'Batch not found.'; end if;
    delete from batch_slots where batch_id = bid;
    -- Fewer places than students already in the batch is refused here, with a message (batches_capacity).
    update batches
    set teacher_id = tid, capacity = (p->>'capacity')::smallint,
        started_on = coalesce(nullif(p->>'started_on', '')::date, started_on), name = nullif(trim(p->>'name'), '')
    where id = bid;
    if not found then raise exception 'Batch not found.'; end if;
    -- Students in the batch follow its teacher (the enrolment trigger copies the teacher from the batch).
    update enrolments set teacher_id = tid where batch_id = bid and ended_on is null and teacher_id is distinct from tid;
  end if;

  -- Each new time is checked against the teacher's other open batches (batch_slots_clash).
  insert into batch_slots (batch_id, weekday, start_time)
  select distinct bid, (s->>'weekday')::smallint, (s->>'start_time')::time
  from jsonb_array_elements(coalesce(p->'slots', '[]')) s;

  return bid;
end $$;

CREATE FUNCTION public.save_register(p_batch uuid, p_date date, p_marks jsonb) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  today date := (now() at time zone 'Europe/London')::date;
  sess uuid;
  changed int := 0;
  n int;
  mk record;
  was record;
begin
  if not (is_staff() or teaches_batch(p_batch)) then
    raise exception 'You can only take the register for your own batches.';
  end if;
  if p_date is null then raise exception 'Choose the class date.'; end if;
  if p_date > today then raise exception 'The register can''t be taken for a date in the future.'; end if;
  if jsonb_typeof(p_marks) is distinct from 'array' or jsonb_array_length(p_marks) = 0 then
    raise exception 'Mark at least one student first.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_marks) m
             where coalesce(m->>'status', '') not in ('present', 'late', 'absent')) then
    raise exception 'Each student must be Present, Late or Absent.';
  end if;

  select id into sess from class_sessions where batch_id = p_batch and class_date = p_date;

  -- Everyone marked must have been in the batch on that date, or already be on that day's register.
  if exists (
    select 1 from jsonb_array_elements(p_marks) m
    where not exists (select 1 from enrolments e
                      where e.batch_id = p_batch and e.student_id = (m->>'student_id')::uuid
                        and e.started_on <= p_date and (e.ended_on is null or e.ended_on >= p_date))
      and not exists (select 1 from attendance a
                      where a.session_id = sess and a.student_id = (m->>'student_id')::uuid)) then
    raise exception 'One of the students was not in this batch on that date.';
  end if;

  if sess is null then
    insert into class_sessions (batch_id, class_date, start_time, received_via, logged_by)
    values (p_batch, p_date,
            (select min(start_time) from batch_slots where batch_id = p_batch and weekday = extract(isodow from p_date)::int),
            'other', (select id from staff where id = auth.uid()))
    returning id into sess;
  end if;

  for mk in
    select distinct on ((x->>'student_id')::uuid) (x->>'student_id')::uuid as student_id,
           (x->>'status')::attendance_status as status, nullif(trim(coalesce(x->>'reason', '')), '') as reason
    from jsonb_array_elements(p_marks) x
  loop
    select a.status, a.source into was from attendance a where a.session_id = sess and a.student_id = mk.student_id;
    if was.status is not null and was.status <> mk.status and was.source in ('staff', 'link') and mk.reason is null then
      raise exception 'Give a reason for changing % to %.',
        (select first_name || ' ' || last_name from students where id = mk.student_id),
        initcap(mk.status::text);
    end if;
    if length(mk.reason) > 300 then raise exception 'Keep each reason under 300 characters.'; end if;
    perform set_config('pm.attendance_reason', coalesce(mk.reason, ''), true);   -- read by attendance_log
    insert into attendance as a (session_id, student_id, status)
    values (sess, mk.student_id, mk.status)
    on conflict (session_id, student_id) do update set status = excluded.status
    where a.status is distinct from excluded.status or a.source <> 'staff';   -- ticking a check-in confirms it
    get diagnostics n = row_count;
    changed := changed + n;
  end loop;
  perform set_config('pm.attendance_reason', '', true);
  return changed;
end $$;

CREATE FUNCTION public.save_student(p jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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

CREATE FUNCTION public.seed_batch_topics() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  insert into batch_topics (batch_id, position, name, status)
  select new.id, row_number() over (order by coalesce(ct.year_group, 0) desc, ct.position),
         ct.name, 'not_started'
  from curriculum_topics ct
  where ct.subject_id = new.subject_id and (ct.year_group is null or ct.year_group = new.year_group);
  return new;
end $$;

CREATE FUNCTION public.set_homework(p_batch uuid, p jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  sid uuid;
  given int;
begin
  if coalesce(trim(p->>'title'), '') = '' then raise exception 'Enter a homework title.'; end if;

  insert into homework_sheets (batch_id, title, set_on, due_on, max_mark, topic_id, lesson_homework_id)
  values (p_batch, trim(p->>'title'),
          coalesce(nullif(p->>'set_on', '')::date, (now() at time zone 'Europe/London')::date),
          nullif(p->>'due_on', '')::date, nullif(p->>'max_mark', '')::numeric,
          nullif(p->>'topic_id', '')::uuid, nullif(p->>'lesson_homework_id', '')::uuid)
  returning id into sid;

  -- One "not handed in" result for each student in the batch now. This row is what gives a student the
  -- homework, so students who join later don't get it (staff can still give it with "Give homework").
  insert into homework_results (sheet_id, student_id)
  select sid, e.student_id from enrolments e where e.batch_id = p_batch and e.ended_on is null;
  get diagnostics given = row_count;

  -- The worksheet: files the app already uploaded to Google Drive, and/or a pasted link.
  insert into file_links (owner_type, owner_id, provider, external_id, url, label)
  select 'homework_sheet', sid, (f->>'provider')::file_provider, nullif(f->>'external_id', ''),
         nullif(f->>'url', ''), nullif(f->>'label', '')
  from jsonb_array_elements(coalesce(p->'files', '[]')) f;

  return jsonb_build_object('sheet_id', sid, 'students', given);
end $$;

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at = now(); return new; end $$;

CREATE FUNCTION public.student_drive_folder(p_student uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not (is_staff() or teaches_student(p_student)) then raise exception 'Not allowed'; end if;
  return (select external_id from file_links
          where student_id = p_student and owner_type = 'student_folder' and provider = 'google_drive');
end $$;

CREATE FUNCTION public.student_left_release_places() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status = 'left' and old.status is distinct from 'left' then
    update enrolments set batch_id = null where student_id = new.id and ended_on is null;
    new.left_on := coalesce(new.left_on, current_date);
  elsif new.status <> 'left' then
    new.left_on := null;
  end if;
  return new;
end $$;

CREATE FUNCTION public.student_private(p_student uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('date_of_birth', date_of_birth, 'handin_code', handin_code)
  from students where id = p_student and is_staff()
$$;

CREATE FUNCTION public.switch_student(p_student uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from students where id = p_student and auth_user_id = auth.uid() and status <> 'left') then
    raise exception 'Not your student';
  end if;
  insert into login_current_student (user_id, student_id) values (auth.uid(), p_student)
  on conflict (user_id) do update set student_id = excluded.student_id, updated_at = now();
end $$;

CREATE FUNCTION public.teaches_batch(p_batch uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from batches where id = p_batch and closed_on is null and teacher_id = current_teacher_id())
$$;

CREATE FUNCTION public.teaches_lesson(p_lesson uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from lessons l join batches b on b.subject_id = l.subject_id and b.year_group = l.year_group
    where l.id = p_lesson and b.closed_on is null and b.teacher_id = current_teacher_id())
$$;

CREATE FUNCTION public.teaches_sheet(p_sheet uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from homework_sheets where id = p_sheet and teaches_batch(batch_id))
$$;

CREATE FUNCTION public.teaches_sheet_student(p_sheet uuid, p_student uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from homework_sheets where id = p_sheet and teaches_student_in_batch(batch_id, p_student))
$$;

CREATE FUNCTION public.teaches_student(p_student uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from enrolments e join batches b on b.id = e.batch_id
    where e.student_id = p_student and e.ended_on is null and b.closed_on is null and b.teacher_id = current_teacher_id())
$$;

CREATE FUNCTION public.teaches_student_in_batch(p_batch uuid, p_student uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select teaches_batch(p_batch) and exists (
    select 1 from enrolments where batch_id = p_batch and student_id = p_student and ended_on is null)
$$;

CREATE FUNCTION public.weekday_name(d integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select (array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])[d]
$$;

CREATE FUNCTION public.year_label(y integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case when y = 11 then 'GCSE - H' when y = 12 then 'GCSE - F' when y is null then null else 'Year ' || y end
$$;

SET LOCAL default_tablespace = '';

SET LOCAL default_table_access_method = heap;


-- ==============================================================================================================
-- 3. Tables, sequences and views
-- ==============================================================================================================

CREATE TABLE public.attendance (
    session_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status public.attendance_status NOT NULL,
    source public.attendance_source DEFAULT 'staff'::public.attendance_source NOT NULL,
    joined_at timestamp with time zone,
    marked_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.attendance_changes (
    id bigint NOT NULL,
    session_id uuid NOT NULL,
    student_id uuid NOT NULL,
    old_status public.attendance_status,
    old_source public.attendance_source,
    new_status public.attendance_status NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    CONSTRAINT attendance_changes_reason_check CHECK (((reason IS NULL) OR (length(reason) <= 300)))
);

ALTER TABLE public.attendance_changes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.attendance_changes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE SEQUENCE public.batch_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.batch_lessons (
    batch_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    status public.topic_status DEFAULT 'not_started'::public.topic_status NOT NULL,
    started_on date,
    completed_on date
);

CREATE TABLE public.batch_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    weekday smallint NOT NULL,
    start_time time without time zone NOT NULL,
    CONSTRAINT batch_slots_weekday_check CHECK (((weekday >= 1) AND (weekday <= 7)))
);

CREATE TABLE public.batch_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    "position" smallint NOT NULL,
    name text NOT NULL,
    status public.topic_status DEFAULT 'not_started'::public.topic_status NOT NULL,
    completed_on date
);

CREATE TABLE public.batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text DEFAULT ('B-'::text || lpad((nextval('public.batch_code_seq'::regclass))::text, 3, '0'::text)) NOT NULL,
    subject_id text NOT NULL,
    year_group smallint NOT NULL,
    teacher_id uuid NOT NULL,
    capacity smallint DEFAULT 3 NOT NULL,
    started_on date DEFAULT CURRENT_DATE NOT NULL,
    closed_on date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    class_link text,
    class_link_updated_at timestamp with time zone,
    class_link_updated_by uuid,
    google_course_id text,
    CONSTRAINT batches_capacity_check CHECK (((capacity >= 1) AND (capacity <= 12))),
    CONSTRAINT batches_class_link_check CHECK (((class_link IS NULL) OR ((length(class_link) <= 500) AND (class_link ~ '^https://(classroom|meet)\.google\.com/[^[:space:]]*$'::text)))),
    CONSTRAINT batches_year_group_check CHECK (((year_group >= 1) AND (year_group <= 12)))
);

CREATE TABLE public.class_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    class_date date NOT NULL,
    start_time time without time zone,
    topic_id uuid,
    topic_status_after public.topic_status,
    received_via public.update_channel DEFAULT 'whatsapp'::public.update_channel NOT NULL,
    notes text,
    logged_by uuid,
    logged_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.enrolments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    subject_id text NOT NULL,
    teacher_id uuid,
    batch_id uuid,
    started_on date DEFAULT CURRENT_DATE NOT NULL,
    ended_on date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.homework_results (
    sheet_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status public.homework_status DEFAULT 'pending'::public.homework_status NOT NULL,
    mark numeric(6,2),
    received_on date,
    marked_on date,
    CONSTRAINT homework_results_mark_check CHECK ((mark >= (0)::numeric))
);

CREATE TABLE public.homework_sheets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    session_id uuid,
    title text NOT NULL,
    set_on date NOT NULL,
    due_on date,
    max_mark numeric(6,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    topic_id uuid,
    lesson_homework_id uuid,
    CONSTRAINT homework_sheets_max_mark_check CHECK ((max_mark > (0)::numeric))
);

CREATE SEQUENCE public.student_code_seq
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text DEFAULT ('PM-'::text || (nextval('public.student_code_seq'::regclass))::text) NOT NULL,
    family_id uuid,
    first_name text NOT NULL,
    last_name text NOT NULL,
    year_group smallint NOT NULL,
    school text,
    date_of_birth date,
    status public.student_status DEFAULT 'active'::public.student_status NOT NULL,
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    left_on date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    handin_code text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    auth_user_id uuid,
    CONSTRAINT students_year_group_check CHECK (((year_group >= 1) AND (year_group <= 12)))
);

CREATE TABLE public.subjects (
    id text NOT NULL,
    name text NOT NULL,
    sort smallint DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.teacher_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.teachers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text DEFAULT ('T'::text || lpad((nextval('public.teacher_code_seq'::regclass))::text, 3, '0'::text)) NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    personal_email public.citext,
    phone text,
    subject_id text,
    year_min smallint,
    year_max smallint,
    status public.teacher_status DEFAULT 'active'::public.teacher_status NOT NULL,
    joined_on date,
    notes text,
    auth_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT teachers_year_max_check CHECK (((year_max >= 1) AND (year_max <= 12))),
    CONSTRAINT teachers_year_min_check CHECK (((year_min >= 1) AND (year_min <= 12)))
);

CREATE VIEW public.batch_list WITH (security_invoker='true') AS
 WITH members AS (
         SELECT e.batch_id,
            count(*) AS member_count,
            string_agg((st.first_name || COALESCE(((' '::text || NULLIF("left"(st.last_name, 1), ''::text)) || '.'::text), ''::text)), ', '::text ORDER BY st.first_name) AS members
           FROM (public.enrolments e
             JOIN public.students st ON ((st.id = e.student_id)))
          WHERE (e.ended_on IS NULL)
          GROUP BY e.batch_id
        ), slots AS (
         SELECT batch_slots.batch_id,
            string_agg((((ARRAY['Mon'::text, 'Tue'::text, 'Wed'::text, 'Thu'::text, 'Fri'::text, 'Sat'::text, 'Sun'::text])[batch_slots.weekday] || ' '::text) || to_char((batch_slots.start_time)::interval, 'HH24:MI'::text)), ', '::text ORDER BY batch_slots.weekday) AS schedule
           FROM public.batch_slots
          GROUP BY batch_slots.batch_id
        ), topics AS (
         SELECT batch_topics.batch_id,
            count(*) FILTER (WHERE (batch_topics.status = 'complete'::public.topic_status)) AS topics_done,
            count(*) AS topics_total
           FROM public.batch_topics
          GROUP BY batch_topics.batch_id
        ), classes AS (
         SELECT class_sessions.batch_id,
            max(class_sessions.class_date) AS last_class_on
           FROM public.class_sessions
          GROUP BY class_sessions.batch_id
        ), marking AS (
         SELECT h.batch_id,
            count(*) AS to_mark
           FROM (public.homework_results r
             JOIN public.homework_sheets h ON ((h.id = r.sheet_id)))
          WHERE (r.status = 'received'::public.homework_status)
          GROUP BY h.batch_id
        )
 SELECT b.id,
    b.code,
    b.subject_id,
    sub.name AS subject,
    b.year_group,
    b.teacher_id,
    ((t.first_name || ' '::text) || t.last_name) AS teacher,
    b.capacity,
    b.started_on,
    b.closed_on,
    COALESCE(m.member_count, (0)::bigint) AS member_count,
    m.members,
    sl.schedule,
    COALESCE(tp.topics_done, (0)::bigint) AS topics_done,
    COALESCE(tp.topics_total, (0)::bigint) AS topics_total,
    c.last_class_on,
    COALESCE(mk.to_mark, (0)::bigint) AS to_mark,
    b.name,
    b.created_at,
    b.updated_at
   FROM (((((((public.batches b
     JOIN public.subjects sub ON ((sub.id = b.subject_id)))
     LEFT JOIN public.teachers t ON ((t.id = b.teacher_id)))
     LEFT JOIN members m ON ((m.batch_id = b.id)))
     LEFT JOIN slots sl ON ((sl.batch_id = b.id)))
     LEFT JOIN topics tp ON ((tp.batch_id = b.id)))
     LEFT JOIN classes c ON ((c.batch_id = b.id)))
     LEFT JOIN marking mk ON ((mk.batch_id = b.id)));

CREATE TABLE public.class_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    topic_id uuid,
    lesson_id uuid,
    provider public.file_provider,
    external_id text,
    url text,
    file_name text,
    created_by uuid DEFAULT auth.uid(),
    created_by_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_notes_body_check CHECK (((body IS NULL) OR (length(body) <= 5000))),
    CONSTRAINT class_notes_file CHECK ((((provider IS NULL) AND (external_id IS NULL) AND (url IS NULL) AND (file_name IS NULL)) OR ((provider = 'google_drive'::public.file_provider) AND (external_id IS NOT NULL)) OR ((provider = 'external_link'::public.file_provider) AND (url ~* '^https?://\S+$'::text)))),
    CONSTRAINT class_notes_not_empty CHECK (((provider IS NOT NULL) OR (length(btrim(COALESCE(body, ''::text))) > 0))),
    CONSTRAINT class_notes_one_topic CHECK (((topic_id IS NULL) OR (lesson_id IS NULL))),
    CONSTRAINT class_notes_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 200)))
);

CREATE TABLE public.curriculum_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id text NOT NULL,
    year_group smallint,
    "position" smallint NOT NULL,
    name text NOT NULL,
    CONSTRAINT curriculum_topics_year_group_check CHECK (((year_group >= 1) AND (year_group <= 12)))
);

CREATE TABLE public.drive_folders (
    key text NOT NULL,
    folder_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.enquiry_code_seq
    START WITH 201
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.enquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text DEFAULT ('E-'::text || (nextval('public.enquiry_code_seq'::regclass))::text) NOT NULL,
    child_first_name text NOT NULL,
    child_last_name text NOT NULL,
    year_group smallint NOT NULL,
    school text,
    source text,
    parent_name text NOT NULL,
    parent_relationship text,
    parent_phone text,
    parent_email public.citext,
    stage public.enquiry_stage DEFAULT 'new'::public.enquiry_stage NOT NULL,
    stage_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_group_created boolean DEFAULT false NOT NULL,
    assessment_score numeric(5,2),
    assessment_comments text,
    student_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT enquiries_assessment_score_check CHECK (((assessment_score >= (0)::numeric) AND (assessment_score <= (100)::numeric))),
    CONSTRAINT enquiries_year_group_check CHECK (((year_group >= 1) AND (year_group <= 12)))
);

CREATE TABLE public.enquiry_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    enquiry_id uuid NOT NULL,
    stage public.enquiry_stage NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    by_staff uuid
);

CREATE TABLE public.enquiry_subjects (
    enquiry_id uuid NOT NULL,
    subject_id text NOT NULL
);

CREATE TABLE public.families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    display_name text NOT NULL,
    whatsapp_group_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.file_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_type text NOT NULL,
    owner_id uuid NOT NULL,
    student_id uuid,
    provider public.file_provider DEFAULT 'external_link'::public.file_provider NOT NULL,
    external_id text,
    url text,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT file_links_check CHECK (((url IS NOT NULL) OR (external_id IS NOT NULL))),
    CONSTRAINT file_links_owner_type_check CHECK ((owner_type = ANY (ARRAY['student_folder'::text, 'homework_submission'::text, 'homework_sheet'::text, 'homework_correction'::text, 'assessment'::text])))
);

CREATE TABLE public.guardians (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    full_name text NOT NULL,
    relationship text,
    phone text,
    email public.citext,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.homework_markups (
    sheet_id uuid NOT NULL,
    student_id uuid NOT NULL,
    source_file_id uuid NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid DEFAULT auth.uid(),
    draft_file_id text,
    draft_name text,
    draft_mark numeric(6,2),
    draft_saved_at timestamp with time zone,
    CONSTRAINT homework_markups_draft_mark_check CHECK ((draft_mark >= (0)::numeric))
);

CREATE TABLE public.lesson_homework (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    slot smallint NOT NULL,
    code text NOT NULL,
    drive_file_id text,
    url text,
    file_name text,
    uploaded_at timestamp with time zone,
    CONSTRAINT lesson_homework_slot_check CHECK (((slot >= 1) AND (slot <= 3)))
);

CREATE TABLE public.lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id text NOT NULL,
    year_group smallint NOT NULL,
    term smallint NOT NULL,
    module text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "position" smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lessons_term_check CHECK (((term >= 1) AND (term <= 3))),
    CONSTRAINT lessons_year_group_check CHECK (((year_group >= 1) AND (year_group <= 12)))
);

CREATE TABLE public.login_current_student (
    user_id uuid NOT NULL,
    student_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.staff (
    id uuid NOT NULL,
    full_name text NOT NULL,
    email public.citext NOT NULL,
    role public.staff_role DEFAULT 'operations'::public.staff_role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE VIEW public.student_list AS
SELECT
    NULL::uuid AS id,
    NULL::text AS code,
    NULL::text AS first_name,
    NULL::text AS last_name,
    NULL::smallint AS year_group,
    NULL::text AS school,
    NULL::public.student_status AS status,
    NULL::date AS start_date,
    NULL::text[] AS subject_ids,
    NULL::text AS subjects,
    NULL::uuid[] AS teacher_ids,
    NULL::text AS teachers,
    NULL::text AS batches,
    NULL::boolean AS missing_teacher,
    NULL::boolean AS missing_batch,
    NULL::numeric AS attendance_pct,
    NULL::numeric AS homework_pct,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS updated_at;

CREATE TABLE public.student_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    category public.note_category DEFAULT 'general'::public.note_category NOT NULL,
    body text NOT NULL,
    author_id uuid,
    author_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE VIEW public.student_stats WITH (security_invoker='true') AS
 SELECT id AS student_id,
    ( SELECT round(((100.0 * (count(*) FILTER (WHERE (a.status <> 'absent'::public.attendance_status)))::numeric) / (NULLIF(count(*), 0))::numeric)) AS round
           FROM (public.attendance a
             JOIN public.class_sessions cs ON ((cs.id = a.session_id)))
          WHERE ((a.student_id = s.id) AND (cs.class_date >= (CURRENT_DATE - 28)) AND (NOT ((a.source = 'auto'::public.attendance_source) AND (((cs.class_date + COALESCE(cs.start_time, '00:00:00'::time without time zone)) + make_interval(mins => ( SELECT class_window.after_minutes
                   FROM public.class_window() class_window(before_minutes, after_minutes, late_minutes)))) > (now() AT TIME ZONE 'Europe/London'::text)))))) AS attendance_pct,
    ( SELECT round(((100.0 * (count(*) FILTER (WHERE (r.status = ANY (ARRAY['received'::public.homework_status, 'marked'::public.homework_status]))))::numeric) / (NULLIF(count(*), 0))::numeric)) AS round
           FROM (public.homework_results r
             JOIN public.homework_sheets h ON ((h.id = r.sheet_id)))
          WHERE ((r.student_id = s.id) AND (h.set_on >= (CURRENT_DATE - 28)) AND (COALESCE(h.due_on, h.set_on) < CURRENT_DATE) AND (r.status <> 'excused'::public.homework_status))) AS homework_pct,
    ( SELECT max(cs.class_date) AS max
           FROM (public.attendance a
             JOIN public.class_sessions cs ON ((cs.id = a.session_id)))
          WHERE (a.student_id = s.id)) AS last_class_on
   FROM public.students s;

CREATE VIEW public.teacher_list WITH (security_invoker='true') AS
 SELECT t.id,
    t.code,
    t.first_name,
    t.last_name,
    t.personal_email,
    t.phone,
    t.subject_id,
    sub.name AS subject,
    t.year_min,
    t.year_max,
    t.status,
    t.joined_on,
    ( SELECT count(*) AS count
           FROM public.batches b
          WHERE ((b.teacher_id = t.id) AND (b.closed_on IS NULL))) AS batch_count,
    ( SELECT count(DISTINCT e.student_id) AS count
           FROM (public.enrolments e
             JOIN public.students s ON ((s.id = e.student_id)))
          WHERE ((e.teacher_id = t.id) AND (e.ended_on IS NULL) AND (s.status <> 'left'::public.student_status))) AS student_count,
    t.created_at,
    t.updated_at
   FROM (public.teachers t
     LEFT JOIN public.subjects sub ON ((sub.id = t.subject_id)));


-- ==============================================================================================================
-- 4. Keys and checks
-- ==============================================================================================================

ALTER TABLE ONLY public.attendance_changes
    ADD CONSTRAINT attendance_changes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (session_id, student_id);

ALTER TABLE ONLY public.batch_lessons
    ADD CONSTRAINT batch_lessons_pkey PRIMARY KEY (batch_id, lesson_id);

ALTER TABLE ONLY public.batch_slots
    ADD CONSTRAINT batch_slots_batch_id_weekday_start_time_key UNIQUE (batch_id, weekday, start_time);

ALTER TABLE ONLY public.batch_slots
    ADD CONSTRAINT batch_slots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.batch_topics
    ADD CONSTRAINT batch_topics_batch_id_position_key UNIQUE (batch_id, "position");

ALTER TABLE ONLY public.batch_topics
    ADD CONSTRAINT batch_topics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_code_key UNIQUE (code);

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.class_notes
    ADD CONSTRAINT class_notes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_batch_id_class_date_key UNIQUE (batch_id, class_date);

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_subject_id_year_group_position_key UNIQUE (subject_id, year_group, "position");

ALTER TABLE ONLY public.drive_folders
    ADD CONSTRAINT drive_folders_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.enquiries
    ADD CONSTRAINT enquiries_code_key UNIQUE (code);

ALTER TABLE ONLY public.enquiries
    ADD CONSTRAINT enquiries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.enquiry_events
    ADD CONSTRAINT enquiry_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.enquiry_subjects
    ADD CONSTRAINT enquiry_subjects_pkey PRIMARY KEY (enquiry_id, subject_id);

ALTER TABLE ONLY public.enrolments
    ADD CONSTRAINT enrolments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.families
    ADD CONSTRAINT families_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.file_links
    ADD CONSTRAINT file_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.homework_markups
    ADD CONSTRAINT homework_markups_pkey PRIMARY KEY (sheet_id, student_id);

ALTER TABLE ONLY public.homework_results
    ADD CONSTRAINT homework_results_pkey PRIMARY KEY (sheet_id, student_id);

ALTER TABLE ONLY public.homework_sheets
    ADD CONSTRAINT homework_sheets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lesson_homework
    ADD CONSTRAINT lesson_homework_code_key UNIQUE (code);

ALTER TABLE ONLY public.lesson_homework
    ADD CONSTRAINT lesson_homework_lesson_id_slot_key UNIQUE (lesson_id, slot);

ALTER TABLE ONLY public.lesson_homework
    ADD CONSTRAINT lesson_homework_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_code_key UNIQUE (code);

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.login_current_student
    ADD CONSTRAINT login_current_student_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_email_key UNIQUE (email);

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.student_notes
    ADD CONSTRAINT student_notes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_code_key UNIQUE (code);

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_handin_code_key UNIQUE (handin_code);

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_name_key UNIQUE (name);

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_auth_user_id_key UNIQUE (auth_user_id);

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_code_key UNIQUE (code);

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_personal_email_key UNIQUE (personal_email);

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_pkey PRIMARY KEY (id);


-- ==============================================================================================================
-- 5. Indexes
-- ==============================================================================================================

CREATE INDEX attendance_changes_entry_idx ON public.attendance_changes USING btree (session_id, student_id, changed_at);

CREATE INDEX attendance_student_idx ON public.attendance USING btree (student_id);

CREATE UNIQUE INDEX batches_open_name ON public.batches USING btree (subject_id, year_group, lower(name)) WHERE ((closed_on IS NULL) AND (name IS NOT NULL));

CREATE INDEX batches_teacher_idx ON public.batches USING btree (teacher_id) WHERE (closed_on IS NULL);

CREATE INDEX class_notes_batch_idx ON public.class_notes USING btree (batch_id, created_at DESC);

CREATE INDEX class_notes_lesson_idx ON public.class_notes USING btree (lesson_id) WHERE (lesson_id IS NOT NULL);

CREATE INDEX class_notes_topic_idx ON public.class_notes USING btree (topic_id) WHERE (topic_id IS NOT NULL);

CREATE INDEX class_sessions_date_idx ON public.class_sessions USING btree (class_date);

CREATE INDEX drive_folders_folder_id ON public.drive_folders USING btree (folder_id);

CREATE INDEX enquiries_stage_idx ON public.enquiries USING btree (stage, stage_changed_at);

CREATE INDEX enquiry_events_enquiry_idx ON public.enquiry_events USING btree (enquiry_id, at DESC);

CREATE INDEX enrolments_batch_idx ON public.enrolments USING btree (batch_id) WHERE (ended_on IS NULL);

CREATE UNIQUE INDEX enrolments_one_active ON public.enrolments USING btree (student_id, subject_id) WHERE (ended_on IS NULL);

CREATE INDEX enrolments_teacher_idx ON public.enrolments USING btree (teacher_id) WHERE (ended_on IS NULL);

CREATE UNIQUE INDEX file_links_one_folder ON public.file_links USING btree (student_id) WHERE (owner_type = 'student_folder'::text);

CREATE INDEX file_links_owner_idx ON public.file_links USING btree (owner_type, owner_id);

CREATE INDEX file_links_student_idx ON public.file_links USING btree (student_id) WHERE (student_id IS NOT NULL);

CREATE INDEX guardians_family_idx ON public.guardians USING btree (family_id);

CREATE UNIQUE INDEX guardians_one_primary ON public.guardians USING btree (family_id) WHERE is_primary;

CREATE INDEX homework_markups_drafts_idx ON public.homework_markups USING btree (sheet_id) WHERE (draft_file_id IS NOT NULL);

CREATE INDEX homework_markups_student_idx ON public.homework_markups USING btree (student_id);

CREATE INDEX homework_results_marked_on_idx ON public.homework_results USING btree (marked_on) WHERE (status = 'marked'::public.homework_status);

CREATE INDEX homework_results_pending_idx ON public.homework_results USING btree (sheet_id) WHERE (status = 'pending'::public.homework_status);

CREATE INDEX homework_results_received_idx ON public.homework_results USING btree (sheet_id) WHERE (status = 'received'::public.homework_status);

CREATE INDEX homework_results_received_on_idx ON public.homework_results USING btree (received_on) WHERE (received_on IS NOT NULL);

CREATE INDEX homework_results_student_idx ON public.homework_results USING btree (student_id);

CREATE INDEX homework_sheets_batch_idx ON public.homework_sheets USING btree (batch_id, set_on DESC);

CREATE UNIQUE INDEX homework_sheets_one_per_lesson_sheet ON public.homework_sheets USING btree (batch_id, lesson_homework_id) WHERE (lesson_homework_id IS NOT NULL);

CREATE UNIQUE INDEX homework_sheets_one_per_topic ON public.homework_sheets USING btree (topic_id) WHERE (topic_id IS NOT NULL);

CREATE INDEX lessons_plan_idx ON public.lessons USING btree (subject_id, year_group, term, "position");

CREATE INDEX student_notes_student_idx ON public.student_notes USING btree (student_id, created_at DESC);

CREATE INDEX students_auth_user_idx ON public.students USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);

CREATE INDEX students_name_idx ON public.students USING btree (last_name, first_name);

CREATE INDEX students_status_idx ON public.students USING btree (status);


-- ==============================================================================================================
-- 6. Views finished after their functions exist
-- ==============================================================================================================

CREATE OR REPLACE VIEW public.student_list WITH (security_invoker='true') AS
 SELECT s.id,
    s.code,
    s.first_name,
    s.last_name,
    s.year_group,
    s.school,
    s.status,
    s.start_date,
    COALESCE(array_agg(e.subject_id ORDER BY sub.sort) FILTER (WHERE (e.id IS NOT NULL)), '{}'::text[]) AS subject_ids,
    COALESCE(string_agg(sub.name, ', '::text ORDER BY sub.sort), ''::text) AS subjects,
    COALESCE(array_agg(DISTINCT e.teacher_id) FILTER (WHERE (e.teacher_id IS NOT NULL)), '{}'::uuid[]) AS teacher_ids,
    COALESCE(string_agg(COALESCE(((t.first_name || ' '::text) || t.last_name), 'Not assigned'::text), ', '::text ORDER BY sub.sort) FILTER (WHERE (e.id IS NOT NULL)), ''::text) AS teachers,
    COALESCE(string_agg(COALESCE(b.code, '—'::text), ', '::text ORDER BY sub.sort) FILTER (WHERE (e.id IS NOT NULL)), ''::text) AS batches,
    COALESCE(bool_or((e.teacher_id IS NULL)) FILTER (WHERE (e.id IS NOT NULL)), false) AS missing_teacher,
    COALESCE(bool_or((e.batch_id IS NULL)) FILTER (WHERE (e.id IS NOT NULL)), false) AS missing_batch,
    st.attendance_pct,
    st.homework_pct,
    s.created_at,
    s.updated_at
   FROM (((((public.students s
     LEFT JOIN public.enrolments e ON (((e.student_id = s.id) AND (e.ended_on IS NULL))))
     LEFT JOIN public.subjects sub ON ((sub.id = e.subject_id)))
     LEFT JOIN public.teachers t ON ((t.id = e.teacher_id)))
     LEFT JOIN public.batches b ON ((b.id = e.batch_id)))
     LEFT JOIN public.student_stats st ON ((st.student_id = s.id)))
  GROUP BY s.id, st.attendance_pct, st.homework_pct;


-- ==============================================================================================================
-- 7. Triggers
-- ==============================================================================================================

CREATE TRIGGER attendance_log AFTER INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.attendance_log();

CREATE TRIGGER attendance_stamp BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.attendance_stamp();

CREATE TRIGGER batch_slots_clash AFTER INSERT OR UPDATE ON public.batch_slots FOR EACH ROW EXECUTE FUNCTION public.batch_slots_clash();

CREATE TRIGGER batch_slots_one_per_day AFTER INSERT OR UPDATE ON public.batch_slots FOR EACH ROW EXECUTE FUNCTION public.batch_slots_one_per_day();

CREATE TRIGGER batches_capacity BEFORE UPDATE OF capacity ON public.batches FOR EACH ROW WHEN ((new.capacity < old.capacity)) EXECUTE FUNCTION public.batch_capacity_check();

CREATE TRIGGER batches_clash AFTER UPDATE OF teacher_id, closed_on ON public.batches FOR EACH ROW WHEN (((new.closed_on IS NULL) AND ((old.teacher_id IS DISTINCT FROM new.teacher_id) OR (old.closed_on IS NOT NULL)))) EXECUTE FUNCTION public.batches_clash();

CREATE TRIGGER batches_class_link_stamp BEFORE INSERT OR UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.batch_class_link_stamp();

CREATE TRIGGER batches_seed_topics AFTER INSERT ON public.batches FOR EACH ROW EXECUTE FUNCTION public.seed_batch_topics();

CREATE TRIGGER batches_updated BEFORE UPDATE ON public.batches FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER class_note_check BEFORE INSERT OR UPDATE ON public.class_notes FOR EACH ROW EXECUTE FUNCTION public.class_note_check();

CREATE TRIGGER enquiries_updated BEFORE UPDATE ON public.enquiries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER enrolments_capacity BEFORE INSERT OR UPDATE OF batch_id, ended_on ON public.enrolments FOR EACH ROW EXECUTE FUNCTION public.enrolment_capacity_check();

CREATE TRIGGER enrolments_check BEFORE INSERT OR UPDATE ON public.enrolments FOR EACH ROW EXECUTE FUNCTION public.enrolment_check();

CREATE TRIGGER enrolments_updated BEFORE UPDATE ON public.enrolments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER families_updated BEFORE UPDATE ON public.families FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER students_left BEFORE UPDATE OF status ON public.students FOR EACH ROW EXECUTE FUNCTION public.student_left_release_places();

CREATE TRIGGER students_login_kind BEFORE INSERT OR UPDATE OF auth_user_id ON public.students FOR EACH ROW EXECUTE FUNCTION public.login_kind_check();

CREATE TRIGGER students_updated BEFORE UPDATE ON public.students FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER subjects_updated BEFORE UPDATE ON public.subjects FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER teachers_login_kind BEFORE INSERT OR UPDATE OF auth_user_id ON public.teachers FOR EACH ROW EXECUTE FUNCTION public.login_kind_check();

CREATE TRIGGER teachers_updated BEFORE UPDATE ON public.teachers FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_at();


-- ==============================================================================================================
-- 8. Links between tables (foreign keys)
-- ==============================================================================================================

ALTER TABLE ONLY public.attendance_changes
    ADD CONSTRAINT attendance_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.attendance_changes
    ADD CONSTRAINT attendance_changes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.attendance_changes
    ADD CONSTRAINT attendance_changes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.batch_lessons
    ADD CONSTRAINT batch_lessons_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.batch_lessons
    ADD CONSTRAINT batch_lessons_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.batch_slots
    ADD CONSTRAINT batch_slots_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.batch_topics
    ADD CONSTRAINT batch_topics_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_class_link_updated_by_fkey FOREIGN KEY (class_link_updated_by) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);

ALTER TABLE ONLY public.class_notes
    ADD CONSTRAINT class_notes_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.class_notes
    ADD CONSTRAINT class_notes_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.class_notes
    ADD CONSTRAINT class_notes_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.batch_topics(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES public.staff(id);

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.batch_topics(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);

ALTER TABLE ONLY public.enquiries
    ADD CONSTRAINT enquiries_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.enquiry_events
    ADD CONSTRAINT enquiry_events_by_staff_fkey FOREIGN KEY (by_staff) REFERENCES public.staff(id);

ALTER TABLE ONLY public.enquiry_events
    ADD CONSTRAINT enquiry_events_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES public.enquiries(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.enquiry_subjects
    ADD CONSTRAINT enquiry_subjects_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES public.enquiries(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.enquiry_subjects
    ADD CONSTRAINT enquiry_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);

ALTER TABLE ONLY public.enrolments
    ADD CONSTRAINT enrolments_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);

ALTER TABLE ONLY public.enrolments
    ADD CONSTRAINT enrolments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.enrolments
    ADD CONSTRAINT enrolments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);

ALTER TABLE ONLY public.enrolments
    ADD CONSTRAINT enrolments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);

ALTER TABLE ONLY public.file_links
    ADD CONSTRAINT file_links_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.guardians
    ADD CONSTRAINT guardians_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.homework_markups
    ADD CONSTRAINT homework_markups_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES public.homework_sheets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.homework_markups
    ADD CONSTRAINT homework_markups_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.homework_results
    ADD CONSTRAINT homework_results_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES public.homework_sheets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.homework_results
    ADD CONSTRAINT homework_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.homework_sheets
    ADD CONSTRAINT homework_sheets_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.homework_sheets
    ADD CONSTRAINT homework_sheets_lesson_homework_id_fkey FOREIGN KEY (lesson_homework_id) REFERENCES public.lesson_homework(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.homework_sheets
    ADD CONSTRAINT homework_sheets_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.homework_sheets
    ADD CONSTRAINT homework_sheets_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.batch_topics(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.lesson_homework
    ADD CONSTRAINT lesson_homework_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);

ALTER TABLE ONLY public.login_current_student
    ADD CONSTRAINT login_current_student_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.login_current_student
    ADD CONSTRAINT login_current_student_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.student_notes
    ADD CONSTRAINT student_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.staff(id);

ALTER TABLE ONLY public.student_notes
    ADD CONSTRAINT student_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(id);

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


-- ==============================================================================================================
-- 9. Row-level security: who can see and change which rows
-- ==============================================================================================================

CREATE POLICY admin_write ON public.curriculum_topics TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY admin_write ON public.lesson_homework TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY admin_write ON public.lessons TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY admin_write ON public.subjects TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.attendance_changes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.batch_lessons ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.batch_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.batch_topics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.class_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.curriculum_topics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.drive_folders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.enquiry_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.enquiry_subjects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.enrolments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.file_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.homework_markups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.homework_results ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.homework_sheets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lesson_homework ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.login_current_student ENABLE ROW LEVEL SECURITY;

CREATE POLICY notes_teacher_add ON public.class_notes FOR INSERT TO authenticated WITH CHECK ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY notes_teacher_read ON public.class_notes FOR SELECT TO authenticated USING ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY notes_teacher_remove ON public.class_notes FOR DELETE TO authenticated USING ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_admin_write ON public.staff TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY staff_all ON public.attendance TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.batch_lessons TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.batch_slots TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.batch_topics TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.batches TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.class_notes TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.class_sessions TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.enquiries TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.enquiry_events TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.enquiry_subjects TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.enrolments TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.families TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.file_links TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.guardians TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.homework_markups TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.homework_results TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.homework_sheets TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.student_notes TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.students TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_all ON public.teachers TO authenticated USING (( SELECT public.is_staff() AS is_staff)) WITH CHECK (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_read ON public.curriculum_topics FOR SELECT TO authenticated USING (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_read ON public.lesson_homework FOR SELECT TO authenticated USING (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_read ON public.lessons FOR SELECT TO authenticated USING (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_read ON public.staff FOR SELECT TO authenticated USING (( SELECT public.is_staff() AS is_staff));

CREATE POLICY staff_read ON public.subjects FOR SELECT TO authenticated USING (( SELECT public.is_staff() AS is_staff));

ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_add ON public.attendance FOR INSERT TO authenticated WITH CHECK (((( SELECT public.current_teacher_id() AS current_teacher_id) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.class_sessions cs
  WHERE ((cs.id = attendance.session_id) AND public.teaches_student_in_batch(cs.batch_id, attendance.student_id))))));

CREATE POLICY teacher_add ON public.batch_lessons FOR INSERT TO authenticated WITH CHECK ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_add ON public.class_sessions FOR INSERT TO authenticated WITH CHECK ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_add ON public.file_links FOR INSERT TO authenticated WITH CHECK ((((owner_type = 'homework_sheet'::text) AND (owner_id IN ( SELECT public.my_sheet_ids() AS my_sheet_ids))) OR ((owner_type = 'homework_correction'::text) AND ((owner_id, student_id) IN ( SELECT my_sheet_students.sheet_id,
    my_sheet_students.student_id
   FROM public.my_sheet_students() my_sheet_students(sheet_id, student_id))))));

CREATE POLICY teacher_add ON public.homework_markups FOR INSERT TO authenticated WITH CHECK (((sheet_id, student_id) IN ( SELECT my_sheet_students.sheet_id,
    my_sheet_students.student_id
   FROM public.my_sheet_students() my_sheet_students(sheet_id, student_id))));

CREATE POLICY teacher_add ON public.homework_results FOR INSERT TO authenticated WITH CHECK (((sheet_id, student_id) IN ( SELECT my_sheet_students.sheet_id,
    my_sheet_students.student_id
   FROM public.my_sheet_students() my_sheet_students(sheet_id, student_id))));

CREATE POLICY teacher_add ON public.homework_sheets FOR INSERT TO authenticated WITH CHECK ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_read ON public.attendance FOR SELECT TO authenticated USING (((( SELECT public.current_teacher_id() AS current_teacher_id) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.class_sessions cs
  WHERE ((cs.id = attendance.session_id) AND public.teaches_student_in_batch(cs.batch_id, attendance.student_id))))));

CREATE POLICY teacher_read ON public.batch_lessons FOR SELECT TO authenticated USING ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_read ON public.batch_slots FOR SELECT TO authenticated USING ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_read ON public.batch_topics FOR SELECT TO authenticated USING ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_read ON public.batches FOR SELECT TO authenticated USING ((id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_read ON public.class_sessions FOR SELECT TO authenticated USING ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_read ON public.enrolments FOR SELECT TO authenticated USING (((ended_on IS NULL) AND (batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids))));

CREATE POLICY teacher_read ON public.file_links FOR SELECT TO authenticated USING ((((owner_type = 'homework_sheet'::text) AND (owner_id IN ( SELECT public.my_sheet_ids() AS my_sheet_ids))) OR ((owner_type = ANY (ARRAY['homework_submission'::text, 'homework_correction'::text])) AND ((owner_id, student_id) IN ( SELECT my_sheet_students.sheet_id,
    my_sheet_students.student_id
   FROM public.my_sheet_students() my_sheet_students(sheet_id, student_id))))));

CREATE POLICY teacher_read ON public.homework_markups FOR SELECT TO authenticated USING (((sheet_id, student_id) IN ( SELECT my_sheet_students.sheet_id,
    my_sheet_students.student_id
   FROM public.my_sheet_students() my_sheet_students(sheet_id, student_id))));

CREATE POLICY teacher_read ON public.homework_results FOR SELECT TO authenticated USING (((sheet_id, student_id) IN ( SELECT my_sheet_students.sheet_id,
    my_sheet_students.student_id
   FROM public.my_sheet_students() my_sheet_students(sheet_id, student_id))));

CREATE POLICY teacher_read ON public.homework_sheets FOR SELECT TO authenticated USING ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_read ON public.lesson_homework FOR SELECT TO authenticated USING ((lesson_id IN ( SELECT public.my_lesson_ids() AS my_lesson_ids)));

CREATE POLICY teacher_read ON public.lessons FOR SELECT TO authenticated USING ((id IN ( SELECT public.my_lesson_ids() AS my_lesson_ids)));

CREATE POLICY teacher_read ON public.students FOR SELECT TO authenticated USING ((id IN ( SELECT public.my_student_ids() AS my_student_ids)));

CREATE POLICY teacher_read ON public.subjects FOR SELECT TO authenticated USING ((( SELECT public.current_teacher_id() AS current_teacher_id) IS NOT NULL));

CREATE POLICY teacher_remove ON public.file_links FOR DELETE TO authenticated USING ((((owner_type = 'homework_sheet'::text) AND (owner_id IN ( SELECT public.my_sheet_ids() AS my_sheet_ids))) OR ((owner_type = 'homework_correction'::text) AND ((owner_id, student_id) IN ( SELECT my_sheet_students.sheet_id,
    my_sheet_students.student_id
   FROM public.my_sheet_students() my_sheet_students(sheet_id, student_id))))));

CREATE POLICY teacher_update ON public.attendance FOR UPDATE TO authenticated USING (((( SELECT public.current_teacher_id() AS current_teacher_id) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.class_sessions cs
  WHERE ((cs.id = attendance.session_id) AND public.teaches_student_in_batch(cs.batch_id, attendance.student_id)))))) WITH CHECK (((( SELECT public.current_teacher_id() AS current_teacher_id) IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.class_sessions cs
  WHERE ((cs.id = attendance.session_id) AND public.teaches_student_in_batch(cs.batch_id, attendance.student_id))))));

CREATE POLICY teacher_update ON public.batch_lessons FOR UPDATE TO authenticated USING ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids))) WITH CHECK ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_update ON public.batch_topics FOR UPDATE TO authenticated USING ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids))) WITH CHECK ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_update ON public.class_sessions FOR UPDATE TO authenticated USING ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids))) WITH CHECK ((batch_id IN ( SELECT public.my_batch_ids() AS my_batch_ids)));

CREATE POLICY teacher_update ON public.homework_markups FOR UPDATE TO authenticated USING (((sheet_id, student_id) IN ( SELECT my_sheet_students.sheet_id,
    my_sheet_students.student_id
   FROM public.my_sheet_students() my_sheet_students(sheet_id, student_id)))) WITH CHECK (((sheet_id, student_id) IN ( SELECT my_sheet_students.sheet_id,
    my_sheet_students.student_id
   FROM public.my_sheet_students() my_sheet_students(sheet_id, student_id))));

CREATE POLICY teacher_update ON public.homework_results FOR UPDATE TO authenticated USING (((sheet_id, student_id) IN ( SELECT my_sheet_students.sheet_id,
    my_sheet_students.student_id
   FROM public.my_sheet_students() my_sheet_students(sheet_id, student_id)))) WITH CHECK (((sheet_id, student_id) IN ( SELECT my_sheet_students.sheet_id,
    my_sheet_students.student_id
   FROM public.my_sheet_students() my_sheet_students(sheet_id, student_id))));

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;


-- Supabase gives anon, authenticated and service_role full rights on every new table and function by
-- default. Take those away again, so that the permissions below are exactly the ones Staging ends up with
-- (for example: dates of birth hidden, hand-ins recorded only by the server).
do $$
declare r record;
begin
  for r in
    select c.oid::regclass as obj, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
  loop
    execute format('revoke all on %s %s from anon, authenticated, service_role',
                   case when r.relkind = 'S' then 'sequence' else 'table' end, r.obj);
  end loop;
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from anon, authenticated, service_role', r.fn);
  end loop;
end $$;


-- ==============================================================================================================
-- 10. Permissions
-- ==============================================================================================================

REVOKE ALL ON FUNCTION public.attendance_log() FROM PUBLIC;
GRANT ALL ON FUNCTION public.attendance_log() TO service_role;

GRANT ALL ON FUNCTION public.attendance_stamp() TO anon;
GRANT ALL ON FUNCTION public.attendance_stamp() TO authenticated;
GRANT ALL ON FUNCTION public.attendance_stamp() TO service_role;

REVOKE ALL ON FUNCTION public.attendance_totals(p_student uuid, p_batch uuid, p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.attendance_totals(p_student uuid, p_batch uuid, p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.attendance_totals(p_student uuid, p_batch uuid, p_days integer) TO service_role;

GRANT ALL ON FUNCTION public.batch_capacity_check() TO anon;
GRANT ALL ON FUNCTION public.batch_capacity_check() TO authenticated;
GRANT ALL ON FUNCTION public.batch_capacity_check() TO service_role;

GRANT ALL ON FUNCTION public.batch_class_link_stamp() TO anon;
GRANT ALL ON FUNCTION public.batch_class_link_stamp() TO authenticated;
GRANT ALL ON FUNCTION public.batch_class_link_stamp() TO service_role;

REVOKE ALL ON FUNCTION public.batch_register(p_batch uuid, p_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.batch_register(p_batch uuid, p_date date) TO authenticated;
GRANT ALL ON FUNCTION public.batch_register(p_batch uuid, p_date date) TO service_role;

GRANT ALL ON FUNCTION public.batch_slots_clash() TO anon;
GRANT ALL ON FUNCTION public.batch_slots_clash() TO authenticated;
GRANT ALL ON FUNCTION public.batch_slots_clash() TO service_role;

REVOKE ALL ON FUNCTION public.batch_slots_one_per_day() FROM PUBLIC;
GRANT ALL ON FUNCTION public.batch_slots_one_per_day() TO service_role;

GRANT ALL ON FUNCTION public.batches_clash() TO anon;
GRANT ALL ON FUNCTION public.batches_clash() TO authenticated;
GRANT ALL ON FUNCTION public.batches_clash() TO service_role;

REVOKE ALL ON FUNCTION public.bulk_import(p_rows jsonb, p_dry_run boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bulk_import(p_rows jsonb, p_dry_run boolean) TO authenticated;
GRANT ALL ON FUNCTION public.bulk_import(p_rows jsonb, p_dry_run boolean) TO service_role;

REVOKE ALL ON FUNCTION public.check_teacher_times(p_batch uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_teacher_times(p_batch uuid) TO service_role;

REVOKE ALL ON FUNCTION public.class_note_check() FROM PUBLIC;
GRANT ALL ON FUNCTION public.class_note_check() TO service_role;

GRANT ALL ON FUNCTION public.class_window() TO anon;
GRANT ALL ON FUNCTION public.class_window() TO authenticated;
GRANT ALL ON FUNCTION public.class_window() TO service_role;

REVOKE ALL ON FUNCTION public.complete_lesson(p_batch uuid, p_lesson uuid, p jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_lesson(p_batch uuid, p_lesson uuid, p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.complete_lesson(p_batch uuid, p_lesson uuid, p jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.complete_topic(p_batch uuid, p_topic uuid, p jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_topic(p_batch uuid, p_topic uuid, p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.complete_topic(p_batch uuid, p_topic uuid, p jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.current_student_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_student_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_student_id() TO service_role;

REVOKE ALL ON FUNCTION public.current_teacher() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_teacher() TO authenticated;
GRANT ALL ON FUNCTION public.current_teacher() TO service_role;

REVOKE ALL ON FUNCTION public.current_teacher_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_teacher_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_teacher_id() TO service_role;

GRANT ALL ON FUNCTION public.enrolment_capacity_check() TO anon;
GRANT ALL ON FUNCTION public.enrolment_capacity_check() TO authenticated;
GRANT ALL ON FUNCTION public.enrolment_capacity_check() TO service_role;

GRANT ALL ON FUNCTION public.enrolment_check() TO anon;
GRANT ALL ON FUNCTION public.enrolment_check() TO authenticated;
GRANT ALL ON FUNCTION public.enrolment_check() TO service_role;

GRANT ALL ON FUNCTION public.expected_classes(p_from date, p_to date) TO anon;
GRANT ALL ON FUNCTION public.expected_classes(p_from date, p_to date) TO authenticated;
GRANT ALL ON FUNCTION public.expected_classes(p_from date, p_to date) TO service_role;

GRANT ALL ON FUNCTION public.handin_page(p_code text) TO anon;
GRANT ALL ON FUNCTION public.handin_page(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.handin_page(p_code text) TO service_role;

REVOKE ALL ON FUNCTION public.handin_record(p_code text, p_sheet uuid, p_file_id text, p_url text, p_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.handin_record(p_code text, p_sheet uuid, p_file_id text, p_url text, p_label text) TO service_role;

GRANT ALL ON FUNCTION public.handin_target(p_code text, p_sheet uuid) TO anon;
GRANT ALL ON FUNCTION public.handin_target(p_code text, p_sheet uuid) TO authenticated;
GRANT ALL ON FUNCTION public.handin_target(p_code text, p_sheet uuid) TO service_role;

GRANT ALL ON FUNCTION public.import_lessons(p_subject text, p_year smallint, p_lessons jsonb) TO anon;
GRANT ALL ON FUNCTION public.import_lessons(p_subject text, p_year smallint, p_lessons jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.import_lessons(p_subject text, p_year smallint, p_lessons jsonb) TO service_role;

GRANT ALL ON FUNCTION public.import_norm(t text) TO anon;
GRANT ALL ON FUNCTION public.import_norm(t text) TO authenticated;
GRANT ALL ON FUNCTION public.import_norm(t text) TO service_role;

GRANT ALL ON FUNCTION public.import_parse_times(t text) TO anon;
GRANT ALL ON FUNCTION public.import_parse_times(t text) TO authenticated;
GRANT ALL ON FUNCTION public.import_parse_times(t text) TO service_role;

GRANT ALL ON FUNCTION public.import_times_label(slots jsonb) TO anon;
GRANT ALL ON FUNCTION public.import_times_label(slots jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.import_times_label(slots jsonb) TO service_role;

GRANT ALL ON FUNCTION public.import_year(t text) TO anon;
GRANT ALL ON FUNCTION public.import_year(t text) TO authenticated;
GRANT ALL ON FUNCTION public.import_year(t text) TO service_role;

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;

GRANT ALL ON FUNCTION public.is_staff() TO anon;
GRANT ALL ON FUNCTION public.is_staff() TO authenticated;
GRANT ALL ON FUNCTION public.is_staff() TO service_role;

REVOKE ALL ON FUNCTION public.join_class(p_batch uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_class(p_batch uuid) TO authenticated;
GRANT ALL ON FUNCTION public.join_class(p_batch uuid) TO service_role;

GRANT ALL ON FUNCTION public.login_kind_check() TO anon;
GRANT ALL ON FUNCTION public.login_kind_check() TO authenticated;
GRANT ALL ON FUNCTION public.login_kind_check() TO service_role;

GRANT ALL ON FUNCTION public.move_curriculum_topic(p_id uuid, p_direction text) TO anon;
GRANT ALL ON FUNCTION public.move_curriculum_topic(p_id uuid, p_direction text) TO authenticated;
GRANT ALL ON FUNCTION public.move_curriculum_topic(p_id uuid, p_direction text) TO service_role;

REVOKE ALL ON FUNCTION public.my_batch_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_batch_ids() TO authenticated;
GRANT ALL ON FUNCTION public.my_batch_ids() TO service_role;

REVOKE ALL ON FUNCTION public.my_class_note_file(p_note uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_class_note_file(p_note uuid) TO authenticated;
GRANT ALL ON FUNCTION public.my_class_note_file(p_note uuid) TO service_role;

REVOKE ALL ON FUNCTION public.my_class_notes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_class_notes() TO authenticated;
GRANT ALL ON FUNCTION public.my_class_notes() TO service_role;

REVOKE ALL ON FUNCTION public.my_dashboard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_dashboard() TO authenticated;
GRANT ALL ON FUNCTION public.my_dashboard() TO service_role;

REVOKE ALL ON FUNCTION public.my_handin_target(p_sheet uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_handin_target(p_sheet uuid) TO authenticated;
GRANT ALL ON FUNCTION public.my_handin_target(p_sheet uuid) TO service_role;

REVOKE ALL ON FUNCTION public.my_homework() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_homework() TO authenticated;
GRANT ALL ON FUNCTION public.my_homework() TO service_role;

REVOKE ALL ON FUNCTION public.my_homework_file(p_file uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_homework_file(p_file uuid) TO authenticated;
GRANT ALL ON FUNCTION public.my_homework_file(p_file uuid) TO service_role;

REVOKE ALL ON FUNCTION public.my_lesson_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_lesson_ids() TO authenticated;
GRANT ALL ON FUNCTION public.my_lesson_ids() TO service_role;

REVOKE ALL ON FUNCTION public.my_sheet_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_sheet_ids() TO authenticated;
GRANT ALL ON FUNCTION public.my_sheet_ids() TO service_role;

REVOKE ALL ON FUNCTION public.my_sheet_students() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_sheet_students() TO authenticated;
GRANT ALL ON FUNCTION public.my_sheet_students() TO service_role;

REVOKE ALL ON FUNCTION public.my_student_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_student_ids() TO authenticated;
GRANT ALL ON FUNCTION public.my_student_ids() TO service_role;

REVOKE ALL ON FUNCTION public.my_students() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_students() TO authenticated;
GRANT ALL ON FUNCTION public.my_students() TO service_role;

REVOKE ALL ON FUNCTION public.record_class_join(p_batch uuid, p_student uuid, p_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_class_join(p_batch uuid, p_student uuid, p_at timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.save_batch(p jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_batch(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_batch(p jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.save_register(p_batch uuid, p_date date, p_marks jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_register(p_batch uuid, p_date date, p_marks jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_register(p_batch uuid, p_date date, p_marks jsonb) TO service_role;

GRANT ALL ON FUNCTION public.save_student(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_student(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_student(p jsonb) TO service_role;

GRANT ALL ON FUNCTION public.seed_batch_topics() TO anon;
GRANT ALL ON FUNCTION public.seed_batch_topics() TO authenticated;
GRANT ALL ON FUNCTION public.seed_batch_topics() TO service_role;

REVOKE ALL ON FUNCTION public.set_homework(p_batch uuid, p jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_homework(p_batch uuid, p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.set_homework(p_batch uuid, p jsonb) TO service_role;

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;

REVOKE ALL ON FUNCTION public.student_drive_folder(p_student uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.student_drive_folder(p_student uuid) TO authenticated;
GRANT ALL ON FUNCTION public.student_drive_folder(p_student uuid) TO service_role;

GRANT ALL ON FUNCTION public.student_left_release_places() TO anon;
GRANT ALL ON FUNCTION public.student_left_release_places() TO authenticated;
GRANT ALL ON FUNCTION public.student_left_release_places() TO service_role;

REVOKE ALL ON FUNCTION public.student_private(p_student uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.student_private(p_student uuid) TO authenticated;
GRANT ALL ON FUNCTION public.student_private(p_student uuid) TO service_role;

REVOKE ALL ON FUNCTION public.switch_student(p_student uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.switch_student(p_student uuid) TO authenticated;
GRANT ALL ON FUNCTION public.switch_student(p_student uuid) TO service_role;

REVOKE ALL ON FUNCTION public.teaches_batch(p_batch uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teaches_batch(p_batch uuid) TO authenticated;
GRANT ALL ON FUNCTION public.teaches_batch(p_batch uuid) TO service_role;

REVOKE ALL ON FUNCTION public.teaches_lesson(p_lesson uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teaches_lesson(p_lesson uuid) TO authenticated;
GRANT ALL ON FUNCTION public.teaches_lesson(p_lesson uuid) TO service_role;

REVOKE ALL ON FUNCTION public.teaches_sheet(p_sheet uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teaches_sheet(p_sheet uuid) TO authenticated;
GRANT ALL ON FUNCTION public.teaches_sheet(p_sheet uuid) TO service_role;

REVOKE ALL ON FUNCTION public.teaches_sheet_student(p_sheet uuid, p_student uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teaches_sheet_student(p_sheet uuid, p_student uuid) TO authenticated;
GRANT ALL ON FUNCTION public.teaches_sheet_student(p_sheet uuid, p_student uuid) TO service_role;

REVOKE ALL ON FUNCTION public.teaches_student(p_student uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teaches_student(p_student uuid) TO authenticated;
GRANT ALL ON FUNCTION public.teaches_student(p_student uuid) TO service_role;

REVOKE ALL ON FUNCTION public.teaches_student_in_batch(p_batch uuid, p_student uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teaches_student_in_batch(p_batch uuid, p_student uuid) TO authenticated;
GRANT ALL ON FUNCTION public.teaches_student_in_batch(p_batch uuid, p_student uuid) TO service_role;

GRANT ALL ON FUNCTION public.weekday_name(d integer) TO anon;
GRANT ALL ON FUNCTION public.weekday_name(d integer) TO authenticated;
GRANT ALL ON FUNCTION public.weekday_name(d integer) TO service_role;

GRANT ALL ON FUNCTION public.year_label(y integer) TO anon;
GRANT ALL ON FUNCTION public.year_label(y integer) TO authenticated;
GRANT ALL ON FUNCTION public.year_label(y integer) TO service_role;

GRANT ALL ON TABLE public.attendance TO anon;
GRANT ALL ON TABLE public.attendance TO authenticated;
GRANT ALL ON TABLE public.attendance TO service_role;

GRANT ALL ON TABLE public.attendance_changes TO service_role;

GRANT ALL ON SEQUENCE public.attendance_changes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.attendance_changes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.attendance_changes_id_seq TO service_role;

GRANT ALL ON SEQUENCE public.batch_code_seq TO anon;
GRANT ALL ON SEQUENCE public.batch_code_seq TO authenticated;
GRANT ALL ON SEQUENCE public.batch_code_seq TO service_role;

GRANT ALL ON TABLE public.batch_lessons TO anon;
GRANT ALL ON TABLE public.batch_lessons TO authenticated;
GRANT ALL ON TABLE public.batch_lessons TO service_role;

GRANT ALL ON TABLE public.batch_slots TO anon;
GRANT ALL ON TABLE public.batch_slots TO authenticated;
GRANT ALL ON TABLE public.batch_slots TO service_role;

GRANT ALL ON TABLE public.batch_topics TO anon;
GRANT ALL ON TABLE public.batch_topics TO authenticated;
GRANT ALL ON TABLE public.batch_topics TO service_role;

GRANT ALL ON TABLE public.batches TO anon;
GRANT ALL ON TABLE public.batches TO authenticated;
GRANT ALL ON TABLE public.batches TO service_role;

GRANT ALL ON TABLE public.class_sessions TO anon;
GRANT ALL ON TABLE public.class_sessions TO authenticated;
GRANT ALL ON TABLE public.class_sessions TO service_role;

GRANT ALL ON TABLE public.enrolments TO anon;
GRANT ALL ON TABLE public.enrolments TO authenticated;
GRANT ALL ON TABLE public.enrolments TO service_role;

GRANT ALL ON TABLE public.homework_results TO anon;
GRANT ALL ON TABLE public.homework_results TO authenticated;
GRANT ALL ON TABLE public.homework_results TO service_role;

GRANT ALL ON TABLE public.homework_sheets TO anon;
GRANT ALL ON TABLE public.homework_sheets TO authenticated;
GRANT ALL ON TABLE public.homework_sheets TO service_role;

GRANT ALL ON SEQUENCE public.student_code_seq TO anon;
GRANT ALL ON SEQUENCE public.student_code_seq TO authenticated;
GRANT ALL ON SEQUENCE public.student_code_seq TO service_role;

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.students TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.students TO authenticated;
GRANT ALL ON TABLE public.students TO service_role;

GRANT SELECT(id) ON TABLE public.students TO authenticated;

GRANT SELECT(code) ON TABLE public.students TO authenticated;

GRANT SELECT(family_id) ON TABLE public.students TO authenticated;

GRANT SELECT(first_name) ON TABLE public.students TO authenticated;

GRANT SELECT(last_name) ON TABLE public.students TO authenticated;

GRANT SELECT(year_group) ON TABLE public.students TO authenticated;

GRANT SELECT(school) ON TABLE public.students TO authenticated;

GRANT SELECT(status) ON TABLE public.students TO authenticated;

GRANT SELECT(start_date) ON TABLE public.students TO authenticated;

GRANT SELECT(left_on) ON TABLE public.students TO authenticated;

GRANT SELECT(created_by) ON TABLE public.students TO authenticated;

GRANT SELECT(created_at) ON TABLE public.students TO authenticated;

GRANT SELECT(updated_at) ON TABLE public.students TO authenticated;

GRANT SELECT(auth_user_id) ON TABLE public.students TO authenticated;

GRANT ALL ON TABLE public.subjects TO anon;
GRANT ALL ON TABLE public.subjects TO authenticated;
GRANT ALL ON TABLE public.subjects TO service_role;

GRANT ALL ON SEQUENCE public.teacher_code_seq TO anon;
GRANT ALL ON SEQUENCE public.teacher_code_seq TO authenticated;
GRANT ALL ON SEQUENCE public.teacher_code_seq TO service_role;

GRANT ALL ON TABLE public.teachers TO anon;
GRANT ALL ON TABLE public.teachers TO authenticated;
GRANT ALL ON TABLE public.teachers TO service_role;

GRANT ALL ON TABLE public.batch_list TO anon;
GRANT ALL ON TABLE public.batch_list TO authenticated;
GRANT ALL ON TABLE public.batch_list TO service_role;

GRANT ALL ON TABLE public.class_notes TO authenticated;
GRANT ALL ON TABLE public.class_notes TO service_role;

GRANT ALL ON TABLE public.curriculum_topics TO anon;
GRANT ALL ON TABLE public.curriculum_topics TO authenticated;
GRANT ALL ON TABLE public.curriculum_topics TO service_role;

GRANT ALL ON TABLE public.drive_folders TO service_role;

GRANT ALL ON SEQUENCE public.enquiry_code_seq TO anon;
GRANT ALL ON SEQUENCE public.enquiry_code_seq TO authenticated;
GRANT ALL ON SEQUENCE public.enquiry_code_seq TO service_role;

GRANT ALL ON TABLE public.enquiries TO anon;
GRANT ALL ON TABLE public.enquiries TO authenticated;
GRANT ALL ON TABLE public.enquiries TO service_role;

GRANT ALL ON TABLE public.enquiry_events TO anon;
GRANT ALL ON TABLE public.enquiry_events TO authenticated;
GRANT ALL ON TABLE public.enquiry_events TO service_role;

GRANT ALL ON TABLE public.enquiry_subjects TO anon;
GRANT ALL ON TABLE public.enquiry_subjects TO authenticated;
GRANT ALL ON TABLE public.enquiry_subjects TO service_role;

GRANT ALL ON TABLE public.families TO anon;
GRANT ALL ON TABLE public.families TO authenticated;
GRANT ALL ON TABLE public.families TO service_role;

GRANT ALL ON TABLE public.file_links TO anon;
GRANT ALL ON TABLE public.file_links TO authenticated;
GRANT ALL ON TABLE public.file_links TO service_role;

GRANT ALL ON TABLE public.guardians TO anon;
GRANT ALL ON TABLE public.guardians TO authenticated;
GRANT ALL ON TABLE public.guardians TO service_role;

GRANT ALL ON TABLE public.homework_markups TO anon;
GRANT ALL ON TABLE public.homework_markups TO authenticated;
GRANT ALL ON TABLE public.homework_markups TO service_role;

GRANT ALL ON TABLE public.lesson_homework TO anon;
GRANT ALL ON TABLE public.lesson_homework TO authenticated;
GRANT ALL ON TABLE public.lesson_homework TO service_role;

GRANT ALL ON TABLE public.lessons TO anon;
GRANT ALL ON TABLE public.lessons TO authenticated;
GRANT ALL ON TABLE public.lessons TO service_role;

GRANT ALL ON TABLE public.login_current_student TO anon;
GRANT ALL ON TABLE public.login_current_student TO authenticated;
GRANT ALL ON TABLE public.login_current_student TO service_role;

GRANT ALL ON TABLE public.staff TO anon;
GRANT ALL ON TABLE public.staff TO authenticated;
GRANT ALL ON TABLE public.staff TO service_role;

GRANT ALL ON TABLE public.student_list TO anon;
GRANT ALL ON TABLE public.student_list TO authenticated;
GRANT ALL ON TABLE public.student_list TO service_role;

GRANT ALL ON TABLE public.student_notes TO anon;
GRANT ALL ON TABLE public.student_notes TO authenticated;
GRANT ALL ON TABLE public.student_notes TO service_role;

GRANT ALL ON TABLE public.student_stats TO anon;
GRANT ALL ON TABLE public.student_stats TO authenticated;
GRANT ALL ON TABLE public.student_stats TO service_role;

GRANT ALL ON TABLE public.teacher_list TO anon;
GRANT ALL ON TABLE public.teacher_list TO authenticated;
GRANT ALL ON TABLE public.teacher_list TO service_role;


commit;
