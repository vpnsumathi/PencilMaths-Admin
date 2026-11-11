-- Saving students (the student form): family, parent, subjects and batches, Drive folder link, leaving.

select tests.as('office');

select save_student('{"first_name": " Nia ", "last_name": "New", "year_group": 5, "status": "active", "school": "Hill School",
  "date_of_birth": "2016-09-09",
  "guardian": {"full_name": "Nadia New", "relationship": "Mother", "phone": "07000 000005", "email": "nadia@pm.test"},
  "enrolments": [{"subject_id": "maths", "batch_id": "40000000-0000-0000-0000-000000000001"}, {"subject_id": "science"}],
  "folder_url": "https://drive.google.com/drive/folders/nia"}') as nia \gset
select tests.eq((select first_name from students where id = :'nia'), 'Nia', 'A new student is saved, with spaces trimmed from the name');
select tests.ok((select code from students where id = :'nia') ~ '^PM-\d+$', 'A new student gets a student code (PM-…)');
select tests.eq((select display_name from families f join students s on s.family_id = f.id where s.id = :'nia'), 'New family',
  'A new student gets a family named after them');
select tests.eq((select full_name from guardians g join students s on s.family_id = g.family_id where s.id = :'nia' and g.is_primary), 'Nadia New',
  'The parent is saved as the main contact');
select tests.eq((select count(*) from enrolments where student_id = :'nia' and ended_on is null), 2::bigint, 'Each subject is saved');
select tests.eq((select teacher_id from enrolments where student_id = :'nia' and subject_id = 'maths'), '10000000-0000-0000-0000-000000000001'::uuid,
  'A student put in a batch gets the batch''s teacher');
select tests.eq((select url from file_links where student_id = :'nia' and owner_type = 'student_folder'), 'https://drive.google.com/drive/folders/nia',
  'The student''s folder link is saved');
select tests.eq((student_private(:'nia')->>'date_of_birth'), '2016-09-09', 'The date of birth is saved');
select tests.eq(length(student_private(:'nia')->>'handin_code'), 32, 'A new student gets a hand-in link code');
select tests.eq((select count(*) from student_list where id = :'nia'), 1::bigint, 'The new student shows on the Students list');

-- Required fields.
select tests.throws($$select save_student('{"first_name": "", "year_group": 5, "status": "active", "enrolments": [{"subject_id": "maths"}]}')$$,
  'first name is required', 'A student can''t be saved without a first name');
select tests.throws($$select save_student('{"first_name": "Ola", "year_group": 5, "status": "active", "enrolments": []}')$$,
  'at least one subject', 'A student can''t be saved without a subject');
select tests.throws($$select save_student('{"first_name": "Ola", "year_group": 5, "status": "active",
  "enrolments": [{"subject_id": "maths"}, {"subject_id": "maths"}]}')$$, 'only be added once', 'The same subject can''t be added twice');
select tests.throws($$select save_student('{"first_name": "Ola", "year_group": 13, "status": "active", "enrolments": [{"subject_id": "maths"}]}')$$,
  'year_group_check', 'Year 13 is refused (the years are now Year 1 to Year 10, GCSE - H and GCSE - F)');
select tests.eq((select count(*) from students where first_name = 'Ola'), 0::bigint, 'Refused students are not saved at all');
select tests.lives($$select save_student('{"first_name": "Ithika", "year_group": 4, "status": "trial", "enrolments": [{"subject_id": "english"}]}')$$,
  'A student can be saved with a first name only');
select tests.eq((select display_name from families f join students s on s.family_id = f.id where s.first_name = 'Ithika'), 'Ithika family',
  'A student with no last name gets a family named after their first name');

-- Updating: removing a subject ends it; the folder link can be cleared.
select id as nia_maths from enrolments where student_id = :'nia' and subject_id = 'maths' \gset
select tests.lives(format($$select save_student(%L)$$, jsonb_build_object('id', :'nia', 'first_name', 'Nia', 'last_name', 'New', 'year_group', 5,
  'status', 'active', 'enrolments', jsonb_build_array(jsonb_build_object('id', :'nia_maths', 'subject_id', 'maths',
  'batch_id', '40000000-0000-0000-0000-000000000001')))), 'A student can be saved again with one subject removed');
select tests.eq((select ended_on from enrolments where student_id = :'nia' and subject_id = 'science'), current_date,
  'A removed subject is ended today, not deleted');
select tests.eq((select count(*) from file_links where student_id = :'nia' and owner_type = 'student_folder'), 0::bigint,
  'Clearing the folder link removes it');
select tests.eq((select count(*) from guardians g join students s on s.family_id = g.family_id where s.id = :'nia'), 1::bigint,
  'Saving again doesn''t add a second parent');

-- Leaving.
select tests.lives(format($$select save_student(%L)$$, jsonb_build_object('id', :'nia', 'first_name', 'Nia', 'last_name', 'New', 'year_group', 5,
  'status', 'left', 'enrolments', jsonb_build_array(jsonb_build_object('id', :'nia_maths', 'subject_id', 'maths',
  'batch_id', '40000000-0000-0000-0000-000000000001')))), 'A student can be marked as Left');
select tests.ok((select batch_id is null from enrolments where id = :'nia_maths'), 'A student who leaves gives up their batch place');
select tests.eq((select left_on from students where id = :'nia'), current_date, 'A student who leaves gets a leaving date');
select tests.throws($$select save_student('{"id": "30000000-0000-0000-0000-00000000dead", "first_name": "Ghost", "year_group": 5, "status": "active",
  "enrolments": [{"subject_id": "maths"}]}')$$, 'Student not found', 'Saving a student who doesn''t exist is refused');

-- Only staff can save students.
select tests.as('nobody');
select tests.throws($$select save_student('{"first_name": "Hack", "year_group": 5, "status": "active", "enrolments": [{"subject_id": "maths"}]}')$$,
  'Not allowed', 'A login that isn''t staff can''t save a student');
select tests.as('family');
select tests.throws($$select save_student('{"first_name": "Hack", "year_group": 5, "status": "active", "enrolments": [{"subject_id": "maths"}]}')$$,
  'Not allowed', 'A family login can''t save a student');
