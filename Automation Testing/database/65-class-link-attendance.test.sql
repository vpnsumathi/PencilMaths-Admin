-- Class link (Google Classroom) and attendance (20261111000001_class_link_attendance.sql, guide 21).
-- TB-1 (Tom, Monday 16:00) has Sam and Kim; TB-2 (Tia, Monday 16:00 and Thursday 17:00) has Lee.
-- "family" is one login for Sam and Kim; "lee" is Lee's own login.
-- Class days are worked out from today's date, so the checks give the same result whenever they run:
--   mon1, mon2, mon3 = the Mondays one, two and three weeks ago; thu1 = the Thursday after mon1.

select tests.as_owner();
select (current_date - (extract(isodow from current_date)::int - 1) - 7)::text as mon1 \gset
select (:'mon1'::date - 7)::text as mon2 \gset
select (:'mon1'::date - 14)::text as mon3 \gset
select (:'mon1'::date + 3)::text as thu1 \gset
-- The test students joined their batches well before these class days.
update enrolments set started_on = :'mon3'::date - 28;
-- A UK clock time on a date, as a moment (so summer and winter time are both right).
create function pg_temp.uk(d text, t time) returns timestamptz language sql as $$
  select (d::date + t) at time zone 'Europe/London'
$$;

-- 1. The class link: staff save it, only Google links are accepted, the batch's teacher can read it ------------
select tests.as('office');
select tests.lives($$update batches set class_link = '  https://classroom.google.com/c/TB1class?cjc=abc123  '
                     where id = '40000000-0000-0000-0000-000000000001'$$, 'Staff can save a Google Classroom link on a batch');
select tests.eq((select class_link from batches where id = '40000000-0000-0000-0000-000000000001'),
  'https://classroom.google.com/c/TB1class?cjc=abc123', 'Spaces around a pasted link are removed');
select tests.eq((select class_link_updated_by from batches where id = '40000000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000002'::uuid, 'The batch records who changed the link');
select tests.ok((select class_link_updated_at is not null from batches where id = '40000000-0000-0000-0000-000000000001'),
  'The batch records when the link was changed');
select tests.lives($$update batches set class_link_updated_by = 'a0000000-0000-0000-0000-000000000001'
                     where id = '40000000-0000-0000-0000-000000000001'$$, 'Typing in "changed by" by hand is ignored');
select tests.eq((select class_link_updated_by from batches where id = '40000000-0000-0000-0000-000000000001'),
  'a0000000-0000-0000-0000-000000000002'::uuid, '"Changed by" stays the person who really changed the link');
select tests.lives($$update batches set class_link = 'https://meet.google.com/abc-defg-hij'
                     where id = '40000000-0000-0000-0000-000000000002'$$, 'A Google Meet link is accepted too');
select tests.throws($$update batches set class_link = 'https://example.com/class' where id = '40000000-0000-0000-0000-000000000002'$$,
  'batches_class_link_check', 'A link to another website is refused');
select tests.throws($$update batches set class_link = 'http://classroom.google.com/c/abc' where id = '40000000-0000-0000-0000-000000000002'$$,
  'batches_class_link_check', 'A link that is not https is refused');
select tests.throws($$update batches set class_link = 'https://classroom.google.com.example.com/c/abc' where id = '40000000-0000-0000-0000-000000000002'$$,
  'batches_class_link_check', 'A look-alike address is refused');
select tests.throws($$update batches set class_link = 'https://classroom.google.com/c/abc def' where id = '40000000-0000-0000-0000-000000000002'$$,
  'batches_class_link_check', 'A link with a space in it is refused');
select tests.lives($$update batches set class_link = '   ' where id = '40000000-0000-0000-0000-000000000002'$$,
  'Staff can remove a link by saving it empty');
select tests.eq((select class_link from batches where id = '40000000-0000-0000-0000-000000000002'), null,
  'An empty link is stored as no link');

select tests.as('teacher1');
select tests.eq((select class_link from batches where id = '40000000-0000-0000-0000-000000000001'),
  'https://classroom.google.com/c/TB1class?cjc=abc123', 'A teacher can read the link of their own batch');
update batches set class_link = 'https://classroom.google.com/c/changed' where id = '40000000-0000-0000-0000-000000000001';
select tests.as_owner();
select tests.eq((select class_link from batches where id = '40000000-0000-0000-0000-000000000001'),
  'https://classroom.google.com/c/TB1class?cjc=abc123', 'A teacher can''t change the link');
select tests.as('teacher2');
select tests.eq((select count(*) from batches where id = '40000000-0000-0000-0000-000000000001'), 0::bigint,
  'A teacher can''t read the link of another teacher''s batch');

-- 2. Join class: who gets the link ----------------------------------------------------------------------------
select tests.as('family');
select switch_student('30000000-0000-0000-0000-000000000001');   -- Sam
select tests.eq((select count(*) from batches), 0::bigint, 'A student login can''t read batches (or the link) directly');
select tests.eq(my_dashboard()->'classes'->0->>'has_class_link', 'true', 'The student dashboard says the class has a link');
select tests.eq(my_dashboard()->'classes'->0->>'batch_id', '40000000-0000-0000-0000-000000000001', 'The student dashboard names the class to join');
select tests.ok(my_dashboard()::text not like '%classroom.google.com%', 'The student dashboard does not contain the link itself');
select tests.eq(join_class('40000000-0000-0000-0000-000000000001')->>'link',
  'https://classroom.google.com/c/TB1class?cjc=abc123', 'Join class gives a student the link of their own class');
select tests.throws($$select join_class('40000000-0000-0000-0000-000000000002')$$, 'not one of your classes',
  'A student can''t join a class they are not in');
select tests.throws($$select record_class_join('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', now())$$,
  'permission denied', 'A student login can''t save attendance for someone else');
select tests.as('lee');
select tests.eq(join_class('40000000-0000-0000-0000-000000000002')->>'attendance', 'no_link',
  'A class with no link has nothing to join');
select tests.eq(my_dashboard()->'classes'->0->>'has_class_link', 'false', 'The student dashboard says when a class has no link');
select tests.as('teacher1');
select tests.throws($$select join_class('40000000-0000-0000-0000-000000000001')$$, 'Only a student login',
  'Join class (with attendance) is for student logins only');
select tests.as(null);
select tests.throws($$select join_class('40000000-0000-0000-0000-000000000001')$$, 'permission denied', 'Join class needs a login');

-- 3. The class time window: 15 minutes before the class time to 60 minutes after; Late after 10 minutes --------
select tests.as_owner();
select tests.eq((select before_minutes || ',' || after_minutes || ',' || late_minutes from class_window()), '15,60,10',
  'The time window is 15 minutes before, 60 after, Late after 10');
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.uk(:'mon1', '15:44')),
  'outside', 'A press 16 minutes before the class is not saved');
