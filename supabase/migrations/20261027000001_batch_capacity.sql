-- A batch never holds more students than its capacity ("Places").
-- Adding a student to a full batch, or lowering a batch's places below its current students, is refused with a message.
-- Run after 20261024000001_lesson_planner.sql.

-- 1. Adding a student to a batch (new student, changed batch, or a returning student).
create or replace function enrolment_capacity_check() returns trigger
language plpgsql security definer set search_path = public as $$
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

drop trigger if exists enrolments_capacity on enrolments;
create trigger enrolments_capacity before insert or update of batch_id, ended_on on enrolments
  for each row execute function enrolment_capacity_check();

-- 2. Lowering a batch's places below the students already in it.
create or replace function batch_capacity_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare taken int;
begin
  select count(*) into taken from enrolments where batch_id = new.id and ended_on is null;
  if new.capacity < taken then
    raise exception 'Batch % has % students, so its places can''t be lower than %.', new.code, taken, taken;
  end if;
  return new;
end $$;

drop trigger if exists batches_capacity on batches;
create trigger batches_capacity before update of capacity on batches
  for each row when (new.capacity < old.capacity) execute function batch_capacity_check();

-- 3. Batches that are already over their places (from before this rule) are listed here, so you can fix them.
-- They keep their students; only new additions are refused.
select b.code, b.capacity, count(e.id) as students
from batches b join enrolments e on e.batch_id = b.id and e.ended_on is null
group by b.id having count(e.id) > b.capacity;
