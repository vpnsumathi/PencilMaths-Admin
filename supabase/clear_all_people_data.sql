-- FRESH START: removes every student, teacher, family, batch and everything tied to them.
-- STAGING ONLY. Never run this on Production: it deletes real families' data and can't be undone.
-- Check the project name at the top of the Supabase dashboard says Staging before pressing Run.
--
-- Removed: students, families, parents (guardians), teachers, batches and their times, enrolments,
--   lesson plan progress (batch topics and lessons), classes and attendance, homework, marks, marked sheets,
--   file links (Drive folder links, hand-ins, corrected sheets, homework files), student notes,
--   student/family and teacher logins (staff logins are kept), and the codes restart (PM-1001, T001, B-001).
-- Kept: staff and their logins, subjects, curriculum topics, the Lesson library (lessons and worksheets),
--   enquiries (part 3 at the bottom removes them too, if you want).
-- Not touched: files in Google Drive (student folders, hand-ins, corrected sheets). Delete those in Drive if wanted.

begin;

-- 1. The student and teacher logins to remove later (never a staff login).
create temp table logins_to_remove on commit drop as
  select auth_user_id as id from students where auth_user_id is not null
  union
  select auth_user_id from teachers where auth_user_id is not null;
delete from logins_to_remove where id in (select id from staff);

-- 2. People and everything tied to them, children first.
delete from homework_markups;
delete from homework_results;
delete from file_links;
delete from attendance;
delete from homework_sheets;
delete from class_sessions;
delete from batch_lessons;
delete from batch_topics;
delete from batch_slots;
delete from enrolments;
update enquiries set student_id = null where student_id is not null;
delete from student_notes;
delete from login_current_student;
delete from students;
delete from guardians;
delete from families;
delete from batches;
delete from teachers;
delete from auth.users where id in (select id from logins_to_remove);

alter sequence student_code_seq restart with 1001;
alter sequence teacher_code_seq restart with 1;
alter sequence batch_code_seq restart with 1;

commit;

-- 3. OPTIONAL: also remove all enquiries (leads). Remove the two dashes at the start of each line below to run it.
-- delete from enquiry_events; delete from enquiry_subjects; delete from enquiries;
-- alter sequence enquiry_code_seq restart with 201;

-- Check: every count should be 0.
select (select count(*) from students) as students, (select count(*) from teachers) as teachers,
  (select count(*) from batches) as batches, (select count(*) from homework_sheets) as homework,
  (select count(*) from file_links) as files, (select count(*) from staff) as staff_kept;