select tests.eq((select count(*) from class_sessions where batch_id = '40000000-0000-0000-0000-000000000001'), 0::bigint,
  'A press outside the window starts no register');
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.uk(:'mon1', '15:45')),
  'present', 'A press 15 minutes before the class is saved as Present');
select tests.eq((select start_time::text from class_sessions where batch_id = '40000000-0000-0000-0000-000000000001' and class_date = :'mon1'),
  '16:00:00', 'The first press starts that day''s register, with the class time');
select tests.eq((select status::text || '/' || source::text from attendance a join class_sessions cs on cs.id = a.session_id
                 where cs.class_date = :'mon1' and a.student_id = '30000000-0000-0000-0000-000000000001'),
  'present/link', 'The student who pressed is Present, set by the link');
select tests.eq((select joined_at from attendance a join class_sessions cs on cs.id = a.session_id
                 where cs.class_date = :'mon1' and a.student_id = '30000000-0000-0000-0000-000000000001'),
  pg_temp.uk(:'mon1', '15:45'), 'The join time is recorded');
select tests.eq((select status::text || '/' || source::text from attendance a join class_sessions cs on cs.id = a.session_id
                 where cs.class_date = :'mon1' and a.student_id = '30000000-0000-0000-0000-000000000002'),
  'absent/auto', 'Everyone else in the batch goes on the register as "did not join"');
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.uk(:'mon1', '16:20')),
  'already', 'A second press changes nothing');
select tests.eq((select status::text || ' ' || (joined_at = pg_temp.uk(:'mon1', '15:45'))::text from attendance a
                 join class_sessions cs on cs.id = a.session_id
                 where cs.class_date = :'mon1' and a.student_id = '30000000-0000-0000-0000-000000000001'),
  'present true', 'After a second press the first status and join time stand');
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', pg_temp.uk(:'mon1', '16:11')),
  'late', 'A press 11 minutes after the class time is saved as Late');
