-- Pencil Maths Operations Portal: phase 1 schema
-- Postgres on Supabase. All times stored in UTC; class dates are local (Europe/London) calendar dates.

create extension if not exists citext;

-- Enums ---------------------------------------------------------------
create type staff_role        as enum ('admin', 'operations', 'head_teacher');
create type teacher_status    as enum ('active', 'on_leave', 'onboarding', 'left');
create type student_status    as enum ('active', 'trial', 'paused', 'leaving', 'left');
create type enquiry_stage     as enum ('new', 'assessment_sent', 'assessment_returned', 'results_shared', 'confirmed', 'enrolled', 'not_proceeding');
create type topic_status      as enum ('not_started', 'in_progress', 'complete');
create type attendance_status as enum ('present', 'late', 'absent');
create type homework_status   as enum ('pending', 'received', 'marked', 'excused');
create type update_channel    as enum ('whatsapp', 'phone', 'email', 'marks_sheet', 'other');
create type note_category     as enum ('general', 'call_log', 'academic');
-- Where a file lives. Phase 1 stores pasted links; phase 2 adds Google Drive API ids.
create type file_provider     as enum ('external_link', 'google_drive');

-- Helpers ---------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Reference data ---------------------------------------------------------
create table subjects (
  id text primary key,                 -- 'maths', 'science', 'english', 'eleven_plus'
  name text not null unique,
  sort smallint not null default 0,
  active boolean not null default true
);

-- Default lesson-plan topics per subject (optionally per year group).
create table curriculum_topics (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references subjects(id),
  year_group smallint check (year_group between 1 and 13),
  position smallint not null,
  name text not null,
  unique (subject_id, year_group, position)
);

