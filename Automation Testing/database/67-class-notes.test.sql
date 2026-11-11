-- Class notes and documents (20261111000002_class_notes.sql, Help/22-class-notes.md).
-- Fixtures: TB-1 (Tom, Sam and Kim), TB-2 (Tia, Lee), TB-3 (Tom, closed). Lesson L1 is Maths Y5, L2 is Maths Y6.

select tests.as_owner();
select id as topic1 from batch_topics where batch_id = '40000000-0000-0000-0000-000000000001' order by position limit 1 \gset
select id as topic2 from batch_topics where batch_id = '40000000-0000-0000-0000-000000000002' order by position limit 1 \gset

-- Staff add notes.
select tests.as('admin');
select tests.lives($$insert into class_notes (id, batch_id, title, body, lesson_id, provider, external_id, file_name)
  values ('90000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Place value notes', 'Read before Monday.',
          '50000000-0000-0000-0000-000000000001', 'google_drive', 'drv-note-1', 'place-value.pdf')$$,
  'Staff can add a note with a file to a batch, tied to a Lesson library lesson');
select tests.eq((select created_by_name from class_notes where id = '90000000-0000-0000-0000-000000000001'), 'Ada Admin',
  'A note remembers who added it');
select tests.lives($$insert into class_notes (id, batch_id, title, body, created_by_name)
  values ('90000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Times tables tips', 'Practise the 7s.', 'Someone else')$$,
  'Staff can add a text-only note');
select tests.eq((select created_by_name from class_notes where id = '90000000-0000-0000-0000-000000000002'), 'Ada Admin',
  'Who added a note comes from the login, not from what the form sends');