select tests.eq((select status::text || '/' || source::text from attendance a join class_sessions cs on cs.id = a.session_id
                 where cs.class_date = :'mon1' and a.student_id = '30000000-0000-0000-0000-000000000002'),
  'late/link', 'A late press replaces "did not join"');
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', pg_temp.uk(:'mon1', '16:10')),
  'present', 'A press exactly 10 minutes after the class time is still Present');
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.uk(:'mon2', '17:01')),
  'outside', 'A press 61 minutes after the class time is not saved');
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.uk(:'mon2', '17:00')),
  'late', 'A press exactly 60 minutes after the class time is saved as Late');
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.uk(:'thu1', '16:00')),
  'outside', 'A press on a day with no class is not saved');
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', pg_temp.uk(:'thu1', '17:05')),
  'present', 'A batch with two class days uses the class time of that day');
select tests.eq((select start_time::text from class_sessions where batch_id = '40000000-0000-0000-0000-000000000002' and class_date = :'thu1'),
  '17:00:00', 'The register of the second class day has its own class time');
-- Summer time: Monday 6 July 2026, 16:05 in the UK is 15:05 on the world clock (UTC).
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', '2026-07-06 16:05+00'),
  'outside', 'In summer, 17:05 UK time is outside a 16:00 class (class times are UK times)');
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', '2026-07-06 15:05+00'),
  'present', 'In summer, 16:05 UK time is Present for a 16:00 class');

-- 4. The register: staff and the batch's teacher read and change it; their entry is final ----------------------
select tests.as('teacher1');
select tests.eq(jsonb_array_length(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'students'), 2,
  'A teacher sees the register of their own batch');
select tests.eq((select s->>'status' from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'students') s
                 where s->>'first_name' = 'Kim'), 'late', 'The register shows each student''s status');
select tests.eq(batch_register('40000000-0000-0000-0000-000000000001', :'mon3')->>'session_id', null,
  'A day with no class has an empty register');
select tests.eq(jsonb_array_length(batch_register('40000000-0000-0000-0000-000000000001', :'mon3')->'students'), 2,
  'An empty register still lists the batch''s students, ready to mark');
select tests.eq(jsonb_array_length(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'recent'), 2,
  'The register lists the earlier class days');
select tests.throws($$select batch_register('40000000-0000-0000-0000-000000000002')$$, 'Not allowed',
  'A teacher can''t see another teacher''s register');
select tests.throws(format($$select save_register('40000000-0000-0000-0000-000000000001', %L,
  '[{"student_id":"30000000-0000-0000-0000-000000000001","status":"absent"}]')$$, :'mon1'),
  'Give a reason for changing Sam One to Absent', 'Changing a checked-in student''s mark needs a reason');
select tests.eq(save_register('40000000-0000-0000-0000-000000000001', :'mon1',
  '[{"student_id":"30000000-0000-0000-0000-000000000001","status":"absent","reason":"Left after 5 minutes"},{"student_id":"30000000-0000-0000-0000-000000000002","status":"late"}]'),
  2, 'Saving the register writes the changed entry and confirms the ticked check-in');
select tests.eq((select h->>'from' || '>' || (h->>'to') || '/' || (h->>'from_source') || '/' || (h->>'by') || '/' || (h->>'reason')
                 from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'students') s,
                      jsonb_array_elements(s->'history') h
                 where s->>'first_name' = 'Sam'), 'present>absent/link/Tom One/Left after 5 minutes',
  'The change is kept with who made it, what it was before and the reason');
select tests.eq((select jsonb_array_length(s->'history') from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'students') s
                 where s->>'first_name' = 'Kim'), 1, 'Confirming a check-in is kept in the history too');
select tests.throws($$select count(*) from attendance_changes$$, 'permission denied', 'The history can''t be read directly');
select tests.throws($$delete from attendance_changes$$, 'permission denied', 'The history can''t be deleted');
select tests.eq((select s->>'status' || '/' || (s->>'source') || '/' || (s->>'marked_by')
                 from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'students') s
                 where s->>'first_name' = 'Sam'), 'absent/staff/Tom One', 'A teacher''s change is recorded with their name');
select tests.eq((select s->>'source' from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'students') s
                 where s->>'first_name' = 'Kim'), 'staff', 'A check-in left ticked when the register is saved becomes the teacher''s mark');
