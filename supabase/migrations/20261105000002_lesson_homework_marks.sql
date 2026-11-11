-- Each homework sent from "Mark completed" (Hw-1, Hw-2, Hw-3 of a Lesson library lesson) can have its own
-- maximum mark. Before, one maximum mark was used for every ticked homework.
-- complete_lesson, as in 20261103000001_atomic_saves.sql, now also reads
--   p.max_marks = { "<lesson_homework id>": 10, "<lesson_homework id>": 20, ... }
-- A sheet with no entry falls back to p.max_mark (so the earlier app version keeps working); an entry of null
-- means "no maximum mark" for that sheet.
-- Run after 20261105000001_teacher_time_clash.sql. Run on Staging first; on Production at go-live.

-- p = { hw: [lesson_homework ids ticked], set_on, due_on?, max_mark?, max_marks?: { id: mark } }
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