-- People ---------------------------------------------------------------
-- Portal users. Linked 1:1 to Supabase auth users. Teachers get a role here in a later phase.
create table staff (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email citext not null unique,
  role staff_role not null default 'operations',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence teacher_code_seq start 1;
create table teachers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('T' || lpad(nextval('teacher_code_seq')::text, 3, '0')),
  first_name text not null,
  last_name text not null,
  personal_email citext unique,
  phone text,
  subject_id text references subjects(id),
  year_min smallint check (year_min between 1 and 13),
  year_max smallint check (year_max between 1 and 13),
  status teacher_status not null default 'active',
  joined_on date,
  notes text,
  auth_user_id uuid unique references auth.users(id), -- reserved for teacher logins (later phase)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger teachers_updated before update on teachers for each row execute function set_updated_at();

-- A family groups siblings and holds parent/guardian contacts.
-- Kept apart from students so teacher access (later phase) can exclude contact details.
create table families (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  whatsapp_group_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger families_updated before update on families for each row execute function set_updated_at();

create table guardians (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  full_name text not null,
  relationship text,
  phone text,
  email citext,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index guardians_one_primary on guardians(family_id) where is_primary;

create sequence student_code_seq start 1001;
create table students (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PM-' || nextval('student_code_seq')::text),
  family_id uuid references families(id) on delete set null,
  first_name text not null,
  last_name text not null,
  year_group smallint not null check (year_group between 1 and 13),
  school text,
  date_of_birth date,
  status student_status not null default 'active',
  start_date date not null default current_date,
  left_on date,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index students_name_idx on students (last_name, first_name);
create index students_status_idx on students (status);
create trigger students_updated before update on students for each row execute function set_updated_at();

-- Batches ----------------------------------------------------------------
create sequence batch_code_seq start 1;
create table batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('B-' || lpad(nextval('batch_code_seq')::text, 3, '0')),
  subject_id text not null references subjects(id),
  year_group smallint not null check (year_group between 1 and 13),
  teacher_id uuid not null references teachers(id),
  capacity smallint not null default 3 check (capacity between 1 and 12),
  started_on date not null default current_date,
  closed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger batches_updated before update on batches for each row execute function set_updated_at();

-- Weekly class slots, in UK time. weekday: 1 = Monday ... 7 = Sunday (ISO).
create table batch_slots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  unique (batch_id, weekday, start_time)
);

-- A student's place in a subject. Teacher and batch are optional until assigned.
create table enrolments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  subject_id text not null references subjects(id),
  teacher_id uuid references teachers(id),
  batch_id uuid references batches(id),
  started_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index enrolments_one_active on enrolments(student_id, subject_id) where ended_on is null;
create index enrolments_batch_idx on enrolments(batch_id) where ended_on is null;
create index enrolments_teacher_idx on enrolments(teacher_id) where ended_on is null;
create trigger enrolments_updated before update on enrolments for each row execute function set_updated_at();

-- Keep enrolment teacher in step with its batch, and batch subject consistent.
create or replace function enrolment_check() returns trigger language plpgsql as $$
declare b batches%rowtype;
begin
  if new.batch_id is not null then
    select * into b from batches where id = new.batch_id;
    if b.subject_id <> new.subject_id then
      raise exception 'Batch % is for %, not %', b.code, b.subject_id, new.subject_id;
    end if;
    new.teacher_id := b.teacher_id;
  end if;
  return new;
end $$;
create trigger enrolments_check before insert or update on enrolments for each row execute function enrolment_check();

-- Lesson plan: each batch gets its own copy of the curriculum topics.
create table batch_topics (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  position smallint not null,
  name text not null,
  status topic_status not null default 'not_started',
  completed_on date,
  unique (batch_id, position)
);

-- Classes ----------------------------------------------------------------
create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  class_date date not null,
  start_time time,
  topic_id uuid references batch_topics(id) on delete set null,
  topic_status_after topic_status,
  received_via update_channel not null default 'whatsapp',
  notes text,
  logged_by uuid references staff(id),
  logged_at timestamptz not null default now(),
  unique (batch_id, class_date)
);
create index class_sessions_date_idx on class_sessions(class_date);

create table attendance (
  session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  status attendance_status not null,
  primary key (session_id, student_id)
);
create index attendance_student_idx on attendance(student_id);

-- Homework ---------------------------------------------------------------
create table homework_sheets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  session_id uuid references class_sessions(id) on delete set null,
  title text not null,
  set_on date not null,
  due_on date,
  max_mark numeric(6,2) check (max_mark > 0),
  created_at timestamptz not null default now()
);
create index homework_sheets_batch_idx on homework_sheets(batch_id, set_on desc);

create table homework_results (
  sheet_id uuid not null references homework_sheets(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  status homework_status not null default 'pending',
  mark numeric(6,2) check (mark >= 0),
  received_on date,
  marked_on date,
  primary key (sheet_id, student_id)
);
create index homework_results_student_idx on homework_results(student_id);

-- Enquiries --------------------------------------------------------------
create sequence enquiry_code_seq start 201;
create table enquiries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('E-' || nextval('enquiry_code_seq')::text),
  child_first_name text not null,
  child_last_name text not null,
  year_group smallint not null check (year_group between 1 and 13),
  school text,
  source text,
  parent_name text not null,
  parent_relationship text,
  parent_phone text,
  parent_email citext,
  stage enquiry_stage not null default 'new',
  stage_changed_at timestamptz not null default now(),
  whatsapp_group_created boolean not null default false,
  assessment_score numeric(5,2) check (assessment_score between 0 and 100),
  assessment_comments text,
  student_id uuid references students(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index enquiries_stage_idx on enquiries(stage, stage_changed_at);
create trigger enquiries_updated before update on enquiries for each row execute function set_updated_at();

create table enquiry_subjects (
  enquiry_id uuid not null references enquiries(id) on delete cascade,
  subject_id text not null references subjects(id),
  primary key (enquiry_id, subject_id)
);

create table enquiry_events (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id) on delete cascade,
  stage enquiry_stage not null,
  at timestamptz not null default now(),
  by_staff uuid references staff(id)
);

-- Notes -------------------------------------------------------------------
create table student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  category note_category not null default 'general',
  body text not null,
  author_id uuid references staff(id),
  author_label text,                       -- e.g. a teacher's name when ops logs on their behalf
  created_at timestamptz not null default now()
);
create index student_notes_student_idx on student_notes(student_id, created_at desc);

-- File links (Google Drive ready) ----------------------------------------
-- One table for every file or folder reference. Phase 1: 'external_link' with a pasted URL.
-- Phase 2: 'google_drive' with the Drive file/folder id in external_id, filled by the sync job.
create table file_links (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('student_folder', 'homework_submission', 'homework_sheet', 'assessment')),
  owner_id uuid not null,              -- student id, or homework sheet id, etc.
  student_id uuid references students(id) on delete cascade,
  provider file_provider not null default 'external_link',
  external_id text,
  url text,
  label text,
  created_at timestamptz not null default now(),
  check (url is not null or external_id is not null)
);
create index file_links_owner_idx on file_links(owner_type, owner_id);
create unique index file_links_one_folder on file_links(student_id) where owner_type = 'student_folder';