select tests.ok((select (s->>'joined_at') is not null from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'students') s
                 where s->>'first_name' = 'Sam'), 'The join time stays after a teacher''s change');
select tests.throws(format($$select save_register('40000000-0000-0000-0000-000000000002', %L,
  '[{"student_id":"30000000-0000-0000-0000-000000000003","status":"absent"}]')$$, :'mon1'),
  'own batches', 'A teacher can''t change another teacher''s register');
select tests.throws(format($$select save_register('40000000-0000-0000-0000-000000000001', %L,
  '[{"student_id":"30000000-0000-0000-0000-000000000003","status":"present"}]')$$, :'mon1'),
  'not in this batch', 'A student from another batch can''t be put on the register');
select tests.throws($$select save_register('40000000-0000-0000-0000-000000000001', current_date + 1,
  '[{"student_id":"30000000-0000-0000-0000-000000000001","status":"present"}]')$$,
  'future', 'The register can''t be taken for a future date');
select tests.throws(format($$select save_register('40000000-0000-0000-0000-000000000001', %L,
  '[{"student_id":"30000000-0000-0000-0000-000000000001","status":"sleeping"}]')$$, :'mon1'),
  'Present, Late or Absent', 'A status other than Present, Late or Absent is refused');
select tests.throws(format($$select save_register('40000000-0000-0000-0000-000000000001', %L, '[]')$$, :'mon1'),
  'at least one', 'An empty register is not saved');

select tests.as_owner();
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.uk(:'mon1', '16:30')),
  'already', 'A press after the teacher''s change is not saved as a new status');
select tests.eq((select status::text || '/' || source::text from attendance a join class_sessions cs on cs.id = a.session_id
                 where cs.class_date = :'mon1' and a.student_id = '30000000-0000-0000-0000-000000000001'),
  'absent/staff', 'The teacher''s entry is final: a later press never overwrites it');

-- Confirming "did not join": mon2 has Sam (late, by link) and Kim (did not join).
select tests.as('teacher1');
select tests.eq(save_register('40000000-0000-0000-0000-000000000001', :'mon2',
  '[{"student_id":"30000000-0000-0000-0000-000000000001","status":"late"},{"student_id":"30000000-0000-0000-0000-000000000002","status":"absent"}]'),
  2, 'Saving the register confirms the check-in and the student who did not join');
select tests.eq((select s->>'status' || '/' || (s->>'source') from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001', :'mon2')->'students') s
                 where s->>'first_name' = 'Kim'), 'absent/staff', 'A confirmed absence is recorded as set by the teacher');

-- A register taken by hand on a day when nobody pressed Join class, then a late press.
select tests.as('admin');
select tests.eq(save_register('40000000-0000-0000-0000-000000000001', :'mon3',
  '[{"student_id":"30000000-0000-0000-0000-000000000002","status":"absent"}]'), 1, 'Staff can take a register by hand');
select tests.eq((select start_time::text || '/' || logged_by::text from class_sessions
                 where batch_id = '40000000-0000-0000-0000-000000000001' and class_date = :'mon3'),
  '16:00:00/a0000000-0000-0000-0000-000000000001', 'A register taken by hand records the class time and who started it');
select tests.as_owner();
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', pg_temp.uk(:'mon3', '16:05')),
  'already', 'A press after staff marked the student Absent does not change it');
select tests.eq((select status::text || ' ' || (joined_at is not null)::text from attendance a join class_sessions cs on cs.id = a.session_id
                 where cs.class_date = :'mon3' and a.student_id = '30000000-0000-0000-0000-000000000002'),
  'absent true', 'That press is still recorded as a join time, for the teacher to see');
