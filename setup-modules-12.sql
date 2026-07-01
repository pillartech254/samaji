-- ============================================================
--  Samaji — MIGRATION 12 : Fix auth.users phone unique constraint
--  The phone column has a unique constraint (users_phone_key).
--  Previous versions set phone = '' for all users, causing
--  duplicate key violations on the second user creation.
--  This migration:
--   1. Sets all empty-string phone values to NULL
--   2. Updates admin_create_user to insert NULL for phone
--  Safe to run multiple times.
-- ============================================================

-- Fix existing users with phone = '' (violates unique constraint on second insert)
update auth.users set phone = null where phone = '';

-- Recreate admin_create_user with phone = null instead of ''
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
  new_id uuid := gen_random_uuid();
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

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
    on conflict (id) do update set phone = p_phone, full_name = p_full_name;
  end if;

  return new_id;
end;
$$;
