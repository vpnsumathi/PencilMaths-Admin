-- Hand-ins are recorded by the app's server only (Help/23-engineering-audit.md, E2).
-- Before: handin_record could be called from any browser with the hand-in code, with any file id and web address,
-- so someone with a WhatsApp link could add a link to any website as a "handed-in file".
-- Now: only the server (after it has uploaded the file to Drive itself) can record it, the saved address is
-- worked out from the Drive file id, and two uploads at the same moment can't go past the 20-file limit.
-- Run on Staging; Production at go-live after 20261111000002_class_notes.sql. Safe to run twice.

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
  if p_file_id is null or p_file_id !~ '^[A-Za-z0-9_-]{10,200}$' then raise exception 'Not a Drive file id'; end if;

  -- One upload at a time per student and homework, so the count below can't be raced.
  perform 1 from homework_results where sheet_id = p_sheet and student_id = sid for update;
  if (select count(*) from file_links
      where owner_type = 'homework_submission' and owner_id = p_sheet and student_id = sid) >= 20 then
    raise exception 'Too many files for this homework';
  end if;

  -- p_url is no longer used: the address always points at the Drive file itself.
  insert into file_links (owner_type, owner_id, student_id, provider, external_id, url, label)
  values ('homework_submission', p_sheet, sid, 'google_drive', p_file_id,
          'https://drive.google.com/file/d/' || p_file_id || '/view', left(p_label, 200));

  update homework_results
    set status = case when status = 'marked' then 'marked'::homework_status else 'received'::homework_status end,
        received_on = coalesce(received_on, current_date)
  where sheet_id = p_sheet and student_id = sid;
end $$;

-- Only the server's full-rights key may record a hand-in. Reading the link page and checking a homework stay public.
revoke execute on function handin_record(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function handin_record(text, uuid, text, text, text) to service_role;

-- The student login's version recorded through the browser's own login; the server now uses handin_record instead.
drop function if exists my_handin_record(uuid, text, text, text);
