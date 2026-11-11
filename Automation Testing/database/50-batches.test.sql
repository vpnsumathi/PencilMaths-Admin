-- Batches: creating and saving, places (capacity), teacher class-time clashes, and closing.
-- Fixtures: Tom One teaches TB-1 (Mon 16:00, 4 places, Sam and Kim); Tia Two teaches TB-2 (Mon 16:00, Thu 17:00).

select tests.as('admin');

-- Creating a batch.
select save_batch('{"subject_id": "maths", "year_group": 6, "teacher_id": "10000000-0000-0000-0000-000000000002", "capacity": 3,
                    "slots": [{"weekday": 2, "start_time": "16:00"}]}') as new_batch \gset
select tests.ok((select code from batches where id = :'new_batch') ~ '^B-\d{3}$', 'A new batch gets the next code (B-001, B-002 ...)');
select tests.eq((select count(*) from batch_topics where batch_id = :'new_batch'),
                (select count(*) from curriculum_topics where subject_id = 'maths' and (year_group is null or year_group = 6)),
  'A new batch gets its subject''s curriculum as its lesson plan');
select tests.eq((select count(*) from batch_slots where batch_id = :'new_batch'), 1::bigint, 'A new batch keeps its class time');
select tests.throws($$select save_batch('{"subject_id": "maths", "year_group": 6, "capacity": 3}')$$, 'Choose a teacher',
  'A batch can''t be saved without a teacher');
select tests.throws($$select save_batch('{"subject_id": "maths", "year_group": 6, "teacher_id": "10000000-0000-0000-0000-000000000002", "capacity": 20}')$$,
  'capacity_check', 'A batch can''t have more than 12 places');
select tests.throws($$select save_batch('{"id": "40000000-0000-0000-0000-00000000dead", "teacher_id": "10000000-0000-0000-0000-000000000002", "capacity": 3}')$$,
  'Batch not found', 'Saving a batch that doesn''t exist is refused');

-- Places (capacity).
select tests.throws($$update batches set capacity = 1 where id = '40000000-0000-0000-0000-000000000001'$$, 'can''t be lower than 2',
  'A batch''s places can''t be set below the number of students in it');
update batches set capacity = 2 where id = '40000000-0000-0000-0000-000000000001';
select tests.throws($$update enrolments set batch_id = '40000000-0000-0000-0000-000000000001' where student_id = '30000000-0000-0000-0000-000000000004'$$,
  'is full', 'A student can''t be put in a full batch');
update batches set capacity = 4 where id = '40000000-0000-0000-0000-000000000001';
select tests.throws($$insert into enrolments (student_id, subject_id, batch_id) values
  ('30000000-0000-0000-0000-000000000004', 'science', '40000000-0000-0000-0000-000000000001')$$, 'is for maths, not science',
  'A student can''t be put in a batch of a different subject');
select tests.lives($$update enrolments set batch_id = '40000000-0000-0000-0000-000000000001' where student_id = '30000000-0000-0000-0000-000000000004'$$,
  'A student can join a batch with a free place');
select tests.eq((select teacher_id from enrolments where student_id = '30000000-0000-0000-0000-000000000004' and ended_on is null),
  '10000000-0000-0000-0000-000000000001'::uuid, 'A student who joins a batch gets the batch''s teacher');

-- Teacher class-time clashes: the same teacher, day and start time in two open batches is refused.
select tests.throws($$select save_batch('{"subject_id": "maths", "year_group": 4, "teacher_id": "10000000-0000-0000-0000-000000000001", "capacity": 4,
                    "slots": [{"weekday": 1, "start_time": "16:00"}]}')$$, 'Tom One already teaches TB-1 on Monday at 16:00',
  'A teacher can''t be given a class time they already teach (with a message naming the other batch)');
