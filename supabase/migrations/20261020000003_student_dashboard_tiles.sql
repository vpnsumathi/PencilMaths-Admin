-- Student dashboard tiles: My classes (with a class details page) and My homework (to hand in, recently marked).
-- Replaces my_dashboard() from 20261020000001 with more detail. Everything is still for the signed-in student only.

create or replace function my_dashboard() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select * from students where id = current_student_id()),
  -- Homework from the last 90 days for the classes the student is in now (same rule as My homework).
  hw as (
    select h.id, h.title, sub.name as subject, h.batch_id, h.due_on, h.max_mark,
           coalesce(r.status::text, 'pending') as status, r.mark, r.marked_on
    from me
    join enrolments e on e.student_id = me.id and e.ended_on is null
    join homework_sheets h on h.batch_id = e.batch_id and h.set_on >= current_date - 90
    join subjects sub on sub.id = e.subject_id
    left join homework_results r on r.sheet_id = h.id and r.student_id = me.id
  )
  select jsonb_build_object(
    'first_name', me.first_name,
    'last_name', me.last_name,
    'code', me.code,
    'year_group', me.year_group,
    'school', me.school,
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', sub.name,
        'batch_code', b.code,
        'teacher', nullif(concat_ws(' ', t.first_name, t.last_name), ''),
        'class_year', b.year_group,
        'started_on', e.started_on,
        'times', coalesce((select jsonb_agg(jsonb_build_object('weekday', bs.weekday, 'start_time', bs.start_time)
                                            order by bs.weekday, bs.start_time)
                           from batch_slots bs where bs.batch_id = b.id), '[]'::jsonb),
        'to_do', (select count(*) from hw where hw.batch_id = b.id and hw.status = 'pending'),
        'marked', (select count(*) from hw where hw.batch_id = b.id and hw.status = 'marked')
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

revoke execute on function my_dashboard() from public, anon;
grant execute on function my_dashboard() to authenticated;
