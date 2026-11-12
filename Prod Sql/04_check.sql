-- PencilMaths Admin: Production database, step 4 of 4. A read-only check: it changes nothing.
-- Run it after steps 1 to 3. Every row should end in "yes". Any "NO": stop and ask before going further.

with
  own_class as (
    select c.* from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')),
  own_proc as (
    select p.* from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname <> 'rls_auto_enable'   -- Supabase's own (switches row-level security on for new tables), not the app's
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
  -- Who may do what (anon, authenticated, service_role, everyone) on every table, column, sequence and function.
  rights as (
    select 'rel ' || c.relname as obj, coalesce(r.rolname, 'PUBLIC') as who, a.privilege_type as what
    from own_class c, aclexplode(c.relacl) a left join pg_roles r on r.oid = a.grantee
    union all
    select 'col ' || c.relname || '.' || t.attname, coalesce(r.rolname, 'PUBLIC'), a.privilege_type
    from own_class c join pg_attribute t on t.attrelid = c.oid and t.attacl is not null,
         aclexplode(t.attacl) a left join pg_roles r on r.oid = a.grantee
    union all
    select 'fn ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', coalesce(r.rolname, 'PUBLIC'), a.privilege_type
    from own_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a left join pg_roles r on r.oid = a.grantee),
  checks(n, what, expected, found) as (
    values
      (1, 'Tables', '28', (select count(*)::text from own_class where relkind = 'r')),
      (2, 'Views', '4', (select count(*)::text from own_class where relkind = 'v')),
      (3, 'Functions', '65', (select count(*)::text from own_proc)),
      (4, 'Triggers', '21', (select count(*)::text from pg_trigger t join own_class c on c.oid = t.tgrelid where not t.tgisinternal)),
      (5, 'Indexes', '78', (select count(*)::text from own_class where relkind = 'i')),
      (6, 'Row-level security rules', '62', (select count(*)::text from pg_policy p join own_class c on c.oid = p.polrelid)),
      (7, 'Tables without row-level security', '0', (select count(*)::text from own_class where relkind = 'r' and not relrowsecurity)),
      (8, 'Subjects', '4', (select count(*)::text from public.subjects)),
      (9, 'Curriculum topics', '54', (select count(*)::text from public.curriculum_topics)),
      (10, 'Admins', 'at least 1', (select case when count(*) > 0 then 'at least 1' else '0' end from public.staff where role = 'admin' and active)),
      (11, 'Students, batches, enquiries (must be empty)', '0', (select (select count(*) from public.students) + (select count(*) from public.batches) + (select count(*) from public.enquiries))::text),
      (12, 'Permissions fingerprint (same as the 29 scripts)', '986fa73cc44e794547d5be66765415a2',
           (select md5(string_agg(obj || ':' || who || ':' || what, ',' order by obj collate "C", who collate "C", what collate "C")) from rights
            where who in ('anon', 'authenticated', 'service_role', 'PUBLIC') and what <> 'MAINTAIN'))
  )
select n as "#", what as "Check", expected as "Expected", found as "Found",
       case when expected = found then 'yes' else 'NO' end as "OK"
from checks order by n;