select tests.eq((select count(*) from batches where year_group = 4), 0::bigint, 'A refused new batch is not saved at all');
select tests.lives($$select save_batch('{"subject_id": "maths", "year_group": 4, "teacher_id": "10000000-0000-0000-0000-000000000001", "capacity": 4,
                    "slots": [{"weekday": 1, "start_time": "17:00"}]}')$$, 'The same teacher can teach at a different time on the same day');
select tests.lives($$select save_batch('{"subject_id": "english", "year_group": 4, "teacher_id": "10000000-0000-0000-0000-000000000001", "capacity": 4,
                    "slots": [{"weekday": 4, "start_time": "17:00"}]}')$$, 'Two different teachers can teach at the same time (Thu 17:00)');
select tests.throws($$select save_batch('{"id": "40000000-0000-0000-0000-000000000002", "teacher_id": "10000000-0000-0000-0000-000000000001", "capacity": 6,
                    "slots": [{"weekday": 1, "start_time": "16:00"}, {"weekday": 4, "start_time": "17:00"}]}')$$, 'already teaches',
  'A batch can''t be moved to a teacher who already teaches at its time');
select tests.eq((select teacher_id from batches where id = '40000000-0000-0000-0000-000000000002'), '10000000-0000-0000-0000-000000000002'::uuid,
  'After a refused save the batch keeps its teacher');
select tests.eq((select count(*) from batch_slots where batch_id = '40000000-0000-0000-0000-000000000002'), 2::bigint,
  'After a refused save the batch keeps its class times');
select tests.throws($$insert into batch_slots (batch_id, weekday, start_time) values ('40000000-0000-0000-0000-000000000002', 2, '16:00')$$,
  'already teaches', 'The clash check also covers class times added outside the batch form');

-- Closing a batch frees its times; reopening it is refused if the time is now taken.
update batches set closed_on = current_date where id = '40000000-0000-0000-0000-000000000001';
select tests.lives($$select save_batch('{"subject_id": "maths", "year_group": 3, "teacher_id": "10000000-0000-0000-0000-000000000001", "capacity": 4,
                    "slots": [{"weekday": 1, "start_time": "16:00"}]}')$$, 'A closed batch''s time can be given to a new batch');
select tests.throws($$update batches set closed_on = null where id = '40000000-0000-0000-0000-000000000001'$$, 'already teaches',
  'A closed batch can''t be reopened if its teacher now has that time in another batch');
update batches set closed_on = null where id = '40000000-0000-0000-0000-000000000003';
select tests.ok((select closed_on is null from batches where id = '40000000-0000-0000-0000-000000000003'),
  'A closed batch can be reopened when its times are free');

-- Changing a batch's teacher: its students follow.
select tests.lives($$select save_batch('{"id": "40000000-0000-0000-0000-000000000002", "teacher_id": "10000000-0000-0000-0000-000000000001", "capacity": 6,
                    "slots": [{"weekday": 5, "start_time": "15:00"}]}')$$, 'A batch can be given a different teacher at a free time');
select tests.eq((select teacher_id from enrolments where student_id = '30000000-0000-0000-0000-000000000003' and ended_on is null),
  '10000000-0000-0000-0000-000000000001'::uuid, 'When a batch changes teacher, its students get the new teacher');

-- A student who leaves gives up their place.
update students set status = 'left' where id = '30000000-0000-0000-0000-000000000003';
select tests.ok((select batch_id is null from enrolments where student_id = '30000000-0000-0000-0000-000000000003' and ended_on is null),
  'A student marked Left gives up their batch place');
select tests.eq((select left_on from students where id = '30000000-0000-0000-0000-000000000003'), current_date,
  'A student marked Left gets today as their leaving date');

-- The Batches list figures.
select tests.as_owner();
update homework_results set status = 'received', received_on = current_date
where sheet_id = '70000000-0000-0000-0000-000000000001' and student_id = '30000000-0000-0000-0000-000000000002';
select tests.as('admin');
select tests.eq((select member_count from batch_list where code = 'TB-1'), 3::bigint, 'The Batches list counts each batch''s students');
select tests.eq((select to_mark from batch_list where code = 'TB-1'), 1::bigint, 'The Batches list counts homework waiting to be marked');
select tests.eq((select members from batch_list where code = 'TB-1'), 'Kim O., Max T., Sam O.', 'The Batches list names each batch''s students');
select tests.eq((select schedule from batch_list where code = 'TB-3'), 'Tue 18:00', 'The Batches list shows class times');
select tests.eq((select topics_total from batch_list where code = 'TB-1'), (select count(*) from batch_topics where batch_id = '40000000-0000-0000-0000-000000000001'),
  'The Batches list counts lesson plan topics');

-- "Modified" dates change only on a real change.
select tests.as_owner();
set local session_replication_role = replica;
update batches set updated_at = '2020-01-01' where id = '40000000-0000-0000-0000-000000000003';
set local session_replication_role = origin;
update batches set capacity = capacity where id = '40000000-0000-0000-0000-000000000003';
select tests.eq((select updated_at::date from batches where id = '40000000-0000-0000-0000-000000000003'), '2020-01-01'::date,
  'Saving a batch with no changes keeps its Modified date');
update batches set capacity = 5 where id = '40000000-0000-0000-0000-000000000003';
select tests.eq((select updated_at::date from batches where id = '40000000-0000-0000-0000-000000000003'), current_date,
  'Changing a batch updates its Modified date');
