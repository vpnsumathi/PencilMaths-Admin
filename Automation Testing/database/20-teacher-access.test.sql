-- Teachers: a teacher sees and changes only their own open batches and the students in them.
-- Tom One (teacher1) teaches TB-1 (Sam, Kim) and the closed TB-3. Tia Two (teacher2) teaches TB-2 (Lee).

select tests.as('teacher1');
select tests.eq((select string_agg(code, ',' order by code) from batches), 'TB-1',
  'A teacher sees only their own open batch (not other teachers'' batches or closed ones)');
select tests.eq((select string_agg(first_name, ',' order by first_name) from students), 'Kim,Sam',
  'A teacher sees only the students in their batch');
select tests.eq((select count(*) from enrolments), 2::bigint, 'A teacher sees only their batch''s enrolments');
select tests.eq((select string_agg(title, ',') from homework_sheets), 'Fractions sheet', 'A teacher sees only their batch''s homework');
select tests.eq((select count(*) from homework_results), 2::bigint, 'A teacher sees only their students'' homework results');
select tests.eq((select count(*) from batch_slots), 1::bigint, 'A teacher sees only their batch''s class times');
select tests.eq((select count(*) from batch_topics), (select count(*) from batch_topics where batch_id = '40000000-0000-0000-0000-000000000001'),
  'A teacher sees only their batch''s lesson plan');
select tests.eq((select string_agg(name, ',') from lessons), 'Place value',
  'A teacher sees only Lesson library lessons for the subject and year they teach');
select tests.eq((select count(*) from lesson_homework), 3::bigint, 'A teacher sees the homework sheets of those lessons');
select tests.eq((select count(*) from subjects), 4::bigint, 'A teacher can read the subjects list');
select tests.eq((select count(*) from file_links where owner_type = 'homework_sheet'), 1::bigint,
  'A teacher sees the worksheet of their own homework only');
select tests.eq((select count(*) from file_links where owner_type = 'student_folder'), 0::bigint,
  'A teacher can''t see students'' Drive folder rows');
select tests.eq((select count(*) from file_links where owner_type = 'homework_submission'), 0::bigint,
  'A teacher can''t see hand-ins from another teacher''s batch');
select tests.eq((select count(*) from guardians), 0::bigint, 'A teacher can''t see parent contact details');
select tests.eq((select count(*) from families), 0::bigint, 'A teacher can''t see families');
select tests.eq((select count(*) from enquiries), 0::bigint, 'A teacher can''t see enquiries');
select tests.eq((select count(*) from staff), 0::bigint, 'A teacher can''t see the staff list');
select tests.eq((select count(*) from teachers), 0::bigint, 'A teacher can''t see the teachers list');
select tests.eq((select count(*) from student_notes), 0::bigint, 'A teacher can''t see student notes');
select tests.throws($$select date_of_birth from students$$, 'permission denied', 'A teacher can''t read dates of birth');
select tests.ok(student_private('30000000-0000-0000-0000-000000000001') is null,
  'A teacher can''t read a date of birth or hand-in code through student_private');
select tests.eq(student_drive_folder('30000000-0000-0000-0000-000000000001'), 'folder-sam',
  'A teacher can get their own student''s Drive folder, to save corrected sheets');
select tests.throws($$select student_drive_folder('30000000-0000-0000-0000-000000000003')$$, 'Not allowed',
  'A teacher can''t get another teacher''s student''s Drive folder');
select tests.eq(current_teacher()->>'first_name', 'Tom', 'The menu shows the signed-in teacher''s name');

-- What a teacher can change.
select tests.eq((set_homework('40000000-0000-0000-0000-000000000001', '{"title": "Extra practice"}')->>'students')::int, 2,
  'A teacher can set homework for their own batch, and each student in it gets it');
select tests.throws($$select set_homework('40000000-0000-0000-0000-000000000002', '{"title": "Not mine"}')$$, 'row-level security',
  'A teacher can''t set homework for another teacher''s batch');
with changed as (
  update homework_results set status = 'marked', mark = 8, marked_on = current_date
  where sheet_id = '70000000-0000-0000-0000-000000000001' and student_id = '30000000-0000-0000-0000-000000000001' returning 1)
select tests.eq(count(*), 1::bigint, 'A teacher can mark their own student''s homework') from changed;
with changed as (
  update homework_results set status = 'marked', mark = 1
  where sheet_id = '70000000-0000-0000-0000-000000000002' returning 1)
