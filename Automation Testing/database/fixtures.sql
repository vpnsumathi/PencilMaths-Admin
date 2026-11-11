-- Test data, loaded at the start of every test file and thrown away at the end of it.
-- Fixed ids so the test files can refer to them:
--
--   People (logins)                        Data
--   admin      staff, admin                 Teachers: Tom One (teacher1), Tia Two (teacher2), Lia Left (left)
--   office     staff, operations            Batches:  TB-1 Maths Y5, Tom, 4 places, Mon 16:00      40..01
--   former     staff, no longer active                TB-2 Maths Y5, Tia, 6 places, Mon 16:00, Thu 17:00  40..02
--   teacher1   Tom One                                TB-3 Science Y5, Tom, closed, Tue 18:00         40..03
--   teacher2   Tia Two                       Students: Sam (Y5, TB-1) 30..01, Kim (Y5, TB-1) 30..02,
--   teacher_left  Lia Left (left)                      Lee (Y5, TB-2) 30..03, Max (Y6, no batch) 30..04
--   family     one login for Sam and Kim     Homework: H1 "Fractions sheet" in TB-1 (Sam, Kim) 70..01
--   lee        Lee's own login                         H2 "Times tables" in TB-2 (Lee) 70..02
--   nobody     signed in, but not staff,     Lesson library: L1 Maths Y5 "Place value" 50..01 with Hw-1, Hw-2
--              teacher or student                        (worksheets) and Hw-3 (no worksheet yet); L2 Maths Y6
--   spare      a login with no role yet

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@pm.test'),
  ('a0000000-0000-0000-0000-000000000002', 'office@pm.test'),
  ('a0000000-0000-0000-0000-000000000003', 'former@pm.test'),
  ('a0000000-0000-0000-0000-000000000009', 'spare@pm.test'),
  ('b0000000-0000-0000-0000-000000000001', 'tom@pm.test'),
  ('b0000000-0000-0000-0000-000000000002', 'tia@pm.test'),
  ('b0000000-0000-0000-0000-000000000003', 'lia@pm.test'),
  ('c0000000-0000-0000-0000-000000000001', 'family@pm.test'),
  ('c0000000-0000-0000-0000-000000000002', 'lee@pm.test'),
  ('d0000000-0000-0000-0000-000000000001', 'nobody@pm.test');

insert into tests.people (name, user_id) values
  ('admin', 'a0000000-0000-0000-0000-000000000001'), ('office', 'a0000000-0000-0000-0000-000000000002'),
  ('former', 'a0000000-0000-0000-0000-000000000003'), ('spare', 'a0000000-0000-0000-0000-000000000009'),
  ('teacher1', 'b0000000-0000-0000-0000-000000000001'), ('teacher2', 'b0000000-0000-0000-0000-000000000002'),
  ('teacher_left', 'b0000000-0000-0000-0000-000000000003'),
  ('family', 'c0000000-0000-0000-0000-000000000001'), ('lee', 'c0000000-0000-0000-0000-000000000002'),
  ('nobody', 'd0000000-0000-0000-0000-000000000001');

insert into staff (id, full_name, email, role, active) values
  ('a0000000-0000-0000-0000-000000000001', 'Ada Admin', 'admin@pm.test', 'admin', true),
  ('a0000000-0000-0000-0000-000000000002', 'Olly Office', 'office@pm.test', 'operations', true),
  ('a0000000-0000-0000-0000-000000000003', 'Fay Former', 'former@pm.test', 'operations', false);

insert into teachers (id, first_name, last_name, status, auth_user_id) values
  ('10000000-0000-0000-0000-000000000001', 'Tom', 'One', 'active', 'b0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'Tia', 'Two', 'active', 'b0000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', 'Lia', 'Left', 'left', 'b0000000-0000-0000-0000-000000000003');

insert into families (id, display_name) values
  ('20000000-0000-0000-0000-000000000001', 'One family'),
  ('20000000-0000-0000-0000-000000000002', 'Lee family'),
  ('20000000-0000-0000-0000-000000000003', 'Max family');
insert into guardians (family_id, full_name, relationship, phone, email, is_primary) values
  ('20000000-0000-0000-0000-000000000001', 'Pat Parent', 'Mother', '07000 000001', 'pat@pm.test', true);

insert into students (id, family_id, first_name, last_name, year_group, date_of_birth, status, handin_code, auth_user_id) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Sam', 'One', 5, '2016-03-01', 'active', 'sam-handin-code', 'c0000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Kim', 'One', 5, '2016-04-01', 'active', 'kim-handin-code', 'c0000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Lee', 'Two', 5, '2016-05-01', 'active', 'lee-handin-code', 'c0000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 'Max', 'Three', 6, '2015-06-01', 'active', 'max-handin-code', null);
insert into student_notes (student_id, body) values ('30000000-0000-0000-0000-000000000001', 'Prefers worksheets on paper.');

