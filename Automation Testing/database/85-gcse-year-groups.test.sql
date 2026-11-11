-- GCSE - H and GCSE - F (stored as 11 and 12) instead of Year 11, 12 and 13.

select tests.as('admin');
select tests.eq(year_label(5), 'Year 5', 'Years 1 to 10 are shown as "Year N"');
select tests.eq(year_label(11), 'GCSE - H', '11 is shown as GCSE - H');
select tests.eq(year_label(12), 'GCSE - F', '12 is shown as GCSE - F');

select tests.eq(import_year('GCSE-H'), 11, 'Bulk import reads "GCSE-H"');
select tests.eq(import_year('GCSE - F'), 12, 'Bulk import reads "GCSE - F"');
select tests.eq(import_year('gcse higher'), 11, 'Bulk import reads "GCSE Higher"');
select tests.eq(import_year('Foundation'), 12, 'Bulk import reads "Foundation"');
select tests.eq(import_year('Year 7'), 7, 'Bulk import still reads "Year 7"');

select tests.lives($$select save_student('{"first_name": "Gus", "last_name": "Gcse", "year_group": 11, "status": "active", "enrolments": [{"subject_id": "maths"}]}')$$,
  'A GCSE - H student can be saved');
select tests.lives($$select save_student('{"first_name": "Fay", "last_name": "Gcse", "year_group": 12, "status": "active", "enrolments": [{"subject_id": "maths"}]}')$$,
  'A GCSE - F student can be saved');
select tests.as_owner();
select tests.throws($$update batches set year_group = 13 where code = 'TB-1'$$, 'year_group_check', 'A batch can''t be Year 13');
select tests.throws($$update lessons set year_group = 13 where year_group = 5$$, 'year_group_check', 'A Lesson library lesson can''t be Year 13');
select tests.throws($$update teachers set year_max = 13 where first_name = 'Tom'$$, 'year_max_check', 'A teacher''s highest year can''t be 13');
select tests.as('admin');

-- Bulk import
\set gcse '[{"row": 2, "year": "GCSE-H", "batch": "Batch H", "student": "Hal Higher", "teacher": "Tom One", "time": "Fri 18:00"},{"row": 3, "year": "GCSE - F", "batch": "Batch F", "student": "Flo Found", "teacher": "Tom One", "time": "Fri 19:00"}]'
select bulk_import(:'gcse'::jsonb, false) as g \gset
select tests.eq((:'g'::jsonb->>'saved')::boolean, true, 'A file with GCSE-H and GCSE-F is imported');
select tests.eq((select year_group from students where first_name = 'Hal'), 11::smallint, 'A GCSE-H student is saved as GCSE - H');
select tests.eq((select year_group from students where first_name = 'Flo'), 12::smallint, 'A GCSE-F student is saved as GCSE - F');
select tests.eq((select year_group from batches where name = 'Batch F'), 12::smallint, 'A GCSE-F batch is saved as GCSE - F');

select bulk_import('[{"row": 2, "year": "Year 11", "batch": "Batch Old", "student": "Ola Old", "teacher": "Tom One", "time": "Sat 18:00"}]'::jsonb, false) as old \gset
select tests.eq((:'old'::jsonb->>'saved')::boolean, false, 'A file that still says Year 11 is not saved');
select tests.ok((:'old'::jsonb->'errors')::text ilike '%Use GCSE-H or GCSE-F%', 'The problem says to use GCSE-H or GCSE-F');
select bulk_import('[{"row": 2, "year": "Year 13", "batch": "Batch Old", "student": "Ola Old", "teacher": "Tom One", "time": "Sat 18:00"}]'::jsonb, false) as old13 \gset
select tests.eq((:'old13'::jsonb->>'saved')::boolean, false, 'A file that says Year 13 is not saved');
select bulk_import('[{"row": 2, "year": "GCSE-X", "batch": "Batch Old", "student": "Ola Old", "teacher": "Tom One", "time": "Sat 18:00"}]'::jsonb, false) as bad \gset
select tests.eq((:'bad'::jsonb->>'saved')::boolean, false, 'An unknown year such as GCSE-X is not saved');
select tests.eq((select count(*) from students where first_name = 'Ola'), 0::bigint, 'Nothing from those files is saved');

-- Nothing is left in Year 13 after the change.
select tests.as_owner();
select tests.eq((select count(*) from students where year_group > 12) + (select count(*) from batches where year_group > 12)
  + (select count(*) from lessons where year_group > 12), 0::bigint, 'No students, batches or lessons are in Year 13');
