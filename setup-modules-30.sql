-- ============================================================
--  Samaji — MIGRATION 30 : Per-school access rights + school-admin
--  managed staff/teacher logins with forced first-login password
--  change.
--
--  What this adds:
--   1. rights_catalog  — the fixed list of grantable rights.
--   2. school_rights    — which rights are ENABLED for a given school.
--                          Ticked by super_admin in the Admin Console
--                          (Rights tab). A right must be enabled for a
--                          school before it can be granted to anyone
--                          there — "bound per school".
--   3. user_rights      — which of the school's enabled rights a given
--                          staff account actually has. Assigned by the
--                          school_admin ("owner") in the School Portal
--                          (Settings → Users & Access).
--   4. profiles.school_role ('owner' | 'staff') — existing school_admin
--                          accounts default to 'owner' (unrestricted,
--                          exactly like today). New staff accounts a
--                          school_admin creates default to 'staff' and
--                          are gated by their granted rights.
--   5. profiles.must_change_password / teachers.must_change_password —
--                          set whenever an admin creates a login or
--                          resets a password; the portal forces a
--                          password-set screen before granting access,
--                          same pattern as the existing parent portal.
--   6. RPCs so a school_admin can create teacher/staff logins and
--      reset passwords for their OWN school only, without needing
--      super_admin or the service-role key.
--
--  Run AFTER setup-modules-29.sql.
-- ============================================================

-- ---------- 1. RIGHTS CATALOG ---------------------------------
create table if not exists rights_catalog (
  key         text primary key,
  label       text not null,
  description text,
  sort_order  integer not null default 0
);

insert into rights_catalog (key, label, description, sort_order) values
  ('manage_students',       'Manage Students',           'Enroll, edit and view student records', 1),
  ('manage_attendance',     'Manage Attendance',         'Mark and review attendance', 2),
  ('manage_exams',          'Manage Exams & Grading',    'Enter marks, publish results, report books', 3),
  ('manage_fees',           'Manage Fees & Payments',    'Fee structures, payments, receipts', 4),
  ('manage_library',        'Manage Library',            'Books and loans', 5),
  ('manage_timetable',      'Manage Timetable',          'Class/subject scheduling', 6),
  ('manage_communications', 'Manage Communications',     'Announcements and SMS', 7),
  ('manage_transport',      'Manage Transport',          'Routes, vehicles, assignments', 8),
  ('manage_payroll',        'Manage Payroll',            'Staff, payroll runs, payslips', 9),
  ('view_reports',          'View Reports & Analytics',  'Dashboards and analytics', 10),
  ('manage_settings',       'Manage School Settings',    'Classes, subjects, academic setup, integrations', 11),
  ('manage_users',          'Manage Users & Access',     'Add staff/teacher logins, reset passwords, assign rights', 12)
on conflict (key) do update set label = excluded.label, description = excluded.description, sort_order = excluded.sort_order;

-- ---------- 2. PER-SCHOOL RIGHT ENABLEMENT (super_admin ticks) --
create table if not exists school_rights (
  school_id  text not null references schools(id) on delete cascade,
  right_key  text not null references rights_catalog(key) on delete cascade,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (school_id, right_key)
);

-- ---------- 3. PER-USER GRANTED RIGHTS (school_admin assigns) ---
create table if not exists user_rights (
  user_id    uuid not null references auth.users(id) on delete cascade,
  right_key  text not null references rights_catalog(key) on delete cascade,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, right_key)
);
create index if not exists user_rights_user_idx on user_rights(user_id);

-- ---------- 4. PROFILES: staff sub-role + forced password change -
alter table profiles add column if not exists school_role text not null default 'owner';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_school_role_check') then
    alter table profiles add constraint profiles_school_role_check check (school_role in ('owner','staff'));
  end if;
end $$;
alter table profiles add column if not exists must_change_password boolean not null default false;

-- ---------- 5. TEACHERS: forced password change flag ------------
alter table teachers add column if not exists must_change_password boolean not null default false;

-- ---------- 6. HELPERS ---------------------------------------------
-- Rights granted to the caller.
create or replace function my_rights()
returns text[] language sql stable security definer
set search_path = public as $$
  select coalesce(array_agg(right_key), '{}'::text[]) from user_rights where user_id = auth.uid();
$$;
grant execute on function my_rights() to authenticated;

-- is_school_admin() is true for ANY school_admin-role account, including
-- restricted 'staff' accounts — it only guards ordinary module data. Login
-- issuance/reset/revoke and rights assignment are more sensitive (a 'staff'
-- account could otherwise escalate itself by resetting the owner's password
-- or granting itself rights), so those are gated by this stricter check
-- instead: the account must be the school's unrestricted 'owner', or a
-- 'staff' account that itself holds the 'manage_users' right.
create or replace function can_manage_school_users()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.school_id is not null
      and p.role <> 'teacher'
      and (
        p.school_role = 'owner'
        or exists (select 1 from user_rights ur where ur.user_id = p.id and ur.right_key = 'manage_users')
      )
  );