select tests.eq(count(*), 0::bigint, 'A teacher can''t mark another teacher''s students') from changed;
select tests.lives($$insert into file_links (owner_type, owner_id, student_id, provider, external_id, label)
  values ('homework_correction', '70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'google_drive', 'c1', 'sam-marked.pdf')$$,
  'A teacher can add a corrected sheet for their own student');
select tests.throws($$insert into file_links (owner_type, owner_id, student_id, provider, external_id, label)
  values ('homework_correction', '70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'google_drive', 'c2', 'lee.pdf')$$,
  'row-level security', 'A teacher can''t add a corrected sheet in another teacher''s batch');
select tests.throws($$insert into file_links (owner_type, owner_id, student_id, provider, external_id, label)
  values ('homework_correction', '70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'google_drive', 'c3', 'lee.pdf')$$,
  'row-level security', 'A teacher can''t add a corrected sheet for a student who isn''t in their batch');
select tests.throws($$insert into file_links (owner_type, owner_id, student_id, provider, external_id)
  values ('student_folder', '30000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000004', 'google_drive', 'x')$$,
  'row-level security', 'A teacher can''t add or change a student''s Drive folder');
with gone as (delete from file_links where id = '80000000-0000-0000-0000-000000000002' returning 1)
select tests.eq(count(*), 0::bigint, 'A teacher can''t remove another batch''s worksheet') from gone;
with gone as (delete from homework_sheets returning 1)
select tests.eq(count(*), 0::bigint, 'A teacher can''t delete homework') from gone;
with changed as (update batches set capacity = 12 returning 1)
select tests.eq(count(*), 0::bigint, 'A teacher can''t change their batch''s settings') from changed;
with changed as (update students set first_name = 'Changed' returning 1)
select tests.eq(count(*), 0::bigint, 'A teacher can''t change student details') from changed;
select tests.throws($$select save_batch('{"subject_id": "maths", "year_group": 5, "teacher_id": "10000000-0000-0000-0000-000000000001", "capacity": 4}')$$,
  'Only staff', 'A teacher can''t add a batch');
select tests.throws($$select save_student('{"first_name": "New", "year_group": 5, "status": "active", "enrolments": [{"subject_id": "maths"}]}')$$,
  'Not allowed', 'A teacher can''t add a student');
select tests.eq(jsonb_array_length(complete_lesson('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
  '{"hw": ["60000000-0000-0000-0000-000000000001"]}')->'codes'), 1,
  'A teacher can mark a lesson completed and send its homework');
select tests.throws($$select complete_lesson('40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001',
  '{"hw": ["60000000-0000-0000-0000-000000000002"]}')$$, 'not part of this class',
  'A teacher can''t complete a lesson for another teacher''s batch');
with changed as (update batch_topics set status = 'in_progress' where batch_id = '40000000-0000-0000-0000-000000000002' returning 1)
select tests.eq(count(*), 0::bigint, 'A teacher can''t change another batch''s lesson plan') from changed;

-- The other teacher sees only their own.
select tests.as('teacher2');
select tests.eq((select string_agg(first_name, ',') from students), 'Lee', 'The second teacher sees only their own student');
select tests.eq((select count(*) from file_links where owner_type = 'homework_submission'), 1::bigint,
  'The second teacher sees their own student''s hand-in');

-- A teacher marked as Left sees nothing.
select tests.as('teacher_left');
select tests.eq((select count(*) from batches), 0::bigint, 'A teacher marked Left sees no batches');
select tests.eq((select count(*) from students), 0::bigint, 'A teacher marked Left sees no students');

-- Closing a batch takes it out of the teacher's view; marking a teacher Left removes everything.
select tests.as_owner();
update batches set closed_on = current_date where id = '40000000-0000-0000-0000-000000000001';
update teachers set status = 'left' where id = '10000000-0000-0000-0000-000000000002';
select tests.as('teacher1');
select tests.eq((select count(*) from students), 0::bigint, 'When a batch is closed, its teacher no longer sees its students');
select tests.eq((select count(*) from homework_results), 0::bigint, 'When a batch is closed, its teacher no longer sees its homework');
select tests.as('teacher2');
select tests.eq((select count(*) from students), 0::bigint, 'When a teacher is marked Left, they see nothing');
