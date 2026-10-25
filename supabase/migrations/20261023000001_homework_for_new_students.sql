-- New students only get homework set after they join a batch.
-- Until now a student saw every homework of their batch from the last 90 days, including homework
-- set before they joined. Now a homework is given to a student only when they have a homework_results
-- row for it. "Set homework" and "Mark completed" already add a row for everyone in the batch at that
-- moment, so later joiners get nothing old. Staff can still give an older homework to one student
-- from the batch page ("Give homework"), which adds the row.
-- Run after 20261020000006_student_handed_in_files.sql.

-- 1. Existing homework: give it to everyone who was already in the batch when it was set, in case
--    a row is missing. Students who joined later are not given older homework.
insert into homework_results (sheet_id, student_id)
select h.id, e.student_id
from homework_sheets h
join enrolments e on e.batch_id = h.batch_id and e.ended_on is null and e.created_at <= h.created_at
on conflict (sheet_id, student_id) do nothing;

-- 2. Hand-in page (WhatsApp link, and My homework through it): only homework given to the student.
create or replace function handin_page(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
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

-- 3. Before an upload: the homework must be given to the student.
create or replace function handin_target(p_code text, p_sheet uuid) returns jsonb
language sql stable security definer set search_path = public as $$
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

-- 4. After an upload: the student's result row always exists now, so update it.
create or replace function handin_record(p_code text, p_sheet uuid, p_file_id text, p_url text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select s.id into sid
  from students s
  join homework_sheets h on h.id = p_sheet
  join enrolments e on e.student_id = s.id and e.batch_id = h.batch_id and e.ended_on is null
  join homework_results r on r.sheet_id = h.id and r.student_id = s.id
  where s.handin_code = p_code and s.status <> 'left';
  if sid is null then raise exception 'Link or homework not found'; end if;

  if (select count(*) from file_links
      where owner_type = 'homework_submission' and owner_id = p_sheet and student_id = sid) >= 20 then
    raise exception 'Too many files for this homework';
  end if;

  insert into file_links (owner_type, owner_id, student_id, provider, external_id, url, label)
  values ('homework_submission', p_sheet, sid, 'google_drive', p_file_id, p_url, p_label);

  update homework_results
    set status = case when status = 'marked' then 'marked'::homework_status else 'received'::homework_status end,
        received_on = coalesce(received_on, current_date)
  where sheet_id = p_sheet and student_id = sid;
end $$;

-- 5. Dashboard tiles: count only homework given to the student.
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
        'marked', (select count(*) from hw where hw.batch_id = b.id and hw.status = 'marked'),
        -- The lesson plan topic the class is on: the first In progress, otherwise the next Not started.
        'topic', (select bt.name from batch_topics bt
                  where bt.batch_id = b.id and bt.status <> 'complete'
                  order by (bt.status = 'in_progress') desc, bt.position limit 1),
        'topic_started', exists (select 1 from batch_topics bt where bt.batch_id = b.id and bt.status = 'in_progress')
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

-- 6. Homework sheet files: only for homework given to the student (their own handed-in files as before).
create or replace function my_homework_file(p_file uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('provider', f.provider, 'external_id', f.external_id, 'url', f.url, 'label', f.label)
  from file_links f
  where f.id = p_file
    and (
      (f.owner_type = 'homework_sheet' and exists (
         select 1 from homework_sheets h
         join enrolments e on e.batch_id = h.batch_id and e.ended_on is null
         join homework_results r on r.sheet_id = h.id and r.student_id = e.student_id
         where h.id = f.owner_id and e.student_id = current_student_id()))
      or (f.owner_type = 'homework_submission' and f.student_id = current_student_id())
    )
$$;
