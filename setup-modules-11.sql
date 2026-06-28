-- ============================================================
--  Samaji — MIGRATION 11 : Parent portal, M-Pesa integration,
--  school backups, admin user management functions.
--  Run AFTER all previous setup files.
-- ============================================================

-- ---------- 1. PARENT ACCOUNTS (links auth users to students via phone) --
create table if not exists parent_accounts (
  id         uuid primary key references auth.users(id) on delete cascade,
  school_id  text not null references schools(id) on delete cascade,
  phone      text not null,
  full_name  text,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists parent_accounts_school_idx on parent_accounts(school_id);
create index if not exists parent_accounts_phone_idx on parent_accounts(phone);

-- ---------- 2. M-PESA CONFIG (per school) --------------------
create table if not exists mpesa_config (
  school_id       text primary key references schools(id) on delete cascade,
  shortcode       text not null,
  passkey         text not null,
  consumer_key    text not null,
  consumer_secret text not null,
  callback_url    text,
  environment     text not null default 'sandbox',
  updated_at      timestamptz not null default now()
);

-- ---------- 3. M-PESA TRANSACTIONS --------------------------
create table if not exists mpesa_transactions (
  id                   uuid primary key default gen_random_uuid(),
  school_id            text not null references schools(id) on delete cascade,
  parent_id            uuid references auth.users(id),
  phone                text not null,
  amount               numeric not null,
  student_ids          text[],
  checkout_request_id  text,
  merchant_request_id  text,
  mpesa_receipt_no     text,
  result_code          integer,
  result_desc          text,
  status               text not null default 'pending',
  created_at           timestamptz not null default now()
);
create index if not exists mpesa_tx_school_idx on mpesa_transactions(school_id);
create index if not exists mpesa_tx_checkout_idx on mpesa_transactions(checkout_request_id);

-- ---------- 4. SCHOOL BACKUPS --------------------------------
create table if not exists school_backups (
  id              uuid primary key default gen_random_uuid(),
  school_id       text not null references schools(id) on delete cascade,
  backup_data     jsonb not null,
  tables_included text[] not null,
  note            text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index if not exists school_backups_school_idx on school_backups(school_id);

-- ---------- 5. RLS ------------------------------------------
alter table parent_accounts    enable row level security;
alter table mpesa_config       enable row level security;
alter table mpesa_transactions enable row level security;
alter table school_backups     enable row level security;

-- Parent accounts: super admin full access, parents see own row
drop policy if exists p_pa_super on parent_accounts;
create policy p_pa_super on parent_accounts for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists p_pa_self on parent_accounts;
create policy p_pa_self on parent_accounts for select to authenticated
  using (id = auth.uid());

-- M-Pesa config: super admin only
drop policy if exists p_mpesa_cfg on mpesa_config;
create policy p_mpesa_cfg on mpesa_config for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- M-Pesa transactions: super admin + school admin + own parent
drop policy if exists p_mpesa_tx_super on mpesa_transactions;
create policy p_mpesa_tx_super on mpesa_transactions for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists p_mpesa_tx_school on mpesa_transactions;
create policy p_mpesa_tx_school on mpesa_transactions for select to authenticated
  using (school_id = my_school());

drop policy if exists p_mpesa_tx_parent on mpesa_transactions;
create policy p_mpesa_tx_parent on mpesa_transactions for select to authenticated
  using (parent_id = auth.uid());

-- School backups: super admin only
drop policy if exists p_backups_rw on school_backups;
create policy p_backups_rw on school_backups for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 6. ADMIN USER MANAGEMENT FUNCTIONS ---------------

-- Create a user account (parent or school_admin)
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
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_id, 'authenticated', 'authenticated', p_email,
    crypt(p_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', coalesce(p_full_name, ''), 'phone', coalesce(p_phone, ''))
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    created_at, updated_at
  ) values (
    gen_random_uuid(), new_id,
    jsonb_build_object('sub', new_id::text, 'email', p_email),
    'email', new_id::text,
    now(), now()
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

-- Reset a user's password
create or replace function admin_reset_password(
  p_user_id uuid,
  p_new_password text
) returns void
language plpgsql security definer
set search_path = public, auth, extensions
as $$
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;
end;
$$;

-- Delete a user account
create or replace function admin_delete_user(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public, auth, extensions
as $$
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

-- List users for a school (or all if null)
create or replace function admin_list_users(p_school_id text default null)
returns table(user_id uuid, email text, role text, school_id text, phone text, full_name text, created_at timestamptz, must_change_pw boolean)
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

  return query
    select
      u.id as user_id,
      u.email,
      p.role,
      p.school_id,
      pa.phone,
      pa.full_name,
      u.created_at,
      coalesce(pa.must_change_password, false) as must_change_pw
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.parent_accounts pa on pa.id = u.id
    where (p_school_id is null or p.school_id = p_school_id)
    order by u.created_at desc;
end;
$$;

-- Parent: change own password and clear must_change flag
create or replace function parent_change_password(p_new_password text)
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
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  where id = auth.uid();

  update parent_accounts
  set must_change_password = false
  where id = auth.uid();
end;
$$;

-- Add school (super admin)
create or replace function admin_add_school(
  p_id text,
  p_name text,
  p_subdomain text,
  p_region text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

  insert into schools (id, name, subdomain, region, status)
  values (p_id, p_name, p_subdomain, coalesce(p_region, ''), 'active');

  insert into subscriptions (id, school_id, package_id, status, billing_cycle)
  values ('sub_' || lower(replace(p_id, '-', '_')), p_id, 'starter', 'active', 'monthly');
end;
$$;

-- Super admin: allow writing to schools table
drop policy if exists p_schools_write on schools;
create policy p_schools_write on schools for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- Parent: read students linked by guardian_phone
drop policy if exists p_students_parent on students;
create policy p_students_parent on students for select to authenticated
  using (
    exists (
      select 1 from parent_accounts pa
      where pa.id = auth.uid()
        and pa.school_id = students.school_id
        and pa.phone = students.guardian_phone
    )
  );

-- Parent: read fee payments for their children
drop policy if exists p_feepay_parent on fee_payments;
create policy p_feepay_parent on fee_payments for select to authenticated
  using (
    exists (
      select 1 from students s
      join parent_accounts pa on pa.phone = s.guardian_phone and pa.school_id = s.school_id
      where s.id = fee_payments.student_id and pa.id = auth.uid()
    )
  );

-- Parent: read fee structures for their children's school
drop policy if exists p_feestr_parent on fee_structures;
create policy p_feestr_parent on fee_structures for select to authenticated
  using (
    exists (
      select 1 from parent_accounts pa
      where pa.id = auth.uid() and pa.school_id = fee_structures.school_id
    )
  );

drop policy if exists p_feeitems_parent on fee_items;
create policy p_feeitems_parent on fee_items for select to authenticated
  using (
    exists (
      select 1 from fee_structures fs
      join parent_accounts pa on pa.school_id = fs.school_id
      where fs.id = fee_items.structure_id and pa.id = auth.uid()
    )
  );

-- Parent: read school info
-- (p_schools_read already allows if id = my_school(), and parent profile has school_id)

-- Parent: read announcements for their school
drop policy if exists p_ann_parent on announcements;
create policy p_ann_parent on announcements for select to authenticated
  using (
    exists (
      select 1 from parent_accounts pa
      where pa.id = auth.uid() and pa.school_id = announcements.school_id
    )
    and (audience = 'all' or audience = 'parents')
  );

-- M-Pesa: parent can insert transactions (to initiate payment)
drop policy if exists p_mpesa_tx_parent_insert on mpesa_transactions;
create policy p_mpesa_tx_parent_insert on mpesa_transactions for insert to authenticated
  with check (parent_id = auth.uid());

-- ---------- 7. GRANTS ----------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
