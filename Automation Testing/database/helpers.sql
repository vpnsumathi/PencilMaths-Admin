-- Test helpers: a results table, small check functions, and a way to "sign in" as a test person.
-- Loaded once into the test database, after all the migrations.
--
--   select tests.as('teacher1');                       sign in as someone from fixtures.sql (null = not signed in)
--   select tests.eq(<what we got>, <what we expect>, 'What should be true, in plain words');
--   select tests.ok(<true or false>, 'What should be true');
--   select tests.throws($$<sql>$$, '<part of the error message>', 'What should be refused');
--   select tests.lives($$<sql>$$, 'What should work');
--   select tests.as_owner();                           back to the database owner (no rules), to set things up

create schema tests;
create table tests.results (n serial primary key, name text not null, ok boolean not null, detail text);
create table tests.people (name text primary key, user_id uuid);
grant usage on schema tests to public;
grant select, insert on tests.results to public;
grant select on tests.people to public;
grant usage on sequence tests.results_n_seq to public;

create function tests.ok(p_ok boolean, p_name text, p_detail text default null) returns void
language plpgsql as $$
begin
  insert into tests.results (name, ok, detail)
  values (p_name, coalesce(p_ok, false),
          case when coalesce(p_ok, false) then null
               else coalesce(p_detail, 'the check was ' || coalesce(p_ok::text, 'empty (null)')) end);
end $$;

create function tests.eq(p_got anycompatible, p_want anycompatible, p_name text) returns void
language sql as $$
  select tests.ok(p_got is not distinct from p_want, p_name,
                  format('got %s, expected %s', coalesce(p_got::text, 'nothing (null)'), coalesce(p_want::text, 'nothing (null)')))
$$;

-- Runs the SQL and passes if it fails with an error that contains p_message (any case).
create function tests.throws(p_sql text, p_message text, p_name text) returns void
language plpgsql as $$
declare err text;
begin
  begin
    execute p_sql;
  exception when others then err := sqlerrm;
  end;
  perform tests.ok(err is not null and strpos(lower(err), lower(p_message)) > 0, p_name,
                   case when err is null then 'it was allowed, but should have been refused'
                        else 'it was refused, but with a different message: ' || err end);
end $$;

-- Runs the SQL and passes if it works without an error.
create function tests.lives(p_sql text, p_name text) returns void
language plpgsql as $$
declare err text;
begin
  begin
    execute p_sql;
  exception when others then err := sqlerrm;
  end;
  perform tests.ok(err is null, p_name, 'it was refused: ' || coalesce(err, ''));
end $$;

-- Sign in as a test person (see fixtures.sql). null means a phone or browser that is not signed in.
create function tests.as(p_person text) returns void
language plpgsql as $$
declare uid uuid;
begin
  perform set_config('role', 'none', true);
  if p_person is not null then
    select user_id into uid from tests.people where name = p_person;
    if uid is null then raise exception 'tests.as: no test person called %', p_person; end if;
  end if;
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('role', case when uid is null then 'anon' else 'authenticated' end, true);
end $$;

-- Back to the database owner: no rules apply. Used to set up or look at data behind the scenes.
create function tests.as_owner() returns void
language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- One line per check, read by run-database-tests.sh.
create function tests.report() returns setof text
language sql as $$
  select case when ok then 'PASS|' || name else 'FAIL|' || name || '|' || coalesce(detail, '') end
  from tests.results order by n
$$;
