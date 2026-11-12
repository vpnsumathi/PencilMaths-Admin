-- Class notes and documents: staff and a batch's teacher add notes, worksheets and other documents to a batch,
-- optionally tied to a lesson plan topic. The students of that batch see them in a new "Class Notes/Documents"
-- tab in their login (/me/notes).
-- Files are uploaded to Google Drive (PencilMaths / Class notes / <batch code>) like homework sheets; this table
-- only records where each file is. A note can also be just text, or a link.
-- See Help/22-class-notes.md.
-- Safe to run twice. Run after 20261106000001_faster_database.sql (it uses my_batch_ids()).
-- Run on Staging first; on Production at go-live.

-- 1. The notes.
create table if not exists class_notes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  body text check (body is null or length(body) <= 5000),
  -- The lesson plan topic it is for (optional). Classes on the Lesson library use lesson_id;
  -- classes on the subject's curriculum list use topic_id. Never both.
  topic_id uuid references batch_topics(id) on delete set null,
  lesson_id uuid references lessons(id) on delete set null,
  -- The attached file or link (optional): google_drive = uploaded through the app, external_link = a pasted link.
  provider file_provider,
  external_id text,
  url text,
  file_name text,
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  constraint class_notes_one_topic check (topic_id is null or lesson_id is null),
  constraint class_notes_file check (
    (provider is null and external_id is null and url is null and file_name is null)
    or (provider = 'google_drive' and external_id is not null)
    or (provider = 'external_link' and url ~* '^https?://\S+$')),
  -- A note with nothing in it is no use to a student: it needs some text, a file or a link.
  constraint class_notes_not_empty check (provider is not null or length(btrim(coalesce(body, ''))) > 0)
);
create index if not exists class_notes_batch_idx on class_notes (batch_id, created_at desc);
create index if not exists class_notes_topic_idx on class_notes (topic_id) where topic_id is not null;
create index if not exists class_notes_lesson_idx on class_notes (lesson_id) where lesson_id is not null;

-- 2. Checks and stamps on every new note:
--    - the topic must be one of this batch's topics, and the lesson must be in this batch's subject and year;
--    - who added it is taken from the login (never from the form), with their name kept for the list.
create or replace function class_note_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- A note stays in the batch it was added to.
  if tg_op = 'UPDATE' then new.batch_id := old.batch_id; end if;
  if new.topic_id is not null and not exists (
       select 1 from batch_topics t where t.id = new.topic_id and t.batch_id = new.batch_id) then
    raise exception 'That topic is not in this batch''s lesson plan.';
  end if;
  if new.lesson_id is not null and not exists (
       select 1 from lessons l join batches b on b.subject_id = l.subject_id and b.year_group = l.year_group
       where l.id = new.lesson_id and b.id = new.batch_id) then
    raise exception 'That lesson is not in this batch''s lesson plan.';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_name := coalesce(
      (select s.full_name from staff s where s.id = auth.uid() and s.active),
      (select t.first_name || ' ' || t.last_name from teachers t where t.auth_user_id = auth.uid() and t.status <> 'left'),
      new.created_by_name);
    new.created_at := now();
  else
    -- Who added it and when never change.
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists class_note_check on class_notes;
create trigger class_note_check before insert or update on class_notes
  for each row execute function class_note_check();

-- 3. Security. Staff: everything. A teacher: their own open batches only (read, add, remove).
--    Students and families never read the table; they use my_class_notes() below.
alter table class_notes enable row level security;
drop policy if exists staff_all on class_notes;
drop policy if exists notes_teacher_read on class_notes;
drop policy if exists notes_teacher_add on class_notes;
drop policy if exists notes_teacher_remove on class_notes;
create policy staff_all on class_notes for all to authenticated using ((select is_staff())) with check ((select is_staff()));
create policy notes_teacher_read on class_notes for select to authenticated using (batch_id in (select my_batch_ids()));
create policy notes_teacher_add on class_notes for insert to authenticated with check (batch_id in (select my_batch_ids()));
create policy notes_teacher_remove on class_notes for delete to authenticated using (batch_id in (select my_batch_ids()));
revoke all on class_notes from anon;
grant select, insert, update, delete on class_notes to authenticated;

-- 4. Students: the notes of every batch they are in now, newest first. A family login sees the child
--    chosen in the switcher (current_student_id). The Drive file id is not given out; the file opens
--    through the app (/me/notes/<id>), which calls my_class_note_file.
create or replace function my_class_notes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id,
           'title', n.title,
           'body', n.body,
           'created_at', n.created_at,
           'batch_id', b.id,
           'subject', sj.name,
           'topic', coalesce(l.code || ' ' || l.name, t.name),
           'has_file', n.provider is not null,
           'is_link', n.provider = 'external_link',
           'file_name', n.file_name
         ) order by n.created_at desc, n.title), '[]'::jsonb)
  from class_notes n
  join batches b on b.id = n.batch_id
  join subjects sj on sj.id = b.subject_id
  left join lessons l on l.id = n.lesson_id
  left join batch_topics t on t.id = n.topic_id
  where exists (select 1 from enrolments e
                where e.batch_id = n.batch_id and e.ended_on is null and e.student_id = current_student_id())
$$;

-- One note's file or link, only for a student who is in that batch now.
create or replace function my_class_note_file(p_note uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('provider', n.provider, 'external_id', n.external_id, 'url', n.url,
                            'label', coalesce(n.file_name, n.title))
  from class_notes n
  where n.id = p_note and n.provider is not null
    and exists (select 1 from enrolments e
                where e.batch_id = n.batch_id and e.ended_on is null and e.student_id = current_student_id())
$$;

revoke execute on function my_class_notes(), my_class_note_file(uuid) from public, anon;
grant execute on function my_class_notes(), my_class_note_file(uuid) to authenticated;
revoke execute on function class_note_check() from public, anon, authenticated;
