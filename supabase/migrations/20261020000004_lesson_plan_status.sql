-- Lesson plan statuses: every topic starts "Not started"; staff move it to "In progress", then "Completed".
-- Completing a topic sets homework for the batch, linked to the topic so it is never sent twice.

-- 1. New batches: copy the curriculum with every topic Not started (topic 1 is no longer set In progress).
create or replace function seed_batch_topics() returns trigger language plpgsql as $$
begin
  insert into batch_topics (batch_id, position, name, status)
  select new.id, row_number() over (order by coalesce(ct.year_group, 0) desc, ct.position),
         ct.name, 'not_started'
  from curriculum_topics ct
  where ct.subject_id = new.subject_id and (ct.year_group is null or ct.year_group = new.year_group);
  return new;
end $$;

-- 2. Homework set by completing a topic remembers that topic (one homework per topic).
alter table homework_sheets add column if not exists topic_id uuid references batch_topics(id) on delete set null;
create unique index if not exists homework_sheets_one_per_topic on homework_sheets(topic_id) where topic_id is not null;

-- 3. Existing batches: topic 1 was set In progress automatically and nothing could be moved by hand,
--    so put it back to Not started. Skipped once anyone has completed a topic, so re-running is safe.
update batch_topics set status = 'not_started', completed_on = null
where status = 'in_progress' and position = 1
  and not exists (select 1 from batch_topics done where done.status = 'complete');
