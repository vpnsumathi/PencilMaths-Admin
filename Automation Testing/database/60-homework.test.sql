-- Homework: Set homework, Mark completed (curriculum topics and Lesson library lessons), marking, and deleting.
-- Fixtures: TB-1 has Sam and Kim; TB-2 has Lee. Lesson L1 (Maths Y5) has Hw-1 and Hw-2 with worksheets,
-- and Hw-3 with no worksheet yet.

select tests.as('admin');

-- Set homework.
select set_homework('40000000-0000-0000-0000-000000000001',
  '{"title": "Algebra 1", "max_mark": 20, "files": [{"provider": "google_drive", "external_id": "drv-a", "label": "algebra.pdf"}]}') as hw \gset
select tests.eq((:'hw'::jsonb->>'students')::int, 2, 'Set homework gives it to every student in the batch');
select tests.eq((select count(*) from homework_results where sheet_id = (:'hw'::jsonb->>'sheet_id')::uuid and status = 'pending'), 2::bigint,
  'New homework starts as not handed in for each student');
select tests.eq((select count(*) from file_links where owner_type = 'homework_sheet' and owner_id = (:'hw'::jsonb->>'sheet_id')::uuid), 1::bigint,
  'New homework keeps its worksheet file');
select tests.eq((select max_mark from homework_sheets where id = (:'hw'::jsonb->>'sheet_id')::uuid), 20::numeric, 'New homework keeps its maximum mark');
select tests.eq((select set_on from homework_sheets where id = (:'hw'::jsonb->>'sheet_id')::uuid), (now() at time zone 'Europe/London')::date,
  'New homework is set today (UK date) when no date is given');
select tests.throws($$select set_homework('40000000-0000-0000-0000-000000000001', '{"title": "  "}')$$, 'Enter a homework title',
  'Homework can''t be set without a title');
select tests.throws($$select set_homework('40000000-0000-0000-0000-000000000001', '{"title": "Zero", "max_mark": 0}')$$, 'max_mark_check',
  'A maximum mark of 0 is refused');
select tests.eq((select count(*) from homework_sheets where title in ('  ', 'Zero')), 0::bigint, 'Refused homework is not saved at all');

-- Students who join later don't get earlier homework.
update enrolments set batch_id = '40000000-0000-0000-0000-000000000001' where student_id = '30000000-0000-0000-0000-000000000004';
select tests.eq((select count(*) from homework_results where sheet_id = (:'hw'::jsonb->>'sheet_id')::uuid), 2::bigint,
  'A student who joins later doesn''t get homework set before they joined');

-- Mark completed: curriculum topic.
select id as topic1 from batch_topics where batch_id = '40000000-0000-0000-0000-000000000001' order by position limit 1 \gset
select tests.eq((complete_topic('40000000-0000-0000-0000-000000000001', :'topic1', '{"title": "Place value and rounding", "max_mark": 10}')->>'students')::int, 3,
  'Completing a topic sends its homework to every student in the batch');
select tests.eq((select status::text from batch_topics where id = :'topic1'), 'complete', 'Completing a topic marks it complete');
select tests.eq((select completed_on from batch_topics where id = :'topic1'), (now() at time zone 'Europe/London')::date,
  'Completing a topic records today''s date');
select tests.throws(format('select complete_topic(%L, %L, %L)', '40000000-0000-0000-0000-000000000001', :'topic1', '{}'),
  'already completed', 'A completed topic can''t be completed twice');
update batch_topics set status = 'in_progress' where id = :'topic1';
select tests.ok((complete_topic('40000000-0000-0000-0000-000000000001', :'topic1', '{}')->>'already_sent') is not null,
  'Completing a topic again after undoing it says its homework was already sent');
select tests.eq((select count(*) from homework_sheets where topic_id = :'topic1'), 1::bigint, '... and doesn''t send its homework a second time');
select tests.throws($$select complete_topic('40000000-0000-0000-0000-000000000002', (select id from batch_topics where batch_id = '40000000-0000-0000-0000-000000000001' limit 1), '{}')$$,
  'Topic not found', 'A topic can''t be completed from another batch');

-- Mark completed: Lesson library lesson, with a separate maximum mark for each homework.
select tests.eq(complete_lesson('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
  '{"hw": ["60000000-0000-0000-0000-000000000001", "60000000-0000-0000-0000-000000000002"],
    "max_marks": {"60000000-0000-0000-0000-000000000001": 10, "60000000-0000-0000-0000-000000000002": 20}}')->'codes',
  '["TY5-A001", "TY5-A002"]'::jsonb, 'Completing a lesson sends each homework that was ticked');