select tests.eq(record_class_join('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.uk(:'mon3', '16:05')),
  'present', 'A student not yet on a hand-made register is added by their press');

-- Changing attendance directly (not through the register) is still recorded as that person's change.
select tests.as('teacher1');
update attendance set status = 'present', source = 'link', marked_by = null
where student_id = '30000000-0000-0000-0000-000000000002'
  and session_id = (select id from class_sessions where batch_id = '40000000-0000-0000-0000-000000000001' and class_date = :'mon3');
select tests.as_owner();
select tests.eq((select status::text || '/' || source::text || '/' || marked_by::text from attendance a join class_sessions cs on cs.id = a.session_id
                 where cs.class_date = :'mon3' and a.student_id = '30000000-0000-0000-0000-000000000002'),
  'present/staff/b0000000-0000-0000-0000-000000000001', 'A direct change can''t be passed off as a link join or as nobody''s');
select tests.as('family');
select tests.eq((select count(*) from attendance), 0::bigint, 'A student login can''t read attendance directly');
update attendance set status = 'present' where student_id = '30000000-0000-0000-0000-000000000001';
select tests.throws($$select batch_register('40000000-0000-0000-0000-000000000001')$$, 'Not allowed', 'A student login can''t open the register');
select tests.throws(format($$select save_register('40000000-0000-0000-0000-000000000001', %L,
  '[{"student_id":"30000000-0000-0000-0000-000000000001","status":"present"}]')$$, :'mon1'),
  'own batches', 'A student login can''t change the register');
select tests.as_owner();
select tests.eq((select status::text from attendance a join class_sessions cs on cs.id = a.session_id
                 where cs.class_date = :'mon1' and a.student_id = '30000000-0000-0000-0000-000000000001'),
  'absent', 'A student login can''t change its own attendance directly');

-- 5. Totals: Sam is absent (mon1), late (mon2), present (mon3) ---------------------------------------------------
select tests.as('admin');
select tests.eq(attendance_totals('30000000-0000-0000-0000-000000000001')::jsonb - 'recent',
  '{"present":1,"late":1,"absent":1,"total":3,"checked_in":1}'::jsonb, 'Staff see a student''s attendance totals');
select tests.eq(jsonb_array_length(attendance_totals('30000000-0000-0000-0000-000000000001')->'recent'), 3,
  'The totals come with the latest classes');
select tests.eq(attendance_totals('30000000-0000-0000-0000-000000000001')->'recent'->0->>'status', 'absent',
  'The latest class is listed first');
select tests.eq((attendance_totals('30000000-0000-0000-0000-000000000001', null, 13)->>'total')::int, 1,
  'Totals only count the days asked for');
select tests.as('teacher1');
select tests.eq((attendance_totals('30000000-0000-0000-0000-000000000001')->>'total')::int, 3, 'A teacher sees totals for their own students');
select tests.as('teacher2');
select tests.eq((attendance_totals('30000000-0000-0000-0000-000000000001')->>'total')::int, 0, 'A teacher sees no totals for other teachers'' students');
select tests.as('family');
select tests.eq((attendance_totals('30000000-0000-0000-0000-000000000003')->>'total')::int, 0, 'A family can''t look up another child''s totals');
select tests.eq((my_dashboard()->'classes'->0->'attendance') - 'recent',
  '{"present":1,"late":1,"absent":1,"total":3,"checked_in":1}'::jsonb, 'A family sees their own child''s attendance on the dashboard');

-- A class that is still running doesn't count as an absence yet.
select tests.as_owner();
with s as (
  insert into class_sessions (batch_id, class_date, start_time, received_via)
  values ('40000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/London')::date, (now() at time zone 'Europe/London')::time, 'other')
  returning id)
insert into attendance (session_id, student_id, status, source)
select id, '30000000-0000-0000-0000-000000000001', 'absent', 'auto' from s;
select tests.eq((attendance_totals('30000000-0000-0000-0000-000000000001')->>'total')::int, 3,
  'A student who hasn''t joined a class that is still running is not counted absent yet');
select tests.eq((select attendance_pct from student_stats where student_id = '30000000-0000-0000-0000-000000000001'), 67::numeric,
  'The older Attendance % doesn''t count a class that is still running either');
update class_sessions set class_date = class_date - 1
where batch_id = '40000000-0000-0000-0000-000000000001' and class_date = (now() at time zone 'Europe/London')::date;
select tests.eq((attendance_totals('30000000-0000-0000-0000-000000000001')->>'absent')::int, 2,
  'Once the class is over, not joining counts as absent');

-- 6. A student who has moved to another batch -----------------------------------------------------------------
update enrolments set batch_id = '40000000-0000-0000-0000-000000000002' where student_id = '30000000-0000-0000-0000-000000000002';
select tests.as('admin');
select tests.eq((select (s->>'in_batch') from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'students') s
                 where s->>'first_name' = 'Kim'), 'false', 'Staff still see a moved student on the old register, marked as no longer in the batch');
select tests.lives(format($$select save_register('40000000-0000-0000-0000-000000000001', %L,
  '[{"student_id":"30000000-0000-0000-0000-000000000002","status":"present","reason":"Was on time, the link failed"}]')$$, :'mon1'),
  'Staff can still correct an old entry of a student who has moved');
