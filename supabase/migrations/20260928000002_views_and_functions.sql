-- Reporting views and functions. Views run with the caller's permissions (security_invoker).

-- Every class that should have happened, from each batch's weekly slots.
create or replace function expected_classes(p_from date, p_to date)
returns table (batch_id uuid, class_date date, start_time time, session_id uuid)
language sql stable as $$
  select b.id, d::date, s.start_time, cs.id
  from batches b
  join batch_slots s on s.batch_id = b.id
  cross join generate_series(greatest(p_from, b.started_on), least(p_to, coalesce(b.closed_on, p_to)), interval '1 day') d
  left join class_sessions cs on cs.batch_id = b.id and cs.class_date = d::date
  where extract(isodow from d) = s.weekday
    and exists (select 1 from enrolments e where e.batch_id = b.id and e.ended_on is null)
$$;

create or replace view student_stats with (security_invoker = true) as
select s.id as student_id,
  (select round(100.0 * count(*) filter (where a.status <> 'absent') / nullif(count(*), 0))
     from attendance a join class_sessions cs on cs.id = a.session_id
    where a.student_id = s.id and cs.class_date >= current_date - 28) as attendance_pct,
  (select round(100.0 * count(*) filter (where r.status in ('received', 'marked')) / nullif(count(*), 0))
     from homework_results r join homework_sheets h on h.id = r.sheet_id
    where r.student_id = s.id and h.set_on >= current_date - 28 and coalesce(h.due_on, h.set_on) < current_date and r.status <> 'excused') as homework_pct,
  (select max(cs.class_date) from attendance a join class_sessions cs on cs.id = a.session_id where a.student_id = s.id) as last_class_on
from students s;

create or replace view student_list with (security_invoker = true) as
select s.id, s.code, s.first_name, s.last_name, s.year_group, s.school, s.status, s.start_date,
  coalesce(array_agg(e.subject_id order by sub.sort) filter (where e.id is not null), '{}') as subject_ids,
  coalesce(string_agg(sub.name, ', ' order by sub.sort), '') as subjects,
  coalesce(array_agg(distinct e.teacher_id) filter (where e.teacher_id is not null), '{}') as teacher_ids,
  coalesce(string_agg(coalesce(t.first_name || ' ' || t.last_name, 'Not assigned'), ', ' order by sub.sort) filter (where e.id is not null), '') as teachers,
  coalesce(string_agg(coalesce(b.code, '—'), ', ' order by sub.sort) filter (where e.id is not null), '') as batches,
  coalesce(bool_or(e.teacher_id is null) filter (where e.id is not null), false) as missing_teacher,
  coalesce(bool_or(e.batch_id is null) filter (where e.id is not null), false) as missing_batch,
  st.attendance_pct, st.homework_pct
from students s
left join enrolments e on e.student_id = s.id and e.ended_on is null
left join subjects sub on sub.id = e.subject_id
left join teachers t on t.id = e.teacher_id
left join batches b on b.id = e.batch_id
left join student_stats st on st.student_id = s.id
group by s.id, st.attendance_pct, st.homework_pct;

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
join teachers t on t.id = b.teacher_id;

-- Copy the curriculum into a new batch's lesson plan.
create or replace function seed_batch_topics() returns trigger language plpgsql as $$
begin
  insert into batch_topics (batch_id, position, name, status)
  select new.id, row_number() over (order by coalesce(ct.year_group, 0) desc, ct.position),
         ct.name, 'not_started'
  from curriculum_topics ct
  where ct.subject_id = new.subject_id and (ct.year_group is null or ct.year_group = new.year_group);
  update batch_topics set status = 'in_progress' where batch_id = new.id and position = 1;
  return new;
end $$;
create trigger batches_seed_topics after insert on batches for each row execute function seed_batch_topics();
