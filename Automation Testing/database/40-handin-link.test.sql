-- The WhatsApp hand-in link: families open it on their phone without signing in.
-- Each student has a secret code in their link (fixtures: 'sam-handin-code', 'kim-handin-code', ...).

select tests.as(null);
select tests.eq(handin_page('sam-handin-code')->>'first_name', 'Sam', 'The hand-in link opens the right student''s page');
select tests.eq(jsonb_array_length(handin_page('sam-handin-code')->'homework'), 1, 'The page lists the student''s homework');
select tests.eq(handin_page('sam-handin-code')->'homework'->0->>'status', 'pending', 'Homework not yet handed in shows as pending');
select tests.ok(handin_page('not-a-real-code') is null, 'A wrong or made-up link shows nothing');
select tests.eq(handin_target('sam-handin-code', '70000000-0000-0000-0000-000000000001')->>'folder_id', 'folder-sam',
  'Uploads go into the student''s own Drive folder');
select tests.ok(handin_target('sam-handin-code', '70000000-0000-0000-0000-000000000002') is null,
  'A link can''t open another class''s homework');
select tests.throws($$select handin_record('sam-handin-code', '70000000-0000-0000-0000-000000000002', 'x', 'https://x', 'x')$$,
  'Link or homework not found', 'A link can''t hand in another class''s homework');
select tests.throws($$select handin_record('not-a-real-code', '70000000-0000-0000-0000-000000000001', 'x', 'https://x', 'x')$$,
  'Link or homework not found', 'A made-up link can''t hand anything in');

select tests.lives($$select handin_record('sam-handin-code', '70000000-0000-0000-0000-000000000001', 'drv-1', 'https://drive.test/p1', 'page1.jpg')$$,
  'A family can hand in homework through the link');
select tests.eq(handin_page('sam-handin-code')->'homework'->0->>'status', 'received', 'Handing in marks the homework as received');
select tests.eq((handin_page('sam-handin-code')->'homework'->0->>'files')::int, 1, 'The page counts the files handed in');
select tests.eq(handin_page('kim-handin-code')->'homework'->0->>'status', 'pending', 'Another child''s homework is not affected');

-- At most 20 files per homework.
select tests.lives($$select handin_record('sam-handin-code', '70000000-0000-0000-0000-000000000001', 'drv-' || g, null, 'page.jpg')
  from generate_series(2, 20) g$$, 'Up to 20 files can be handed in for one homework');
select tests.throws($$select handin_record('sam-handin-code', '70000000-0000-0000-0000-000000000001', 'drv-21', null, 'page.jpg')$$,
  'Too many files', 'A 21st file for the same homework is refused');

-- Handing in again after marking keeps the mark.
select tests.as_owner();
update homework_results set status = 'marked', mark = 9, marked_on = current_date
where sheet_id = '70000000-0000-0000-0000-000000000001' and student_id = '30000000-0000-0000-0000-000000000002';
select tests.as(null);
select tests.lives($$select handin_record('kim-handin-code', '70000000-0000-0000-0000-000000000001', 'drv-k', null, 'late.jpg')$$,
  'A family can still add a file after the homework was marked');
select tests.eq(handin_page('kim-handin-code')->'homework'->0->>'status', 'marked', 'Adding a file after marking keeps it marked');
select tests.eq((handin_page('kim-handin-code')->'homework'->0->>'mark')::numeric, 9::numeric, 'Adding a file after marking keeps the mark');

-- The link can't be used to read anything else.
select tests.eq((select count(*) from homework_results), 0::bigint, 'Someone not signed in can''t read homework results');
select tests.eq((select count(*) from file_links), 0::bigint, 'Someone not signed in can''t read file rows');
select tests.eq((select count(*) from homework_sheets), 0::bigint, 'Someone not signed in can''t read homework');

-- Old homework and students who have left.
select tests.as_owner();
update homework_sheets set set_on = current_date - 120 where id = '70000000-0000-0000-0000-000000000002';
update students set status = 'left' where id = '30000000-0000-0000-0000-000000000001';
select tests.as(null);
select tests.eq(jsonb_array_length(handin_page('lee-handin-code')->'homework'), 0, 'Homework set more than 90 days ago drops off the link');
select tests.ok(handin_page('sam-handin-code') is null, 'The link stops working when the student has left');