select tests.as('teacher1');
select tests.eq(jsonb_array_length(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'students'), 1,
  'A teacher''s register lists only the students in the batch now');
select tests.as('family');
select switch_student('30000000-0000-0000-0000-000000000002');   -- Kim, now in TB-2 (no link)
select tests.throws($$select join_class('40000000-0000-0000-0000-000000000001')$$, 'not one of your classes',
  'After moving batch, a student can no longer join the old class');

-- 8. Registers of past days use the students in the batch on that day --------------------------------------
select tests.as_owner();
update enrolments set batch_id = '40000000-0000-0000-0000-000000000001', started_on = current_date
where student_id = '30000000-0000-0000-0000-000000000004';                   -- Max joins TB-1 today
update enrolments set ended_on = :'mon1'::date + 1
where student_id = '30000000-0000-0000-0000-000000000001';                   -- Sam left TB-1 the day after mon1
select tests.as('admin');
select tests.ok(not exists (select 1 from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'students') s
                            where s->>'first_name' = 'Max'), 'A student who joined later is not on an earlier register');
select tests.throws(format($$select save_register('40000000-0000-0000-0000-000000000001', %L,
  '[{"student_id":"30000000-0000-0000-0000-000000000004","status":"absent"}]')$$, :'mon1'),
  'not in this batch on that date', 'A student can''t be marked for a class from before they joined');
select tests.ok(exists (select 1 from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001')->'students') s
                        where s->>'first_name' = 'Max'), 'A student who joined today is on today''s register');
select tests.eq((select s->>'in_batch' from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001', :'mon1')->'students') s
                 where s->>'first_name' = 'Sam'), 'false', 'A student who left since is still on the old register, marked as no longer in the batch');
select tests.ok(not exists (select 1 from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000001')->'students') s
                            where s->>'first_name' = 'Sam'), 'A student who has left is not on today''s register');

-- Ticking a portal check-in on the register confirms it (it becomes the teacher's mark).
select tests.as_owner();
with s as (
  insert into class_sessions (batch_id, class_date, start_time, received_via)
  values ('40000000-0000-0000-0000-000000000002', (:'mon3'::date - 7), '16:00', 'other') returning id)
insert into attendance (session_id, student_id, status, source, joined_at)
select id, '30000000-0000-0000-0000-000000000003', 'present', 'link', now() from s;
select tests.as('teacher2');
select tests.eq(save_register('40000000-0000-0000-0000-000000000002', (:'mon3'::date - 7),
  '[{"student_id":"30000000-0000-0000-0000-000000000003","status":"present"}]'), 1,
  'Saving a check-in with the same mark still counts as confirming it');
select tests.eq((select s->>'source' from jsonb_array_elements(batch_register('40000000-0000-0000-0000-000000000002', (:'mon3'::date - 7))->'students') s
                 where s->>'first_name' = 'Lee'), 'staff', 'A confirmed check-in is the teacher''s mark from then on');
select tests.as('admin');

-- 9. One class time per batch per day ---------------------------------------------------------------------------
select tests.throws($$insert into batch_slots (batch_id, weekday, start_time) values ('40000000-0000-0000-0000-000000000001', 1, '18:00')$$,
  'only one class time on Monday', 'A batch can''t have two class times on the same day');
select tests.lives($$insert into batch_slots (batch_id, weekday, start_time) values ('40000000-0000-0000-0000-000000000001', 3, '18:00')$$,
  'A batch can have class times on different days');
select tests.as('family');
select tests.eq(my_dashboard()->'class_window', '{"before_minutes":15,"after_minutes":60,"late_minutes":10}'::jsonb,
  'The student login gets the check-in times to show by Join class');

-- 10. Safety -----------------------------------------------------------------------------------------------------
select tests.as_owner();
select tests.eq((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
                 where p.pronamespace = 'public'::regnamespace
                   and p.proname in ('join_class', 'batch_register', 'save_register', 'attendance_totals', 'record_class_join')
                   and has_function_privilege('anon', p.oid, 'execute')), null,
  'None of the attendance functions can be used without signing in');
select tests.ok(not has_function_privilege('authenticated', 'record_class_join(uuid, uuid, timestamptz)', 'execute'),
  'Nobody signed in can save a join for a student they choose');
