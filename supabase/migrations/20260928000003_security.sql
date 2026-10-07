-- Row level security. Phase 1: only active staff (operations, head teacher, admin) can use the portal.
-- Parent contact details live in families/guardians so a future teacher role can be denied them.

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and active)
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and active and role = 'admin')
$$;

do $$
declare t text;
begin
  foreach t in array array['subjects','curriculum_topics','teachers','families','guardians','students','batches','batch_slots',
    'enrolments','batch_topics','class_sessions','attendance','homework_sheets','homework_results','enquiries',
    'enquiry_subjects','enquiry_events','student_notes','file_links']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy staff_all on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

alter table staff enable row level security;
create policy staff_read on staff for select to authenticated using (is_staff());
create policy staff_admin_write on staff for all to authenticated using (is_admin()) with check (is_admin());

grant execute on function expected_classes(date, date) to authenticated;
