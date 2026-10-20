-- Phase 4: WhatsApp homework hand-in link.
-- Families are not signed in, so they reach the data only through the three functions below,
-- which run with full rights (security definer) but only for the student whose secret code is given.

-- 1. A secret hand-in code per student: 32 random characters. Existing students get one too.
alter table students add column handin_code text not null unique
  default replace(gen_random_uuid()::text, '-', '');

-- 2. The hand-in page: the student's first name and homework from their current batches (last 90 days).
create or replace function handin_page(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_name', s.first_name,
    'homework', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sheet_id', h.id, 'title', h.title, 'subject', sub.name,
        'set_on', h.set_on, 'due_on', h.due_on, 'max_mark', h.max_mark,
        'status', coalesce(r.status::text, 'pending'), 'mark', r.mark,
        'files', (select count(*) from file_links f
                  where f.owner_type = 'homework_submission' and f.owner_id = h.id and f.student_id = s.id)
      ) order by coalesce(h.due_on, h.set_on) desc)
      from homework_sheets h
      join batches b on b.id = h.batch_id
      join subjects sub on sub.id = b.subject_id
      left join homework_results r on r.sheet_id = h.id and r.student_id = s.id
      where h.set_on >= current_date - 90
        and exists (select 1 from enrolments e
                    where e.student_id = s.id and e.batch_id = h.batch_id and e.ended_on is null)
    ), '[]'::jsonb)
  )
  from students s
  where s.handin_code = p_code and s.status <> 'left'
$$;

-- 3. Before an upload: check the code and homework belong together, and say where the file goes.
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
$$;

-- 4. After an upload to Drive: record the file and mark the homework received (a marked one stays marked).
create or replace function handin_record(p_code text, p_sheet uuid, p_file_id text, p_url text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select s.id into sid
  from students s
  join homework_sheets h on h.id = p_sheet
  join enrolments e on e.student_id = s.id and e.batch_id = h.batch_id and e.ended_on is null
  where s.handin_code = p_code and s.status <> 'left';
  if sid is null then raise exception 'Link or homework not found'; end if;

  if (select count(*) from file_links
      where owner_type = 'homework_submission' and owner_id = p_sheet and student_id = sid) >= 20 then
    raise exception 'Too many files for this homework';
  end if;

  insert into file_links (owner_type, owner_id, student_id, provider, external_id, url, label)
  values ('homework_submission', p_sheet, sid, 'google_drive', p_file_id, p_url, p_label);

  insert into homework_results (sheet_id, student_id, status, received_on)
  values (p_sheet, sid, 'received', current_date)
  on conflict (sheet_id, student_id) do update
    set status = case when homework_results.status = 'marked'
                      then 'marked'::homework_status else 'received'::homework_status end,
        received_on = coalesce(homework_results.received_on, current_date);
end $$;

-- Families' phones call these without signing in (the "anon" role).
grant execute on function handin_page(text) to anon, authenticated;
grant execute on function handin_target(text, uuid) to anon, authenticated;
grant execute on function handin_record(text, uuid, text, text, text) to anon, authenticated;
