-- PencilMaths Admin: Production database, step 3 of 4. Make your own login an admin.
--
-- First create the login: Supabase > Authentication > Users > Add user > Create new user,
-- enter your email and a strong password, and tick "Auto Confirm User".
-- Then change the name and the email on the two marked lines below, and Run.
-- The result must show one row with your name and role "admin". No row = the email doesn't match the login.

insert into public.staff (id, full_name, email, role, active)
select id,
       'Your Full Name',                                  -- <- your name
       email, 'admin', true
from auth.users
where lower(email) = lower('your.email@example.com')     -- <- the email of the login you just made
on conflict (id) do update set role = 'admin', active = true
returning full_name, email, role;
