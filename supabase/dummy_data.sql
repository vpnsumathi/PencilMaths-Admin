-- Dummy data for development and testing. NOT for the live database.
-- Run once in the Supabase SQL Editor, after the migrations and seed.sql.
-- Running it again adds a second copy; clear first with clear_dummy_data.sql.
--
-- Creates: 5 teachers (1 on leave), 4 batches with weekly slots, 8 families/students,
-- 3 weeks of classes with attendance (latest week left unlogged), 1 homework sheet per batch,
-- 4 enquiries at different stages, and a few student notes.

do $$
declare
  t_maths uuid; t_sci uuid; t_eng uuid; t_11 uuid;
  b1 uuid; b2 uuid; b3 uuid; b4 uuid;
  f uuid; s uuid; sess uuid;
  stu record; c record;
begin
  -- Teachers
  insert into teachers (first_name, last_name, personal_email, phone, subject_id, year_min, year_max, joined_on)
  values ('Priya', 'Shah', 'priya.shah@example.com', '07700 900101', 'maths', 7, 11, '2025-09-01') returning id into t_maths;
  insert into teachers (first_name, last_name, personal_email, phone, subject_id, year_min, year_max, joined_on)
  values ('James', 'Okafor', 'james.okafor@example.com', '07700 900102', 'science', 7, 11, '2025-09-01') returning id into t_sci;
  insert into teachers (first_name, last_name, personal_email, phone, subject_id, year_min, year_max, joined_on)
  values ('Hannah', 'Lewis', 'hannah.lewis@example.com', '07700 900103', 'english', 5, 11, '2026-01-05') returning id into t_eng;
  insert into teachers (first_name, last_name, personal_email, phone, subject_id, year_min, year_max, joined_on)
  values ('Tom', 'Bennett', 'tom.bennett@example.com', '07700 900104', 'eleven_plus', 4, 6, '2026-02-02') returning id into t_11;
  insert into teachers (first_name, last_name, personal_email, phone, subject_id, year_min, year_max, status, joined_on)
  values ('Sara', 'Ahmed', 'sara.ahmed@example.com', '07700 900105', 'maths', 5, 9, 'on_leave', '2025-11-03');

  -- Batches and weekly slots (1 = Monday). The lesson plan is copied in automatically.
  insert into batches (subject_id, year_group, teacher_id, started_on) values ('maths', 9, t_maths, current_date - 56) returning id into b1;
  insert into batch_slots (batch_id, weekday, start_time) values (b1, 2, '17:00'), (b1, 5, '17:00');
  insert into batches (subject_id, year_group, teacher_id, started_on) values ('science', 10, t_sci, current_date - 56) returning id into b2;
  insert into batch_slots (batch_id, weekday, start_time) values (b2, 3, '18:00');
  insert into batches (subject_id, year_group, teacher_id, started_on) values ('english', 8, t_eng, current_date - 56) returning id into b3;
  insert into batch_slots (batch_id, weekday, start_time) values (b3, 1, '16:30');
  insert into batches (subject_id, year_group, teacher_id, started_on) values ('eleven_plus', 5, t_11, current_date - 56) returning id into b4;
  insert into batch_slots (batch_id, weekday, start_time) values (b4, 6, '10:00');

  -- Families, parents, students and their subjects
  for stu in select * from (values
    ('Aarav', 'Patel',    9,  'Riverside Academy', 'Neha Patel',    'Mother', '07700 900201', 'active', 'maths',       b1, null::text, null::uuid),
    ('Isla',  'Turner',   9,  'Riverside Academy', 'Mark Turner',   'Father', '07700 900202', 'active', 'maths',       b1, 'english',  null),
    ('Zara',  'Khan',     10, 'Oakfield School',   'Ayesha Khan',   'Mother', '07700 900203', 'active', 'science',     b2, null,       null),
    ('Leo',   'Martin',   10, 'Oakfield School',   'Claire Martin', 'Mother', '07700 900204', 'trial',  'science',     b2, 'maths',    null),
    ('Maya',  'Evans',    8,  'St Mary''s High',   'Rhys Evans',    'Father', '07700 900205', 'active', 'english',     b3, null,       null),
    ('Noah',  'Williams', 8,  'St Mary''s High',   'Emma Williams', 'Mother', '07700 900206', 'paused', 'english',     b3, null,       null),
    ('Ruby',  'Clarke',   5,  'Hillside Primary',  'Daniel Clarke', 'Father', '07700 900207', 'active', 'eleven_plus', b4, null,       null),
    ('Arjun', 'Nair',     5,  'Hillside Primary',  'Lakshmi Nair',  'Mother', '07700 900208', 'active', 'eleven_plus', b4, null,       null)
  ) as v(first_name, last_name, year_group, school, parent, relationship, phone, status, subj1, batch1, subj2, batch2)
  loop
    insert into families (display_name, whatsapp_group_name)
    values (stu.last_name || ' family', 'PM - ' || stu.first_name || ' ' || stu.last_name) returning id into f;
    insert into guardians (family_id, full_name, relationship, phone, email, is_primary)
    values (f, stu.parent, stu.relationship, stu.phone, lower(replace(stu.parent, ' ', '.')) || '@example.com', true);
    insert into students (family_id, first_name, last_name, year_group, school, status, start_date)
    values (f, stu.first_name, stu.last_name, stu.year_group, stu.school, stu.status::student_status, current_date - 60)
    returning id into s;
    insert into enrolments (student_id, subject_id, batch_id, started_on) values (s, stu.subj1, stu.batch1, current_date - 56);
    if stu.subj2 is not null then
      insert into enrolments (student_id, subject_id, batch_id) values (s, stu.subj2, stu.batch2);
    end if;
  end loop;

  -- Lesson progress: first two topics done, third in progress
  update batch_topics set status = 'complete', completed_on = current_date - 14 where position <= 2;
  update batch_topics set status = 'in_progress' where position = 3;

  -- Classes for 3 weeks (the most recent week is left unlogged on purpose), with attendance
  for c in select * from expected_classes(current_date - 28, current_date - 1) where class_date < current_date - 7 loop
    insert into class_sessions (batch_id, class_date, start_time, topic_id, topic_status_after, notes)
    values (c.batch_id, c.class_date, c.start_time,
            (select id from batch_topics where batch_id = c.batch_id and position = 3),
            'in_progress', 'Good session.')
    returning id into sess;
    insert into attendance (session_id, student_id, status)
    select sess, e.student_id, (array['present', 'present', 'present', 'late', 'absent']::attendance_status[])[1 + floor(random() * 5)::int]
    from enrolments e where e.batch_id = c.batch_id and e.ended_on is null;
  end loop;

  -- One homework sheet per batch, with mixed results
  insert into homework_sheets (batch_id, title, set_on, due_on, max_mark)
  select id, 'Practice sheet 1', current_date - 10, current_date - 3, 20 from batches;
  insert into homework_results (sheet_id, student_id, status, mark, received_on, marked_on)
  select sheet_id, student_id, st,
         case when st = 'marked' then 12 + abs(hashtext(student_id::text)) % 9 end,
         case when st in ('received', 'marked') then current_date - 4 end,
         case when st = 'marked' then current_date - 2 end
  from (select h.id as sheet_id, e.student_id,
               (array['marked', 'marked', 'received', 'pending']::homework_status[])[1 + abs(hashtext(e.student_id::text)) % 4] as st
        from homework_sheets h join enrolments e on e.batch_id = h.batch_id and e.ended_on is null) x;

  -- Enquiries at different stages
  insert into enquiries (child_first_name, child_last_name, year_group, school, source, parent_name, parent_relationship,
                         parent_phone, parent_email, stage, stage_changed_at, assessment_score)
  values
    ('Oliver', 'Brown', 7,  'Riverside Academy', 'Google',          'Sophie Brown', 'Mother', '07700 900301', 'sophie.brown@example.com', 'new',             now() - interval '1 day',   null),
    ('Amelia', 'Singh', 6,  'Hillside Primary',  'Friend referral', 'Raj Singh',    'Father', '07700 900302', 'raj.singh@example.com',    'assessment_sent', now() - interval '4 days',  null),
    ('Ethan',  'Wright', 10, 'Oakfield School',  'Facebook',        'Laura Wright', 'Mother', '07700 900303', 'laura.wright@example.com', 'results_shared',  now() - interval '6 days',  72),
    ('Freya',  'Hall',  4,  'Hillside Primary',  'Leaflet',         'Ben Hall',     'Father', '07700 900304', 'ben.hall@example.com',     'not_proceeding',  now() - interval '12 days', null);
  insert into enquiry_subjects (enquiry_id, subject_id)
  select id, case when year_group <= 6 then 'eleven_plus' else 'maths' end from enquiries;
  insert into enquiry_events (enquiry_id, stage, at) select id, stage, stage_changed_at from enquiries;

  -- Notes
  insert into student_notes (student_id, category, body, author_label)
  select id, 'academic', 'Settling in well and confident with the basics.', 'Teacher' from students where status = 'active' limit 3;
  insert into student_notes (student_id, category, body, author_label)
  select id, 'call_log', 'Parent asked to pause during exam season.', 'Operations' from students where status = 'paused';
end $$;
