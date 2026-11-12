-- Class link (Google Classroom) and attendance.
--  1. Each batch can hold a class link: the Google Classroom (or Google Meet) address the class uses.
--     Staff paste or replace it on the batch page; the batch's teacher can read it; students never read it
--     directly: they press "Join class" and join_class() hands the link over.
--  2. A student's press on "Join class" inside the class time window saves them as Present or Late.
--     The window comes from the batch's own class time (batch_slots) and the three numbers in class_window().
--  3. The register: staff and the batch's teacher can read it (batch_register) and change it (save_register).
--     A change made by staff or a teacher is final: a later press on "Join class" never overwrites it.
--  4. Totals for the student page and the student login (attendance_totals, my_dashboard). A portal check-in counts
--     as attended straight away (user's decision, 11 Nov 2026) but is shown as "Checked in" until confirmed.
--  5. Every mark saved by staff or a teacher is kept, with a reason when a saved mark or a check-in is changed.
-- How absences are recorded: when the first student joins a class, everyone else in the batch is put on that
-- day's register as "did not join" (absent, source auto). Their own press, or the teacher, then changes it.
-- Nothing runs on a timer. A day when nobody joined and nobody took the register has no register at all,
-- so holidays never count as absences.
-- Limits: one class per batch per day (class_sessions already works this way; section 10 makes it a rule for
-- class times too), and a class may not run across midnight.
-- Run after 20261108000001_gcse_year_groups.sql. Run on Staging first; on Production at go-live. Safe to run twice.

-- 1. The class link on each batch -------------------------------------------------------------------------------
-- google_course_id is for the "Create in Google Classroom" button (a later stage); nothing fills it yet.
alter table batches
  add column if not exists class_link text,
  add column if not exists class_link_updated_at timestamptz,
  add column if not exists class_link_updated_by uuid references staff(id) on delete set null,
  add column if not exists google_course_id text;

-- Only Google Classroom and Google Meet addresses, so a mistyped or harmful link can never be saved.
alter table batches drop constraint if exists batches_class_link_check;
alter table batches add constraint batches_class_link_check check (
  class_link is null
  or (length(class_link) <= 500 and class_link ~ '^https://(classroom|meet)\.google\.com/[^[:space:]]*$'));

-- Who changed the link, and when, is filled in by the database, so it can't be forgotten or typed in by hand.
create or replace function batch_class_link_stamp() returns trigger
language plpgsql set search_path = public as $$
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
drop trigger if exists batches_class_link_stamp on batches;
create trigger batches_class_link_stamp before insert or update on batches
  for each row execute function batch_class_link_stamp();

-- 2. How each attendance entry was set --------------------------------------------------------------------------
--   auto  = put on the register when the class started; has not joined (shows as absent)
--   link  = the student pressed "Join class"
--   staff = set or confirmed by staff or the teacher (final)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'attendance_source' and typnamespace = 'public'::regnamespace) then
    create type attendance_source as enum ('auto', 'link', 'staff');
  end if;
end $$;

alter table attendance
  add column if not exists source attendance_source not null default 'staff',
  add column if not exists joined_at timestamptz,
  add column if not exists marked_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- A change made with a staff or teacher login is always recorded as theirs, with the time. The join time can't
-- be edited. (The functions below that run with full rights, and the server, are not touched by this.)
create or replace function attendance_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' then
    new.source := 'staff';
    new.marked_by := auth.uid();
    new.updated_at := now();
    new.joined_at := case when tg_op = 'UPDATE' then old.joined_at else null end;
  end if;
  return new;
end $$;
drop trigger if exists attendance_stamp on attendance;
create trigger attendance_stamp before insert or update on attendance
  for each row execute function attendance_stamp();

-- Every mark saved by staff or a teacher is kept in attendance_changes: who, when, from what to what, and the
-- reason they gave. Nobody can edit or delete it, and it is only read through batch_register (below).
create table if not exists attendance_changes (
  id bigint generated always as identity primary key,
  session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  old_status attendance_status,             -- null: first entry for that class
  old_source attendance_source,
  new_status attendance_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  reason text check (reason is null or length(reason) <= 300)
);
create index if not exists attendance_changes_entry_idx on attendance_changes (session_id, student_id, changed_at);
alter table attendance_changes enable row level security;   -- no rules: nobody signed in reads or writes it directly
revoke all on attendance_changes from anon, authenticated;

-- The reason comes from save_register (the setting pm.attendance_reason, for that one entry).
create or replace function attendance_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'staff' and (tg_op = 'INSERT' or old.status is distinct from new.status or old.source <> 'staff') then
    insert into attendance_changes (session_id, student_id, old_status, old_source, new_status, changed_by, reason)
    values (new.session_id, new.student_id,
            case when tg_op = 'UPDATE' then old.status end, case when tg_op = 'UPDATE' then old.source end,
            new.status, new.marked_by, nullif(trim(current_setting('pm.attendance_reason', true)), ''));
  end if;
  return null;
end $$;
revoke execute on function attendance_log() from public, anon, authenticated;
drop trigger if exists attendance_log on attendance;
create trigger attendance_log after insert or update on attendance
  for each row execute function attendance_log();

-- 3. The class time window: the one place these three numbers live ---------------------------------------------
-- A press on "Join class" counts from before_minutes before the batch's class time until after_minutes after it.
-- Up to late_minutes after the class time it is Present; later than that it is Late.
-- To change them, run this statement again with new numbers.
create or replace function class_window() returns table (before_minutes int, after_minutes int, late_minutes int)
language sql immutable set search_path = public as $$
  select 15, 60, 10
$$;