-- Batches (their lesson plan topics are copied from the curriculum by a trigger).
insert into batches (id, code, subject_id, year_group, teacher_id, capacity, started_on) values
  ('40000000-0000-0000-0000-000000000001', 'TB-1', 'maths', 5, '10000000-0000-0000-0000-000000000001', 4, current_date - 60),
  ('40000000-0000-0000-0000-000000000002', 'TB-2', 'maths', 5, '10000000-0000-0000-0000-000000000002', 6, current_date - 60),
  ('40000000-0000-0000-0000-000000000003', 'TB-3', 'science', 5, '10000000-0000-0000-0000-000000000001', 6, current_date - 300);
insert into batch_slots (batch_id, weekday, start_time) values
  ('40000000-0000-0000-0000-000000000001', 1, '16:00'),
  ('40000000-0000-0000-0000-000000000002', 1, '16:00'),
  ('40000000-0000-0000-0000-000000000002', 4, '17:00'),
  ('40000000-0000-0000-0000-000000000003', 2, '18:00');
update batches set closed_on = current_date - 30 where id = '40000000-0000-0000-0000-000000000003';

insert into enrolments (student_id, subject_id, batch_id) values
  ('30000000-0000-0000-0000-000000000001', 'maths', '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', 'maths', '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000003', 'maths', '40000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000004', 'maths', null);

-- Each student's Google Drive folder.
insert into file_links (owner_type, owner_id, student_id, provider, external_id, label) values
  ('student_folder', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'google_drive', 'folder-sam', 'Student folder'),
  ('student_folder', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'google_drive', 'folder-lee', 'Student folder');

-- Homework already set: H1 in TB-1 (Sam and Kim), H2 in TB-2 (Lee), each with its worksheet.
insert into homework_sheets (id, batch_id, title, set_on, due_on, max_mark) values
  ('70000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Fractions sheet', current_date - 3, current_date + 4, 10),
  ('70000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Times tables', current_date - 3, current_date + 4, 20);
insert into homework_results (sheet_id, student_id) values
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'),
  ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003');
insert into file_links (id, owner_type, owner_id, student_id, provider, external_id, label) values
  ('80000000-0000-0000-0000-000000000001', 'homework_sheet', '70000000-0000-0000-0000-000000000001', null, 'google_drive', 'sheet-h1', 'fractions.pdf'),
  ('80000000-0000-0000-0000-000000000002', 'homework_sheet', '70000000-0000-0000-0000-000000000002', null, 'google_drive', 'sheet-h2', 'times.pdf'),
  ('80000000-0000-0000-0000-000000000003', 'homework_submission', '70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'google_drive', 'lee-photo', 'lee.jpg');

-- Lesson library.
insert into lessons (id, subject_id, year_group, term, module, code, name, position) values
  ('50000000-0000-0000-0000-000000000001', 'maths', 5, 1, 'Number', 'TY5-L1', 'Place value', 1),
  ('50000000-0000-0000-0000-000000000002', 'maths', 6, 1, 'Algebra', 'TY6-L1', 'Algebra basics', 1);
insert into lesson_homework (id, lesson_id, slot, code, drive_file_id, url, file_name) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1, 'TY5-A001', 'drv-1', 'https://drive.test/1', 'TY5-A001.pdf'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 2, 'TY5-A002', 'drv-2', 'https://drive.test/2', null),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 3, 'TY5-A003', null, null, null),
  ('60000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000002', 1, 'TY6-A001', 'drv-4', 'https://drive.test/4', null);

insert into enquiries (child_first_name, child_last_name, year_group, parent_name, parent_phone) values
  ('Ella', 'New', 4, 'Eve New', '07000 000009');
