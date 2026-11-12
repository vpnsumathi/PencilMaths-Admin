-- Bulk import (Settings › Bulk import): students, batches, teachers and class times from a spreadsheet.

\set rows '[{"row": 2, "year": "Year 4", "batch": "Batch 1", "student": "Ivy Import", "teacher": "Agnes", "time": "Sat 10:00"},{"row": 3, "year": "Year 4", "batch": "Batch 1", "student": "Omar Import", "teacher": "Agnes", "time": "Sat 10:00"},{"row": 4, "year": "Year 5", "batch": "Batch 2", "student": "Sam One", "teacher": "Tom One", "time": "Wed 17:30"}]'

select tests.as('office');
select tests.throws(format('select bulk_import(%L::jsonb, true)', :'rows'), 'Only admins can bulk import', 'Only admins can bulk import');

select tests.as('admin');
select bulk_import(:'rows'::jsonb, true) as dry \gset
select tests.eq((:'dry'::jsonb->>'ok')::boolean, true, 'A check (dry run) of a good file finds no problems');
select tests.eq((:'dry'::jsonb->>'saved')::boolean, false, 'A check (dry run) saves nothing');
select tests.eq((select count(*) from students), 4::bigint, 'After a check, there are no new students');
select tests.eq((select count(*) from teachers), 3::bigint, 'After a check, there are no new teachers');
select tests.eq((select count(*) from batches), 3::bigint, 'After a check, there are no new batches');

select bulk_import(:'rows'::jsonb, false) as real \gset
select tests.eq((:'real'::jsonb->>'saved')::boolean, true, 'Importing a good file saves it');
select tests.eq((select count(*) from teachers where first_name = 'Agnes'), 1::bigint, 'A new teacher in the file is added');
select tests.eq((select count(*) from students where last_name = 'Import'), 2::bigint, 'New students in the file are added');
select tests.eq((select count(*) from students where first_name = 'Sam'), 1::bigint, 'A student already in the system is matched, not added twice');
select tests.eq((select b.name from enrolments e join batches b on b.id = e.batch_id
                 where e.student_id = '30000000-0000-0000-0000-000000000001' and e.ended_on is null), 'Batch 2',
  'A matched student is moved to the batch in the file');
select tests.eq((select count(*) from enrolments e join batches b on b.id = e.batch_id where b.name = 'Batch 1' and b.year_group = 4 and e.ended_on is null),
  2::bigint, 'The new batch has its students');
select tests.eq((select to_char(s.start_time, 'HH24:MI') from batch_slots s join batches b on b.id = s.batch_id where b.name = 'Batch 1' and b.year_group = 4),
  '10:00', 'The new batch has its class time');
select tests.eq((select count(*) from batch_topics t join batches b on b.id = t.batch_id where b.name = 'Batch 1' and b.year_group = 4)
                > 0, true, 'The new batch gets its lesson plan');

select bulk_import(:'rows'::jsonb, false) as again \gset
select tests.eq((select count(*) from students), 6::bigint, 'Importing the same file again adds no students');
select tests.eq((select count(*) from teachers), 4::bigint, 'Importing the same file again adds no teachers');
select tests.eq((select count(*) from batches), 5::bigint, 'Importing the same file again adds no batches');
select tests.eq((select count(*) from jsonb_array_elements(:'again'::jsonb->'students') s where s->>'place' <> 'unchanged'), 0::bigint,
  'Importing the same file again changes no one''s batch');

-- Problems are reported and nothing is saved.
select bulk_import('[{"row": 2, "year": "Year 4", "batch": "Batch 9", "student": "", "teacher": "Agnes", "time": "Sat 11:00"},
                     {"row": 3, "year": "", "batch": "Batch 9", "student": "Una Undated", "teacher": "Agnes", "time": "Sat 11:00"}]'::jsonb, false) as bad \gset
select tests.eq((:'bad'::jsonb->>'ok')::boolean, false, 'A file with problems is reported as not OK');
select tests.eq((:'bad'::jsonb->>'saved')::boolean, false, 'A file with problems is not saved');
select tests.ok(jsonb_array_length(:'bad'::jsonb->'errors') > 0, 'The problems are listed with their row');
select tests.eq((select count(*) from students where first_name = 'Una'), 0::bigint, 'Nothing from a file with problems is saved');
select tests.throws($$select bulk_import('[]'::jsonb, false)$$, 'Nothing to import', 'An empty file is refused with a message');

-- A file that would give a teacher the same class time twice is refused.
select bulk_import('[{"row": 2, "year": "Year 6", "batch": "Batch 7", "student": "Cal Clash", "teacher": "Tom One", "time": "Mon 16:00"}]'::jsonb, false) as clash \gset
select tests.eq((:'clash'::jsonb->>'saved')::boolean, false, 'A file that gives a teacher a time they already teach is not saved');
select tests.ok((:'clash'::jsonb->'errors')::text ilike '%already teaches%', 'The problem says which batch the teacher already teaches then');
