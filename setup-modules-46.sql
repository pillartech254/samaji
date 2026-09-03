-- ============================================================
--  Samaji — MIGRATION 46 : one parent, multiple schools
--
--  Diagnosed directly: a parent's login identity is built purely
--  from their phone number (phone + "@parent.samaji.app", in both
--  the Parent Portal's login screen and admin_create_user) with no
--  school-specific component at all. Because parent_accounts.id was
--  the sole primary key (a strict 1:1 with auth.users), one phone
--  number could only ever be linked to exactly one school. A parent
--  with children at two different schools had no way to be set up
--  correctly at the second one — admin_create_user's raw insert into
--  auth.users would fail outright on the email's existing unique
--  constraint, surfacing as a confusing, unexplained Postgres error
--  in the admin console.
--
--  The fix: parent_accounts becomes a genuine join table between one
--  identity (auth.users, matched by phone) and however many schools
--  that identity is actually linked to, instead of assuming exactly
--  one. Every existing RLS policy that references parent_accounts
--  already does `pa.id = auth.uid() and pa.school_id = <target>.
--  school_id` together (school/index.html and the Parent Portal's own
--  RLS were both audited directly for this before writing this
--  migration, not assumed) — meaning every one of those policies
--  continues to work correctly, unmodified, whether a parent has one
--  school row or several: EXISTS just needs one matching row for the
--  specific school being accessed, and correctly finds none for a
--  school the parent isn't linked to.
--
--  Run AFTER setup-modules-45.sql. Safe to run multiple times.
-- ============================================================

-- ---------- 1. parent_accounts: id alone -> (id, school_id) --------------
-- A parent who currently has exactly one row is completely unaffected —
-- the same (id, school_id) pair simply becomes their composite key
-- instead of id alone. This only changes what becomes POSSIBLE (a
-- second row for a second school), not anything about existing rows.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'parent_accounts'::regclass and contype = 'p' and conname = 'parent_accounts_pkey'
  ) then
    alter table parent_accounts drop constraint parent_accounts_pkey;
  end if;
end $$;

alter table parent_accounts add primary key (id, school_id);

-- ---------- 2. admin_create_user: reuse an existing identity for a ------
-- ----------    second school instead of failing outright ---------------
-- Only the parent-role path changes: if a user with this email (i.e.
-- this exact phone number, since the Parent Portal's login builds the
-- same email from the same phone) already exists, reuse that auth.
-- users id and just add a parent_accounts row for the new school,
-- rather than attempting a second auth.users insert that would fail
-- on its own unique email constraint. Every other role (school_admin,
-- teacher, super_admin, etc.) is completely unchanged — those still
-- always create a fresh auth.users row, exactly as before; multi-
-- school staff accounts are a separate, much rarer case not addressed
-- by this migration.
create or replace function admin_create_user(
  p_email text,
  p_password text,
  p_role text default 'parent',
  p_school_id text default null,
  p_phone text default null,
  p_full_name text default null
) returns uuid
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  new_id uuid;
  existing_id uuid;
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

  if p_role = 'parent' then
    select id into existing_id from auth.users where email = p_email;
  end if;

  if existing_id is not null then
    -- Same phone/identity already registered (at a different school,
    -- almost always — this function is never called twice for the
    -- same email at the SAME school, since the caller's own "add
    -- user" form is scoped to one school per call). Link them to this
    -- school too, rather than failing.
    if p_school_id is null then
      raise exception 'A school is required to link an existing parent account.';
    end if;

    insert into parent_accounts (id, school_id, phone, full_name, must_change_password)
    values (existing_id, p_school_id, coalesce(p_phone, ''), p_full_name, true)
    on conflict (id, school_id) do update set phone = excluded.phone, full_name = excluded.full_name;

    -- profiles stays pointed at whichever school was set most
    -- recently — informational only for a multi-school parent (see
    -- this migration's own header); parent_accounts is the source of
    -- truth for actual access, and every RLS policy already reads
    -- from there, not from profiles.school_id, for parent access.
    update profiles set school_id = p_school_id where id = existing_id and role = 'parent';

    return existing_id;
  end if;

  new_id := gen_random_uuid();

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

  insert into profiles (id, role, school_id)
  values (new_id, p_role, p_school_id)
  on conflict (id) do update set role = p_role, school_id = p_school_id;

  if p_role = 'parent' and p_phone is not null then
    insert into parent_accounts (id, school_id, phone, full_name, must_change_password)
    values (new_id, p_school_id, p_phone, p_full_name, true)
    on conflict (id, school_id) do update set phone = excluded.phone, full_name = excluded.full_name;
  end if;

  return new_id;
end;
$$;

-- ---------- 3. admin_list_users: show a multi-school parent once per ---
-- ----------    school they're actually linked to, not just their -------
-- ----------    profiles.school_id ---------------------------------------
-- Filtering a school-scoped user list (p_school_id provided) previously
-- checked only profiles.school_id — a parent whose profiles.school_id
-- pointed at School A would never appear in School B's user list even
-- after being linked there via parent_accounts. Checked directly
-- against the actual query shape rather than assumed: the LEFT JOIN
-- itself already produces one row per parent_accounts match with no
-- change needed (a plain left join naturally returns a row per match);
-- only the WHERE filter needed correcting.
create or replace function admin_list_users(p_school_id text default null)
returns jsonb
language plpgsql security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(row_order), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'user_id', u.id,
      'email', u.email,
      'role', p.role,
      'school_id', coalesce(pa.school_id, p.school_id),
      'phone', coalesce(pa.phone, u.raw_user_meta_data->>'phone', ''),
      'full_name', coalesce(pa.full_name, t.name, u.raw_user_meta_data->>'full_name', ''),
      'created_at', u.created_at,
      'must_change_pw', coalesce(pa.must_change_password, false)
    ) as row_order
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.parent_accounts pa on pa.id = u.id
    left join public.teachers t on t.auth_user_id = u.id
    where
      p_school_id is null
      or (p.role <> 'parent' and p.school_id = p_school_id)
      or (p.role = 'parent' and pa.school_id = p_school_id)
    order by
      case p.role
        when 'super_admin' then 0
        when 'school_admin' then 1
        when 'teacher' then 2
        when 'parent' then 3
        else 4
      end,
      u.created_at desc
  ) sub;

  return result;
end;
$$;