$$;
grant execute on function can_manage_school_users() to authenticated;

-- profiles' own RLS only lets a user see their own row (id = auth.uid()),
-- so a raw "exists (select 1 from profiles where id = <someone else>)"
-- inside another table's policy silently returns no rows for anyone but
-- that person — it doesn't error, it just always evaluates false. This
-- wrapper is SECURITY DEFINER so it bypasses that and actually resolves
-- the target user's school, the same way my_school() does for the caller.
create or replace function profile_school_id(p_user_id uuid)
returns text language sql stable security definer
set search_path = public as $$
  select school_id from profiles where id = p_user_id;
$$;
grant execute on function profile_school_id(uuid) to authenticated;

-- ---------- 7. RLS -----------------------------------------------
alter table rights_catalog enable row level security;
alter table school_rights  enable row level security;
alter table user_rights    enable row level security;

drop policy if exists p_rights_catalog_read on rights_catalog;
create policy p_rights_catalog_read on rights_catalog for select to authenticated using (true);

drop policy if exists p_school_rights_read on school_rights;
create policy p_school_rights_read on school_rights for select to authenticated
  using (is_super_admin() or school_id = my_school());

drop policy if exists p_school_rights_write on school_rights;
create policy p_school_rights_write on school_rights for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists p_user_rights_super on user_rights;
create policy p_user_rights_super on user_rights for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- A school's 'owner' (or a 'staff' account holding 'manage_users') may
-- grant/revoke rights for accounts in their own school, but only rights
-- that super_admin has enabled for that school.
drop policy if exists p_user_rights_school_admin on user_rights;
create policy p_user_rights_school_admin on user_rights for all to authenticated
  using (
    can_manage_school_users()
    and profile_school_id(user_rights.user_id) = my_school()
  )
  with check (
    can_manage_school_users()
    and profile_school_id(user_rights.user_id) = my_school()
    and exists (select 1 from school_rights sr where sr.school_id = my_school() and sr.right_key = user_rights.right_key and sr.enabled = true)
  );

drop policy if exists p_user_rights_self_read on user_rights;
create policy p_user_rights_self_read on user_rights for select to authenticated
  using (user_id = auth.uid());

-- ---------- 8. SCHOOL-ADMIN SCOPED LOGIN MANAGEMENT ---------------
-- Create a portal login for an EXISTING teacher directory row (added
-- via Settings → Teachers) in the caller's own school. Replaces the
-- old self-signup flow at /teacher/ — the school_admin now issues the
-- password directly and hands it to the teacher.
create or replace function school_create_teacher_login(
  p_teacher_id uuid,
  p_password text
) returns uuid
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  new_id uuid := gen_random_uuid();
  t teachers%rowtype;
  sid text;
begin
  if not can_manage_school_users() then raise exception 'Not authorized'; end if;
  sid := my_school();
  if sid is null then raise exception 'No school on your account'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'Password must be at least 6 characters'; end if;

  select * into t from teachers where id = p_teacher_id and school_id = sid;
  if t.id is null then raise exception 'Teacher not found in your school'; end if;
  if t.auth_user_id is not null then raise exception 'This teacher already has a login — use Reset password instead'; end if;
  if t.email is null or t.email = '' then raise exception 'Add an email for this teacher first'; end if;

  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, reauthentication_token,
    email_change, email_change_token_new, email_change_token_current,
    email_change_confirm_status,
    phone, phone_change, phone_change_token,
    is_sso_user, is_super_admin,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_id, 'authenticated', 'authenticated', t.email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    '', '', '',
    '', '', '',
    0,
    null, '', '',
    false, false,
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', coalesce(t.name, ''), 'phone', coalesce(t.phone, ''))
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), new_id,
    jsonb_build_object('sub', new_id::text, 'email', t.email),
    'email', new_id::text,
    now(), now(), now()
  );

  insert into profiles (id, role, school_id, school_role, must_change_password)
  values (new_id, 'teacher', sid, 'owner', true)
  on conflict (id) do update set role = 'teacher', school_id = sid, must_change_password = true;

  update teachers set auth_user_id = new_id, must_change_password = true where id = t.id;

  return new_id;
end;
$$;

-- Create a school-portal staff account (school_role='staff'), gated by
-- rights the school_admin assigns from what super_admin enabled for
-- the school. Not linked to the teachers directory.
create or replace function school_create_staff(
  p_email text,
  p_password text,
  p_full_name text default null,
  p_phone text default null
) returns uuid
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  new_id uuid := gen_random_uuid();
  sid text;
