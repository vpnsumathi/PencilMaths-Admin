-- PencilMaths Admin: Production database, step 2 of 4. The starting data: 4 subjects and their curriculum topics.
-- The same as supabase/seed.sql. Run it once, after 01_schema.sql. It is safe to run again: it skips subjects that exist and subjects that already have topics.
-- Never run dummy_data.sql, clear_dummy_data.sql or clear_all_people_data.sql on Production.

begin;

insert into public.subjects (id, name, sort) values
  ('maths', 'Maths', 1), ('science', 'Science', 2), ('english', 'English', 3), ('eleven_plus', '11+ Prep', 4)
on conflict (id) do nothing;

insert into public.curriculum_topics (subject_id, position, name)
select 'maths', p, n from unnest(array['Place value and rounding','Negative numbers','Fractions, decimals and percentages','Ratio and proportion','Algebraic expressions','Solving linear equations','Sequences','Straight-line graphs','Angles and polygons','Area and perimeter','Volume and surface area','Pythagoras'' theorem','Probability','Statistics and averages','Simultaneous equations','Quadratics']) with ordinality as x(n, p)
where not exists (select 1 from public.curriculum_topics t where t.subject_id = 'maths');
insert into public.curriculum_topics (subject_id, position, name)
select 'science', p, n from unnest(array['Cells and organisation','Particle model','Atomic structure','Periodic table','Forces and motion','Energy stores and transfers','Chemical reactions','Acids and alkalis','Electricity and circuits','Waves','Ecosystems','Inheritance and variation','Rates of reaction','Magnetism']) with ordinality as x(n, p)
where not exists (select 1 from public.curriculum_topics t where t.subject_id = 'science');
insert into public.curriculum_topics (subject_id, position, name)
select 'english', p, n from unnest(array['Reading comprehension','Inference and deduction','Language analysis','Structure analysis','Descriptive writing','Narrative writing','Persuasive writing','Punctuation and grammar','Vocabulary building','Poetry comparison','Shakespeare extract','Exam technique']) with ordinality as x(n, p)
where not exists (select 1 from public.curriculum_topics t where t.subject_id = 'english');
insert into public.curriculum_topics (subject_id, position, name)
select 'eleven_plus', p, n from unnest(array['Verbal reasoning: codes','Verbal reasoning: word links','Non-verbal reasoning: sequences','Non-verbal reasoning: matrices','Arithmetic speed','Word problems','Comprehension practice','Spelling and vocabulary','Timed mock paper 1','Timed mock paper 2','Creative writing','Mock paper review']) with ordinality as x(n, p)
where not exists (select 1 from public.curriculum_topics t where t.subject_id = 'eleven_plus');

commit;
