-- Checks on the database as a whole, so a new migration can't quietly break the safety rules.
-- Each check lists what is wrong (by name) when it fails.

select tests.as_owner();

select tests.eq((select string_agg(relname, ', ' order by relname) from pg_class
                 where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity), null,
  'Every table has row-level security switched on');

select tests.eq((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
                 where p.pronamespace = 'public'::regnamespace and p.prosecdef
                   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), null,
  'Every function that runs with full rights fixes its search_path');

select tests.eq((select string_agg(relname, ', ' order by relname) from pg_class
                 where relnamespace = 'public'::regnamespace and relkind = 'v'
                   and not coalesce(reloptions @> array['security_invoker=true'], false)), null,
  'Every view follows the signed-in person''s rules (security_invoker)');

select tests.eq((select string_agg(tablename || '.' || policyname, ', ' order by 1) from pg_policies
                 where schemaname = 'public' and (qual in ('is_staff()', 'is_admin()') or with_check in ('is_staff()', 'is_admin()'))), null,
  'Staff rules are written (select is_staff()), so they run once per query (guide 18)');

select tests.eq((select string_agg(tablename || '.' || policyname, ', ' order by 1) from pg_policies
                 where schemaname = 'public' and tablename <> 'attendance'
                   and (coalesce(qual, '') || coalesce(with_check, '')) like '%teaches\_%'), null,
  'Teacher rules use the my_…_ids() lists, not a teaches_…() call on every row (guide 18)');

-- 29 from guide 15, plus 5 from the AI question bank script (supabase/migrations/AI) where it is present, so this
-- check passes on the staging branch (no AI scripts) and on ai/question-bank alike.
select tests.eq((select count(*) from pg_policies where schemaname = 'public' and policyname like 'teacher\_%'),
  29::bigint + case when to_regclass('public.question_versions') is not null then 5 else 0 end,
  'There are 29 teacher rules from guide 15, plus 5 for the question bank when its script has run');

select tests.eq((select string_agg(c, ', ' order by c) from unnest(array['date_of_birth', 'handin_code']) c
                 where has_column_privilege('authenticated', 'public.students', c, 'select')), null,
  'Dates of birth and hand-in codes are hidden from everyone signed in');

select tests.eq((select string_agg(relname, ', ' order by relname) from pg_class c
                 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname = 'drive_folders'
                   and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select'))), null,
  'Saved Drive folder ids can only be read by the server');

select tests.eq((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
                 where p.pronamespace = 'public'::regnamespace and p.proname in ('handin_page', 'handin_target', 'handin_record')
                   and not has_function_privilege('anon', p.oid, 'execute')), null,
  'The WhatsApp hand-in link functions can be used without signing in');
