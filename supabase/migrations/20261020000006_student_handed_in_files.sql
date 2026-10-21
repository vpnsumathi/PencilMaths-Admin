-- Students see the files they handed in (Handed in and Marked tabs) and can open them.
-- Replaces my_homework() and my_homework_file() from 20261020000002; run this after it.

-- 1. Each homework now also lists the student's own handed-in files as "handed" (id and name).
create or replace function my_homework() returns jsonb
language sql stable security definer set search_path = public as $$
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
           ), '[]'::jsonb)
         ) order by n), '[]'::jsonb)
  from students s
  cross join lateral jsonb_array_elements(handin_page(s.handin_code) -> 'homework') with ordinality as e(h, n)
  where s.id = current_student_id()
$$;

-- 2. One file: a homework sheet for a class the student is in now, or a file they handed in themselves.
create or replace function my_homework_file(p_file uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('provider', f.provider, 'external_id', f.external_id, 'url', f.url, 'label', f.label)
  from file_links f
  where f.id = p_file
    and (
      (f.owner_type = 'homework_sheet' and exists (
         select 1 from homework_sheets h
         join enrolments e on e.batch_id = h.batch_id and e.ended_on is null
         where h.id = f.owner_id and e.student_id = current_student_id()))
      or (f.owner_type = 'homework_submission' and f.student_id = current_student_id())
    )
$$;

revoke execute on function my_homework(), my_homework_file(uuid) from public, anon;
grant execute on function my_homework(), my_homework_file(uuid) to authenticated;