-- 4. Saving a join (not called from the app directly) -----------------------------------------------------------
-- Returns 'present' or 'late' (saved now), 'already' (an entry was already there and is left as it is),
-- or 'outside' (not inside a class time window: nothing saved).
create or replace function record_class_join(p_batch uuid, p_student uuid, p_at timestamptz default now()) returns text
language plpgsql security definer set search_path = public as $$
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

-- 5. "Join class" for a student or family login -----------------------------------------------------------------
-- Returns { link, attendance }: the class link to open, and what happened to attendance
-- ('present', 'late', 'already', 'outside', 'no_link', or 'error' with the reason in "problem").
-- The class comes first: if saving attendance fails, the link is still returned.
create or replace function join_class(p_batch uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
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

-- 6. The register of one class day, for the batch page ----------------------------------------------------------
-- Staff, or the batch's own teacher. p_date empty = today (UK).
-- Returns { class_date, session_id, start_time, class_day, students: [...], recent: [...], window }.
-- students = everyone enrolled in the batch on that date (joined by then, not left before it), plus, for staff,
-- anyone else already on that day's register. in_batch = still in the batch now.
create or replace function batch_register(p_batch uuid, p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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

-- 7. Saving the register: all of it, or nothing -----------------------------------------------------------------
-- p_marks = [{ student_id, status: 'present' | 'late' | 'absent', reason? }, ...]. Returns how many entries changed.
-- A reason is needed to change a mark staff already saved, or to give a checked-in student a different mark.
-- Runs with the signed-in person's own rights (security invoker), like the other saves in
-- 20261103000001_atomic_saves.sql: the existing rules decide who may write (staff anything, a teacher only
-- their own open batches), and attendance_stamp records who did it.
-- Only the students sent are written: when their status changes, or to confirm a portal check-in or a "did not join".
create or replace function save_register(p_batch uuid, p_date date, p_marks jsonb) returns int
language plpgsql security invoker set search_path = public as $$
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

-- 8. Attendance totals for one student --------------------------------------------------------------------------
-- { present, late, absent, total, recent: [{ class_date, status }] } for the last p_days days (default 12 weeks),
-- for one batch or (p_batch empty) all of the student's classes. "recent" is the last 6 classes, newest first.
-- A class that is still running doesn't count yet for a student who hasn't joined.
-- Runs with the caller's own rights: staff see every student, a teacher their own students, and a student or
-- family login gets nothing here (they get their own totals through my_dashboard below).
create or replace function attendance_totals(p_student uuid, p_batch uuid default null, p_days int default 84) returns jsonb
language sql stable security invoker set search_path = public as $$
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

-- 9. Student dashboard: each class now also says whether it has a class link, and the student's attendance ----
-- Otherwise the same as in 20261023000001_homework_for_new_students.sql. The link itself is not sent:
-- the student gets it from join_class(), so every join passes through the app.
create or replace function my_dashboard() returns jsonb
language sql stable security definer set search_path = public as $$
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

-- 10. One class time per batch per day -------------------------------------------------------------------------
-- Each class day has one register (class_sessions is unique on batch + date), so a batch may have only one
-- class time on each day of the week. Checked after the save, when all its class times are in place.
-- Batches that already have two times on one day keep them until they are next saved (see Help guide 21, §8).
create or replace function batch_slots_one_per_day() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from batch_slots where batch_id = new.batch_id and weekday = new.weekday) > 1 then
    raise exception 'A batch can have only one class time on %. Remove the extra time, or make a second batch.',
      weekday_name(new.weekday);
  end if;
  return null;
end $$;
drop trigger if exists batch_slots_one_per_day on batch_slots;
create trigger batch_slots_one_per_day after insert or update on batch_slots
  for each row execute function batch_slots_one_per_day();
revoke execute on function batch_slots_one_per_day() from public, anon, authenticated;

-- 11. The older "Attendance %" (student page header, last 28 days) ---------------------------------------------
-- Same as in 20260928000002_views_and_functions.sql, except that, like attendance_totals, a student who hasn't
-- joined a class that is still running isn't counted as absent yet. Same columns, so student_list is unchanged.
create or replace view student_stats with (security_invoker = true) as
select s.id as student_id,
  (select round(100.0 * count(*) filter (where a.status <> 'absent') / nullif(count(*), 0))
     from attendance a join class_sessions cs on cs.id = a.session_id
    where a.student_id = s.id and cs.class_date >= current_date - 28
      and not (a.source = 'auto'
               and (cs.class_date + coalesce(cs.start_time, time '00:00'))
                   + make_interval(mins => (select after_minutes from class_window()))
                   > (now() at time zone 'Europe/London'))) as attendance_pct,
  (select round(100.0 * count(*) filter (where r.status in ('received', 'marked')) / nullif(count(*), 0))
     from homework_results r join homework_sheets h on h.id = r.sheet_id
    where r.student_id = s.id and h.set_on >= current_date - 28 and coalesce(h.due_on, h.set_on) < current_date and r.status <> 'excused') as homework_pct,
  (select max(cs.class_date) from attendance a join class_sessions cs on cs.id = a.session_id where a.student_id = s.id) as last_class_on
from students s;

-- 12. Who may call what -----------------------------------------------------------------------------------------
-- record_class_join is only for the functions above: nobody signed in can call it with someone else's name.
revoke execute on function record_class_join(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function join_class(uuid), batch_register(uuid, date), save_register(uuid, date, jsonb),
  attendance_totals(uuid, uuid, int), my_dashboard() from public, anon;
grant execute on function join_class(uuid), batch_register(uuid, date), save_register(uuid, date, jsonb),
  attendance_totals(uuid, uuid, int), my_dashboard() to authenticated;
