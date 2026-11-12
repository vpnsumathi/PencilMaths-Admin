-- Student and family logins (the /me pages): one login can hold several children.
-- "family" is one login for Sam and Kim (both in TB-1). "lee" is Lee's own login (TB-2).

select tests.as('family');
select tests.eq(jsonb_array_length(my_students()), 2, 'A family login lists both of its children');
select tests.eq((select s->>'first_name' from jsonb_array_elements(my_students()) s where (s->>'current')::boolean), 'Kim',
  'Until the family chooses, the first child by name is shown');
select tests.eq(my_dashboard()->>'first_name', 'Kim', 'The dashboard is for the child shown');
select tests.lives($$select switch_student('30000000-0000-0000-0000-000000000001')$$, 'A family can switch to their other child');
select tests.eq(my_dashboard()->>'first_name', 'Sam', 'After switching, the dashboard is for that child');
select tests.throws($$select switch_student('30000000-0000-0000-0000-000000000003')$$, 'Not your student',
  'A family can''t switch to someone else''s child');
select tests.eq(my_dashboard()->>'first_name', 'Sam', 'A refused switch leaves the dashboard as it was');

-- What the dashboard and My homework show.
select tests.eq(jsonb_array_length(my_dashboard()->'classes'), 1, 'The dashboard lists the child''s class');
select tests.eq(my_dashboard()->'classes'->0->>'batch_code', 'TB-1', 'The class shown is the child''s batch');
select tests.eq(my_dashboard()->'classes'->0->>'teacher', 'Tom One', 'The class shows its teacher');
select tests.eq(my_dashboard()->'classes'->0->'times'->0->>'start_time', '16:00:00', 'The class shows its time');
select tests.eq((my_dashboard()->'homework'->>'to_do')::int, 1, 'The dashboard counts homework still to do');
select tests.eq(jsonb_array_length(my_homework()), 1, 'My homework lists the child''s homework');
select tests.eq(my_homework()->0->>'title', 'Fractions sheet', 'My homework shows the homework title');
select tests.eq(jsonb_array_length(my_homework()->0->'sheets'), 1, 'My homework shows the worksheet to download');
select tests.ok(my_homework_file('80000000-0000-0000-0000-000000000001') is not null, 'A child can open their own worksheet');
select tests.ok(my_homework_file('80000000-0000-0000-0000-000000000002') is null, 'A child can''t open another class''s worksheet');
select tests.ok(my_homework_file('80000000-0000-0000-0000-000000000003') is null, 'A child can''t open another child''s hand-in');
select tests.ok(my_handin_target('70000000-0000-0000-0000-000000000002') is null, 'A child can''t hand in another class''s homework');

-- Handing in from the student pages.
-- (The app's server records the upload with handin_record after checking my_handin_target.)
select tests.ok(my_handin_target('70000000-0000-0000-0000-000000000001') is not null, 'A child can hand in their own homework');
select tests.eq(current_student_id(), '30000000-0000-0000-0000-000000000001'::uuid, 'The server can tell which child is handing in');
select tests.as_owner();
select set_config('role', 'service_role', true);
select tests.lives($$select handin_record('sam-handin-code', '70000000-0000-0000-0000-000000000001', 'drive-file-sam1', null, 'page1.jpg')$$,
  'A child can hand in their homework');
select tests.as('family');
select tests.eq((my_dashboard()->'homework'->>'handed_in')::int, 1, 'After handing in, it counts as handed in');
select tests.eq((my_dashboard()->'homework'->>'to_do')::int, 0, 'After handing in, it is no longer to do');
select tests.eq(jsonb_array_length(my_homework()->0->'handed'), 1, 'My homework lists the file that was handed in');

-- Marked homework shows on the dashboard.
select tests.as_owner();
update homework_results set status = 'marked', mark = 7, marked_on = current_date
where sheet_id = '70000000-0000-0000-0000-000000000001' and student_id = '30000000-0000-0000-0000-000000000001';
select tests.as('family');
select tests.eq((my_dashboard()->'homework'->'recently_marked'->0->>'mark')::numeric, 7::numeric, 'A new mark shows on the dashboard');

-- Students can't read the tables directly; everything goes through the functions above.
select tests.eq((select count(*) from students), 0::bigint, 'A student login can''t read the students table');
select tests.eq((select count(*) from homework_results), 0::bigint, 'A student login can''t read homework results directly');
select tests.eq((select count(*) from file_links), 0::bigint, 'A student login can''t read file rows directly');
select tests.eq((select count(*) from guardians), 0::bigint, 'A student login can''t read parent details');

-- A child's own login sees only them.
select tests.as('lee');
select tests.eq(jsonb_array_length(my_students()), 1, 'A child''s own login lists only them');
select tests.eq(my_dashboard()->>'first_name', 'Lee', 'A child''s own login opens their dashboard');

-- A child who has left drops off the family login.
select tests.as_owner();
update students set status = 'left' where id = '30000000-0000-0000-0000-000000000002';
select tests.as('family');
select tests.eq((select string_agg(s->>'first_name', ',') from jsonb_array_elements(my_students()) s), 'Sam',
  'A child who has left no longer shows on the family login');

-- Someone with no student sees nothing.
select tests.as('nobody');
select tests.ok(my_dashboard() is null, 'A login with no student gets no dashboard');
select tests.eq(jsonb_array_length(my_students()), 0, 'A login with no student lists no children');
select tests.ok(my_handin_target('70000000-0000-0000-0000-000000000001') is null, 'A login with no student can''t hand anything in');

-- One email can't be both a teacher login and a student login.
select tests.as_owner();
select tests.throws($$update teachers set auth_user_id = 'c0000000-0000-0000-0000-000000000001' where id = '10000000-0000-0000-0000-000000000002'$$,
  'student or family login', 'A student or family login can''t also be made a teacher login');
select tests.throws($$update students set auth_user_id = 'b0000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000004'$$,
  'teacher login', 'A teacher login can''t also be made a student login');
