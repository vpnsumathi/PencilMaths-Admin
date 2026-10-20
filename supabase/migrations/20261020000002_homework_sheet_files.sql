-- Homework sheet files: staff attach the worksheet (a Drive upload or a link) when setting homework,
-- and signed-in students can open it from My homework.
-- Files are file_links rows with owner_type 'homework_sheet' and owner_id = the homework id.

-- 1. My homework now lists each homework's sheet files (id and name) as "sheets".
create or replace function my_homework() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(h || jsonb_build_object('sheets', coalesce((
           select jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label) order by f.created_at)
           from file_links f
           where f.owner_type = 'homework_sheet' and f.owner_id = (h ->> 'sheet_id')::uuid
         ), '[]'::jsonb)) order by n), '[]'::jsonb)
  from students s
  cross join lateral jsonb_array_elements(handin_page(s.handin_code) -> 'homework') with ordinality as e(h, n)
  where s.id = current_student_id()
$$;

-- 2. One sheet file, only if it belongs to homework for a class the signed-in student is in now.
create or replace function my_homework_file(p_file uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('provider', f.provider, 'external_id', f.external_id, 'url', f.url, 'label', f.label)
  from file_links f
  join homework_sheets h on h.id = f.owner_id
  where f.id = p_file and f.owner_type = 'homework_sheet'
    and exists (select 1 from enrolments e
                where e.student_id = current_student_id() and e.batch_id = h.batch_id and e.ended_on is null)
$$;

revoke execute on function my_homework(), my_homework_file(uuid) from public, anon;
grant execute on function my_homework(), my_homework_file(uuid) to authenticated;