select tests.eq((select max_mark from homework_sheets where lesson_homework_id = '60000000-0000-0000-0000-000000000001'), 10::numeric,
  'Hw-1 gets its own maximum mark (10)');
select tests.eq((select max_mark from homework_sheets where lesson_homework_id = '60000000-0000-0000-0000-000000000002'), 20::numeric,
  'Hw-2 gets its own maximum mark (20)');
select tests.eq((select title from homework_sheets where lesson_homework_id = '60000000-0000-0000-0000-000000000001'), 'Place value · Hw-1 (TY5-A001)',
  'Lesson homework is named after the lesson and sheet');
select tests.eq((select count(*) from file_links f join homework_sheets h on h.id = f.owner_id
                 where f.owner_type = 'homework_sheet' and h.lesson_homework_id = '60000000-0000-0000-0000-000000000001'), 1::bigint,
  'Lesson homework gets the Lesson library worksheet');
select tests.eq((select status::text from batch_lessons where batch_id = '40000000-0000-0000-0000-000000000001' and lesson_id = '50000000-0000-0000-0000-000000000001'),
  'complete', 'Completing a lesson marks it complete in the batch''s plan');
select tests.eq(jsonb_array_length(complete_lesson('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
  '{"hw": ["60000000-0000-0000-0000-000000000001"]}')->'codes'), 0, 'Homework already sent for a lesson is not sent again');
select tests.eq((select count(*) from homework_sheets where lesson_homework_id = '60000000-0000-0000-0000-000000000001'
                 and batch_id = '40000000-0000-0000-0000-000000000001'), 1::bigint, '... so there is still only one copy');
select tests.throws($$select complete_lesson('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
  '{"hw": ["60000000-0000-0000-0000-000000000003"]}')$$, 'TY5-A003 has no worksheet yet', 'A homework with no worksheet yet can''t be sent');
select tests.throws($$select complete_lesson('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '{}')$$,
  'not part of this class', 'A lesson from another year can''t be completed for this batch');
select tests.lives($$select complete_lesson('40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001',
  '{"hw": ["60000000-0000-0000-0000-000000000001"], "max_marks": {"60000000-0000-0000-0000-000000000001": null}}')$$,
  'A lesson can be completed with an empty maximum mark box');
select tests.ok((select max_mark is null from homework_sheets where batch_id = '40000000-0000-0000-0000-000000000002'
                 and lesson_homework_id = '60000000-0000-0000-0000-000000000001'), 'An empty maximum mark box means no maximum mark');
select tests.lives($$select complete_lesson('40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001',
  '{"hw": ["60000000-0000-0000-0000-000000000002"], "max_mark": 15}')$$, 'A lesson can be completed with one maximum mark for all');
select tests.eq((select max_mark from homework_sheets where batch_id = '40000000-0000-0000-0000-000000000002'
                 and lesson_homework_id = '60000000-0000-0000-0000-000000000002'), 15::numeric, 'One maximum mark for all still works');

-- Marking.
select tests.throws($$update homework_results set mark = -1 where sheet_id = '70000000-0000-0000-0000-000000000001'$$, 'mark_check',
  'A negative mark is refused');
with changed as (
  update homework_results set status = 'marked', mark = 9, marked_on = current_date
  where sheet_id = '70000000-0000-0000-0000-000000000001' and student_id = '30000000-0000-0000-0000-000000000001' returning 1)
select tests.eq(count(*), 1::bigint, 'Staff can mark a homework') from changed;
select tests.eq((select to_mark from batch_list where code = 'TB-1'), 0::bigint, 'Marked homework is not counted as waiting to be marked');

-- Deleting homework removes its results and markings too.
insert into homework_markups (sheet_id, student_id, source_file_id, data)
values ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '{}');
delete from homework_sheets where id = '70000000-0000-0000-0000-000000000001';
select tests.eq((select count(*) from homework_results where sheet_id = '70000000-0000-0000-0000-000000000001'), 0::bigint,
  'Deleting homework removes its results');
select tests.eq((select count(*) from homework_markups where sheet_id = '70000000-0000-0000-0000-000000000001'), 0::bigint,
  'Deleting homework removes its saved markings');
