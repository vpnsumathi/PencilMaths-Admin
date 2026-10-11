-- Reference data (subjects and curriculum topics): all active staff can read it, only admins can change it.
-- Replaces the staff_all rules that file 3 created for these two tables.

drop policy staff_all on subjects;
create policy staff_read on subjects for select to authenticated using (is_staff());
create policy admin_write on subjects for all to authenticated using (is_admin()) with check (is_admin());

drop policy staff_all on curriculum_topics;
create policy staff_read on curriculum_topics for select to authenticated using (is_staff());
create policy admin_write on curriculum_topics for all to authenticated using (is_admin()) with check (is_admin());

-- Move a curriculum topic up or down within its subject and year group by swapping positions with its neighbour.
create or replace function move_curriculum_topic(p_id uuid, p_direction text) returns void
language plpgsql security invoker set search_path = public as $$
declare
  t curriculum_topics%rowtype;
  n curriculum_topics%rowtype;
begin
  if not is_admin() then raise exception 'Not allowed'; end if;
  if p_direction not in ('up', 'down') then raise exception 'Direction must be up or down'; end if;

  select * into t from curriculum_topics where id = p_id;
  if not found then raise exception 'Topic not found'; end if;

  select * into n from curriculum_topics
  where subject_id = t.subject_id
    and year_group is not distinct from t.year_group
    and case when p_direction = 'up' then position < t.position else position > t.position end
  order by case when p_direction = 'up' then -position else position end
  limit 1;
  if not found then return; end if; -- already first or last

  -- Park the topic at -1 first so the two never share a position (positions must be unique).
  update curriculum_topics set position = -1 where id = t.id;
  update curriculum_topics set position = t.position where id = n.id;
  update curriculum_topics set position = n.position where id = t.id;
end $$;
grant execute on function move_curriculum_topic(uuid, text) to authenticated;