select tests.lives(format($$insert into class_notes (id, batch_id, title, topic_id, provider, url)
  values ('90000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'Video', %L, 'external_link', 'https://example.test/video')$$, :'topic2'),
  'Staff can add a link, tied to a curriculum topic');
select tests.throws($$insert into class_notes (batch_id, title) values ('40000000-0000-0000-0000-000000000001', 'Empty')$$,
  'class_notes_not_empty', 'A note needs some text, a file or a link');
select tests.throws($$insert into class_notes (batch_id, title, body) values ('40000000-0000-0000-0000-000000000001', '   ', 'x')$$,
  'class_notes_title_check', 'A note needs a title');
select tests.throws($$insert into class_notes (batch_id, title, provider, url) values ('40000000-0000-0000-0000-000000000001', 'Bad link', 'external_link', 'javascript:alert(1)')$$,
  'class_notes_file', 'A link must start with http:// or https://');
select tests.throws($$insert into class_notes (batch_id, title, provider) values ('40000000-0000-0000-0000-000000000001', 'No file', 'google_drive')$$,
  'class_notes_file', 'An uploaded file must have its Drive id');
select tests.throws(format($$insert into class_notes (batch_id, title, body, topic_id) values ('40000000-0000-0000-0000-000000000001', 'Wrong topic', 'x', %L)$$, :'topic2'),
  'not in this batch', 'A topic from another batch is refused');
select tests.throws($$insert into class_notes (batch_id, title, body, lesson_id) values ('40000000-0000-0000-0000-000000000001', 'Wrong year', 'x', '50000000-0000-0000-0000-000000000002')$$,
  'not in this batch', 'A Lesson library lesson from another year is refused');
select tests.throws(format($$insert into class_notes (batch_id, title, body, topic_id, lesson_id) values ('40000000-0000-0000-0000-000000000001', 'Both', 'x', %L, '50000000-0000-0000-0000-000000000001')$$, :'topic1'),
  'class_notes_one_topic', 'A note is tied to one topic at most');
update class_notes set created_by_name = 'Changed', batch_id = '40000000-0000-0000-0000-000000000003' where id = '90000000-0000-0000-0000-000000000001';
select tests.eq((select created_by_name || ' / ' || batch_id from class_notes where id = '90000000-0000-0000-0000-000000000001'),
  'Ada Admin / 40000000-0000-0000-0000-000000000001', 'Who added a note, and its batch, never change');

select tests.as('office');
select tests.eq((select count(*) from class_notes), 3::bigint, 'Office staff see every batch''s notes');
select tests.lives($$insert into class_notes (batch_id, title, body) values ('40000000-0000-0000-0000-000000000001', 'From the office', 'Bring a calculator.')$$,
  'Office staff can add notes too');

select tests.as('former');
select tests.eq((select count(*) from class_notes), 0::bigint, 'Staff who have left see no notes');
select tests.throws($$insert into class_notes (batch_id, title, body) values ('40000000-0000-0000-0000-000000000001', 'x', 'x')$$,
  'row-level security', 'Staff who have left can''t add notes');

-- Teachers: their own open batches only.
select tests.as('teacher1');
select tests.eq((select count(*) from class_notes), 2::bigint, 'A teacher sees the notes of their own batches only');
select tests.eq((select count(*) from class_notes where batch_id = '40000000-0000-0000-0000-000000000002'), 0::bigint,
  'A teacher sees no notes of another teacher''s batch');
select tests.lives(format($$insert into class_notes (id, batch_id, title, body, topic_id)
  values ('90000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', 'Rounding', 'Round to the nearest 10.', %L)$$, :'topic1'),
  'A teacher can add a note to their own batch');
select tests.eq((select created_by_name from class_notes where id = '90000000-0000-0000-0000-000000000004'), 'Tom One',
  'A teacher''s note shows the teacher''s name');
select tests.throws($$insert into class_notes (batch_id, title, body) values ('40000000-0000-0000-0000-000000000002', 'x', 'x')$$,
  'row-level security', 'A teacher can''t add a note to another teacher''s batch');
select tests.throws($$insert into class_notes (batch_id, title, body) values ('40000000-0000-0000-0000-000000000003', 'x', 'x')$$,
  'row-level security', 'A teacher can''t add a note to their closed batch');
with gone as (delete from class_notes where id = '90000000-0000-0000-0000-000000000002' returning 1)
select tests.eq((select count(*) from gone), 0::bigint, 'A teacher can''t remove another teacher''s note');
with changed as (update class_notes set title = 'Changed' where id = '90000000-0000-0000-0000-000000000001' returning 1)
select tests.eq((select count(*) from changed), 0::bigint, 'A teacher can''t change a note (remove it and add it again instead)');

select tests.as('teacher2');
select tests.eq((select count(*) from class_notes), 2::bigint, 'The other teacher sees only their batch''s notes');
with gone as (delete from class_notes where id = '90000000-0000-0000-0000-000000000003' returning 1)
select tests.eq((select count(*) from gone), 1::bigint, 'A teacher can remove a note from their own batch');

select tests.as('teacher_left');
select tests.eq((select count(*) from class_notes), 0::bigint, 'A teacher who has left sees no notes');

-- Students and families. (Everything here happens in one moment, so the Rounding note is made a minute newer.)
select tests.as_owner();
alter table class_notes disable trigger class_note_check;
update class_notes set created_at = now() + interval '1 minute' where id = '90000000-0000-0000-0000-000000000004';
alter table class_notes enable trigger class_note_check;
select tests.as('family');
select tests.eq((select count(*) from class_notes), 0::bigint, 'A family login can''t read the notes table itself');
select tests.eq(jsonb_array_length(my_class_notes()), 3, 'A family sees all notes of their child''s batch');
select tests.eq(my_class_notes()->0->>'title', 'Rounding',
  'Newest note comes first');
select tests.eq((select n->>'topic' from jsonb_array_elements(my_class_notes()) n where n->>'id' = '90000000-0000-0000-0000-000000000001'),
  'TY5-L1 Place value', 'A note shows the Lesson library lesson it is for');
select tests.ok((select bool_and(not (n ? 'external_id') and not (n ? 'url')) from jsonb_array_elements(my_class_notes()) n),
  'The note list never gives out Drive ids or links (files open through the app)');
select tests.eq(my_class_note_file('90000000-0000-0000-0000-000000000001')->>'external_id', 'drv-note-1',
  'A student can open a file of their own batch''s note');
select tests.eq(my_class_note_file('90000000-0000-0000-0000-000000000004'), null, 'A text-only note has no file to open');

select tests.as('lee');
select tests.eq(jsonb_array_length(my_class_notes()), 1, 'Lee sees only the notes of his own batch');
select tests.eq(my_class_note_file('90000000-0000-0000-0000-000000000001'), null, 'A student can''t open another batch''s note file');

select tests.as_owner();
update enrolments set ended_on = current_date where student_id = '30000000-0000-0000-0000-000000000003';
select tests.as('lee');
select tests.eq(jsonb_array_length(my_class_notes()), 0, 'A student who has left the batch no longer sees its notes');

select tests.as('nobody');
select tests.eq(my_class_notes(), '[]'::jsonb, 'A login that is not a student gets no notes');
select tests.as(null);
select tests.throws($$select my_class_notes()$$, 'permission denied', 'Notes can''t be read without signing in');
select tests.throws($$select count(*) from class_notes$$, 'permission denied', 'The notes table can''t be read without signing in');

-- Housekeeping.
select tests.as_owner();
delete from lessons where id = '50000000-0000-0000-0000-000000000001';
select tests.eq((select lesson_id from class_notes where id = '90000000-0000-0000-0000-000000000001'), null,
  'Deleting a Lesson library lesson keeps the note, without its lesson');
select tests.eq((select string_agg(policyname, ', ' order by policyname) from pg_policies
                 where schemaname = 'public' and tablename = 'class_notes' and policyname like 'notes\_teacher\_%'),
  'notes_teacher_add, notes_teacher_read, notes_teacher_remove', 'Teachers have exactly three rules on class notes (read, add, remove)');
select tests.ok((select bool_and(coalesce(qual, with_check) like '%my_batch_ids()%') from pg_policies
                 where tablename = 'class_notes' and policyname like 'notes\_teacher\_%'),
  'The teacher rules on class notes use the my_batch_ids() list (guide 18)');
delete from homework_sheets where batch_id = '40000000-0000-0000-0000-000000000002';
delete from enrolments where batch_id = '40000000-0000-0000-0000-000000000002';
delete from batches where id = '40000000-0000-0000-0000-000000000002';
select tests.eq((select count(*) from class_notes where batch_id = '40000000-0000-0000-0000-000000000002'), 0::bigint,
  'Deleting a batch deletes its notes');
