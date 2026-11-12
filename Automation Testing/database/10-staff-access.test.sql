-- Staff: what admins and office staff can see and change, and that everyone else sees nothing.

-- An admin sees and can change everything.
select tests.as('admin');
select tests.eq((select count(*) from students), 4::bigint, 'An admin sees every student');
select tests.eq((select count(*) from batches), 3::bigint, 'An admin sees every batch, closed ones too');
select tests.eq((select count(*) from guardians), 1::bigint, 'An admin sees parent contact details');
select tests.eq((select count(*) from enquiries), 1::bigint, 'An admin sees enquiries');
select tests.eq((select count(*) from staff), 3::bigint, 'An admin sees the staff list');
select tests.eq((select count(*) from student_notes), 1::bigint, 'An admin sees student notes');
select tests.lives($$insert into staff (id, full_name, email, role) values
  ('a0000000-0000-0000-0000-000000000009', 'Sue Spare', 'spare@pm.test', 'operations')$$, 'An admin can add a staff member');
select tests.lives($$update subjects set name = 'Mathematics' where id = 'maths'$$, 'An admin can rename a subject');
select tests.lives($$select move_curriculum_topic((select id from curriculum_topics where subject_id = 'maths' and position = 2), 'up')$$,
  'An admin can move a curriculum topic up');
select tests.eq((select name from curriculum_topics where subject_id = 'maths' and position = 1), 'Negative numbers',
  'Moving a topic up swaps it with the one above');
select tests.eq(student_private('30000000-0000-0000-0000-000000000001')->>'date_of_birth', '2016-03-01',
  'Staff can read a student''s date of birth through student_private');
select tests.ok(length(student_private('30000000-0000-0000-0000-000000000001')->>'handin_code') > 0,
  'Staff can read a student''s hand-in link code through student_private');
select tests.throws($$select date_of_birth from students$$, 'permission denied',
  'Dates of birth can''t be read straight from the students table, even by staff');
select tests.throws($$select handin_code from students$$, 'permission denied',
  'Hand-in codes can''t be read straight from the students table');
select tests.lives($$select * from student_list$$, 'The Students list works for an admin');
select tests.lives($$select * from teacher_list$$, 'The Teachers list works for an admin');
select tests.eq((select count(*) from batch_list), 3::bigint, 'The Batches list shows every batch to an admin');

-- Office staff (operations) see everything but can't change reference data or staff.
select tests.as('office');
select tests.eq((select count(*) from students), 4::bigint, 'Office staff see every student');
select tests.eq((select count(*) from guardians), 1::bigint, 'Office staff see parent contact details');
select tests.eq((select count(*) from enquiries), 1::bigint, 'Office staff see enquiries');
select tests.throws($$insert into staff (id, full_name, email, role) values
  ('a0000000-0000-0000-0000-000000000009', 'Sue Spare', 'spare@pm.test', 'admin')$$, 'row-level security',
  'Office staff can''t add staff members');
with changed as (update staff set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000002' returning 1)
select tests.eq(count(*), 0::bigint, 'Office staff can''t make themselves an admin') from changed;
with changed as (update subjects set name = 'Sums' where id = 'maths' returning 1)
select tests.eq(count(*), 0::bigint, 'Office staff can''t rename a subject') from changed;
select tests.throws($$insert into subjects (id, name, sort) values ('art', 'Art', 9)$$, 'row-level security',
  'Office staff can''t add a subject');
select tests.throws($$select move_curriculum_topic((select id from curriculum_topics limit 1), 'up')$$, 'Not allowed',
  'Office staff can''t reorder the curriculum');
select tests.lives($$insert into enquiries (child_first_name, child_last_name, year_group, parent_name)
  values ('Zac', 'Zed', 3, 'Zoe Zed')$$, 'Office staff can add an enquiry');

-- A staff member who is no longer active sees nothing.
select tests.as('former');
select tests.eq((select count(*) from students), 0::bigint, 'A staff member who is no longer active sees no students');
select tests.eq((select count(*) from batches), 0::bigint, 'A staff member who is no longer active sees no batches');
select tests.eq((select count(*) from guardians), 0::bigint, 'A staff member who is no longer active sees no parents');

-- Signed in, but not staff, a teacher or a student.
select tests.as('nobody');
select tests.eq((select count(*) from students), 0::bigint, 'A login with no role sees no students');
select tests.eq((select count(*) from enquiries), 0::bigint, 'A login with no role sees no enquiries');
select tests.eq((select count(*) from homework_results), 0::bigint, 'A login with no role sees no homework results');
select tests.ok(student_private('30000000-0000-0000-0000-000000000001') is null,
  'A login with no role can''t read a student''s date of birth');

-- Not signed in at all.
select tests.as(null);
select tests.throws($$select count(*) from students$$, 'permission denied', 'Someone not signed in can''t read students');
select tests.eq((select count(*) from enquiries), 0::bigint, 'Someone not signed in sees no enquiries');
select tests.eq((select count(*) from guardians), 0::bigint, 'Someone not signed in sees no parents');
select tests.eq((select count(*) from file_links), 0::bigint, 'Someone not signed in sees no files');