begin
  if not can_manage_school_users() then raise exception 'Not authorized'; end if;
  sid := my_school();
  if sid is null then raise exception 'No school on your account'; end if;
  if p_email is null or p_email = '' then raise exception 'Email is required'; end if;
  if length(coalesce(p_password,'')) < 6 then raise exception 'Password must be at least 6 characters'; end if;

  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, reauthentication_token,
    email_change, email_change_token_new, email_change_token_current,
    email_change_confirm_status,
    phone, phone_change, phone_change_token,
    is_sso_user, is_super_admin,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    '', '', '',
    '', '', '',
    0,
    null, '', '',
    false, false,
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', coalesce(p_full_name, ''), 'phone', coalesce(p_phone, ''))
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), new_id,
    jsonb_build_object('sub', new_id::text, 'email', p_email),
    'email', new_id::text,
    now(), now(), now()
  );

  insert into profiles (id, role, school_id, school_role, must_change_password)
  values (new_id, 'school_admin', sid, 'staff', true)
  on conflict (id) do update set role = 'school_admin', school_id = sid, school_role = 'staff', must_change_password = true;

  return new_id;
end;
$$;

-- Reset the password of a teacher or staff login in the caller's own
-- school. Always re-arms the forced password-change flow.
create or replace function school_reset_password(
  p_user_id uuid,
  p_new_password text
) returns void
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  target_school text;
begin
  if not can_manage_school_users() then raise exception 'Not authorized'; end if;
  if length(coalesce(p_new_password,'')) < 6 then raise exception 'Password must be at least 6 characters'; end if;

  select school_id into target_school from profiles where id = p_user_id;
  if target_school is null or target_school <> my_school() then
    raise exception 'Not authorized for this user';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)), updated_at = now()
  where id = p_user_id;

  update profiles set must_change_password = true where id = p_user_id;
  update teachers set must_change_password = true where auth_user_id = p_user_id;
end;
$$;

-- Remove a teacher/staff login from the caller's own school. For a
-- teacher this only revokes the LOGIN — their teachers directory row
-- (and class/subject assignments) is left in place, auth_user_id
-- cleared so a new login can be issued later.
create or replace function school_revoke_user(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare
  target_school text;
begin
  if not can_manage_school_users() then raise exception 'Not authorized'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot remove your own account'; end if;

  select school_id into target_school from profiles where id = p_user_id;
  if target_school is null or target_school <> my_school() then
    raise exception 'Not authorized for this user';
  end if;

  update teachers set auth_user_id = null, must_change_password = false where auth_user_id = p_user_id;
  delete from auth.users where id = p_user_id;
end;
$$;

-- List staff (school_admin/school_role='staff') accounts for the
-- caller's own school, with their granted rights.
create or replace function school_list_staff()
returns jsonb
language plpgsql security definer
set search_path = public, auth
as $$
declare
  sid text;
  result jsonb;
begin
  if not can_manage_school_users() then raise exception 'Not authorized'; end if;
  sid := my_school();

  select coalesce(jsonb_agg(row_order order by row_order->>'created_at' desc), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'user_id', u.id,
      'email', u.email,
      'full_name', coalesce(u.raw_user_meta_data->>'full_name',''),
      'phone', coalesce(u.raw_user_meta_data->>'phone',''),
      'must_change_password', coalesce(p.must_change_password,false),
      'created_at', u.created_at,
      'rights', coalesce((select jsonb_agg(ur.right_key) from user_rights ur where ur.user_id = u.id), '[]'::jsonb)
    ) as row_order
    from auth.users u
    join profiles p on p.id = u.id
    where p.school_id = sid and p.role = 'school_admin' and p.school_role = 'staff'
  ) sub;

  return result;
end;
$$;

-- Caller sets their own new password (any role) and clears the
-- forced-change flag. Same password rules as parent_change_password.
create or replace function my_change_password(p_new_password text)
returns void
language plpgsql security definer
set search_path = public, auth, extensions
as $$
begin
  if length(p_new_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;
  if p_new_password !~ '[A-Z]' then
    raise exception 'Password must contain at least one uppercase letter';
  end if;
  if p_new_password !~ '[0-9]' then
    raise exception 'Password must contain at least one number';
  end if;
  if p_new_password !~ '[^a-zA-Z0-9]' then
    raise exception 'Password must contain at least one special character';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = auth.uid();

  update profiles set must_change_password = false where id = auth.uid();
  update teachers set must_change_password = false where auth_user_id = auth.uid();
end;
$$;

grant execute on function school_create_teacher_login(uuid,text) to authenticated;
grant execute on function school_create_staff(text,text,text,text) to authenticated;
grant execute on function school_reset_password(uuid,text) to authenticated;
grant execute on function school_revoke_user(uuid) to authenticated;
grant execute on function school_list_staff() to authenticated;
grant execute on function my_change_password(text) to authenticated;

-- ---------- 9. GRANTS (idempotent, matches existing pattern) -----
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ---------- 10. NOTES ---------------------------------------------
-- To enable rights for a school, sign in to /admin/ as super_admin →
-- Rights → pick a school → tick the rights that school is allowed to
-- delegate. Then in /school/ → Settings → Users & Access, the
-- school_admin ("owner") can add staff and tick which of those
-- enabled rights each staff member gets. Teachers get logins from
-- Settings → Teachers → "Create login" (replaces the old /teacher/
-- self-signup).
