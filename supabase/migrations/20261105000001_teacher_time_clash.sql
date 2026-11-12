-- A teacher can't be given a class time they already have.
-- When a batch's class times are saved, each one is compared with the times already assigned to the same
-- teacher in their other open batches: the same day at the same start time is refused. Closed batches don't
-- count. (The app records only when a class starts, not how long it lasts, so only exact matches are refused.)
-- The check runs in the database, so it holds for the batch form, Bulk import and the SQL Editor alike:
--   * adding or changing a batch's class times,
--   * giving a batch a different teacher,
--   * reopening a closed batch.
-- The message names the clashing batch, e.g.
--   "Agnes Smith already teaches B-004 on Monday at 16:00. Choose another time or another teacher."
-- Existing clashes are left alone, but that batch can't be saved again until its times are changed.
-- To list existing clashes, see Help/03 (section "Batches").
-- Run after 20261103000003_drive_folder_ids.sql. Run on Staging first; on Production at go-live.

create or replace function weekday_name(d int) returns text
language sql immutable as $$
  select (array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])[d]
$$;

drop function if exists class_length_label();
drop function if exists class_length();

-- Raises a message if any class time of batch p_batch is already assigned to the same teacher in another open batch.
-- security definer: it must see every batch of the teacher, whoever is saving. It only reads and raises.
create or replace function check_teacher_times(p_batch uuid) returns void
language plpgsql security definer set search_path = public as $$
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
revoke execute on function check_teacher_times(uuid) from public, anon, authenticated;

-- Class times added or changed. "after": by then every row of the save is in place.
create or replace function batch_slots_clash() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform check_teacher_times(new.batch_id);
  return null;
end $$;
drop trigger if exists batch_slots_clash on batch_slots;
create trigger batch_slots_clash after insert or update on batch_slots
  for each row execute function batch_slots_clash();

-- A batch given a different teacher, or reopened.
create or replace function batches_clash() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform check_teacher_times(new.id);
  return null;
end $$;
drop trigger if exists batches_clash on batches;
create trigger batches_clash after update of teacher_id, closed_on on batches
  for each row when (new.closed_on is null and (old.teacher_id is distinct from new.teacher_id or old.closed_on is not null))
  execute function batches_clash();

-- save_batch, as in 20261103000001_atomic_saves.sql, with one change: an existing batch's old class times are
-- removed BEFORE its teacher changes, so a new teacher is only checked against the new times.
create or replace function save_batch(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
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
