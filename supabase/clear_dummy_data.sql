-- Removes ALL teachers, families, students, batches, classes, homework, enquiries, notes and file links.
-- Keeps reference data (subjects, curriculum_topics) and staff logins.
-- Development only: never run this on a database with real data.

truncate teachers, families, guardians, students, batches, batch_slots, enrolments, batch_topics,
  class_sessions, attendance, homework_sheets, homework_results, enquiries, enquiry_subjects,
  enquiry_events, student_notes, file_links cascade;
