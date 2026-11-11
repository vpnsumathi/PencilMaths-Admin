-- Saves that happen all at once. Until now these saves were several separate steps from the app, so a problem
-- halfway (a lost connection, a refused rule) could leave half-saved data: a batch with no class times, or a
-- homework that no student was given. Each one is now a single database function: either everything is
-- saved, or nothing is, and the page shows the problem.
--  1. save_batch(p)                       Add or change a batch together with its weekly class times.
--  2. set_homework(batch, p)              Set a homework, give it to every student in the batch now, attach its files.
--  3. complete_topic(batch, topic, p)     Mark a lesson plan topic completed and send its homework (only once).
--  4. complete_lesson(batch, lesson, p)   Mark a Lesson library lesson completed and send the ticked Hw-1/2/3 (each once).
-- They run with the signed-in person's own rights (security invoker), so the existing rules still decide who
-- may do what: staff anything, a teacher only in their own open batches (20261027000004_teacher_login.sql).
-- Google Drive uploads stay in the app and happen first; the functions only record the uploaded files.
-- Run after 20261102000001_bulk_import.sql. Run on Staging first; on Production at go-live.

-- 1. Batch with its class times ------------------------------------------------------------------------------
-- p = { id?, subject_id, year_group, teacher_id, capacity, started_on, name?, slots: [{ weekday, start_time }] }
-- subject_id and year_group are only used for a new batch (they can't be changed afterwards).
-- The class times on the form replace the batch's times.
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
    -- Fewer places than students already in the batch is refused here, with a message (batches_capacity).
    update batches
    set teacher_id = tid, capacity = (p->>'capacity')::smallint,
        started_on = coalesce(nullif(p->>'started_on', '')::date, started_on), name = nullif(trim(p->>'name'), '')
    where id = bid;
    if not found then raise exception 'Batch not found.'; end if;
    -- Students in the batch follow its teacher (the enrolment trigger copies the teacher from the batch).
    update enrolments set teacher_id = tid where batch_id = bid and ended_on is null and teacher_id is distinct from tid;
    delete from batch_slots where batch_id = bid;
  end if;

  insert into batch_slots (batch_id, weekday, start_time)
  select distinct bid, (s->>'weekday')::smallint, (s->>'start_time')::time
  from jsonb_array_elements(coalesce(p->'slots', '[]')) s;

  return bid;
end $$;

-- 2. Set a homework ---------------------------------------------------------------------------------------------
-- p = { title, set_on, due_on?, max_mark?, topic_id?, lesson_homework_id?,
--       files: [{ provider: 'google_drive' | 'external_link', external_id?, url, label }] }
-- Returns { sheet_id, students }: students = how many were given it.
create or replace function set_homework(p_batch uuid, p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
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

-- 3. Complete a lesson plan topic -------------------------------------------------------------------------------
-- p = the homework, as for set_homework (not used when the topic already sent its homework).
-- Returns { already_sent: title or null, sheet_id?, students? }.
create or replace function complete_topic(p_batch uuid, p_topic uuid, p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
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

-- 4. Complete a Lesson library lesson ---------------------------------------------------------------------------
-- p = { hw: [lesson_homework ids ticked], set_on, due_on?, max_mark? }
-- Each ticked sheet not yet sent to this class becomes a homework named "<lesson> · Hw-<n> (<code>)", linked to
-- the library's worksheet (no copy is made). A sheet without a worksheet stops everything, with a message.
-- Returns { codes: [homework codes sent], students }.
create or replace function complete_lesson(p_batch uuid, p_lesson uuid, p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
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
    hw := set_homework(p_batch, (coalesce(p, '{}') - 'hw') || jsonb_build_object(
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

-- 5. Only signed-in people may call them (the rules above then decide what they may change).
revoke execute on function save_batch(jsonb), set_homework(uuid, jsonb), complete_topic(uuid, uuid, jsonb),
  complete_lesson(uuid, uuid, jsonb) from public, anon;
grant execute on function save_batch(jsonb), set_homework(uuid, jsonb), complete_topic(uuid, uuid, jsonb),
  complete_lesson(uuid, uuid, jsonb) to authenticated;
