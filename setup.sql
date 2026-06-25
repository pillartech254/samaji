-- ============================================================
--  Scholaris — Module Licensing : full backend setup
--  Run this ONCE in Supabase → SQL Editor → New query → Run.
--  Creates tables, security, the flag resolver, and seed data.
-- ============================================================

-- ---------- 1. CORE TABLES ----------------------------------
create table if not exists modules (
  id            text primary key,
  key           text unique not null,            -- the feature flag, e.g. module.payroll
  name          text not null,
  tier          text not null check (tier in ('core','standard','advanced')),
  addon_only    boolean not null default false,
  metered       boolean not null default false,
  monthly_price integer not null default 0,
  active        boolean not null default true
);

create table if not exists packages (
  id            text primary key,
  name          text not null,
  type          text not null check (type in ('standard','custom')),
  price         integer not null,
  student_limit integer not null,
  version       integer not null default 1,
  active        boolean not null default true
);

create table if not exists package_modules (
  package_id text references packages(id) on delete cascade,
  module_id  text references modules(id)  on delete cascade,
  primary key (package_id, module_id)
);

create table if not exists schools (
  id        text primary key,
  name      text not null,
  subdomain text unique not null,
  region    text,
  status    text not null default 'active'
);

create table if not exists subscriptions (
  id             text primary key,
  school_id      text not null references schools(id),
  package_id     text not null references packages(id),
  status         text not null default 'active',
  student_limit  integer,
  billing_cycle  text not null default 'monthly'
);

create table if not exists subscription_addons (
  subscription_id text references subscriptions(id) on delete cascade,
  module_id       text references modules(id),
  price           integer not null,
  added_at        timestamptz not null default now(),
  primary key (subscription_id, module_id)
);

create table if not exists feature_overrides (
  id         bigserial primary key,
  school_id  text not null references schools(id),
  flag_key   text not null,
  effect     text not null check (effect in ('grant','trial','revoke')),
  expires_at timestamptz,
  reason     text,
  created_at timestamptz not null default now()
);

-- ---------- 2. USER PROFILES (links Supabase Auth to roles) --
create table if not exists profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  role      text not null default 'super_admin',   -- super_admin | billing_admin | support | school_admin
  school_id text references schools(id)             -- set for school_admin only
);

-- auto-create a profile when a user signs up (demo: makes them super_admin)
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role) values (new.id, 'super_admin')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- 3. PERMISSION HELPERS ---------------------------
-- security definer => these bypass RLS so policies don't recurse.
-- `set search_path = public` is REQUIRED: without it a definer function may
-- fail to resolve the profiles table, which makes every RLS policy throw and
-- the app shows "No schools visible".
create or replace function is_super_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin');
$$;

create or replace function my_school()
returns text language sql stable security definer
set search_path = public as $$
  select school_id from profiles where id = auth.uid();
$$;

grant execute on function is_super_admin() to authenticated;
grant execute on function my_school()    to authenticated;

-- ---------- 4. ROW-LEVEL SECURITY ---------------------------
alter table profiles            enable row level security;
alter table modules             enable row level security;
alter table packages            enable row level security;
alter table package_modules     enable row level security;
alter table schools             enable row level security;
alter table subscriptions       enable row level security;
alter table subscription_addons enable row level security;
alter table feature_overrides   enable row level security;

-- profiles: read your own
drop policy if exists p_profiles_self on profiles;
create policy p_profiles_self on profiles
  for select to authenticated using (id = auth.uid());

-- reference data: any signed-in user may read
drop policy if exists p_modules_read on modules;
create policy p_modules_read on modules for select to authenticated using (true);
drop policy if exists p_packages_read on packages;
create policy p_packages_read on packages for select to authenticated using (true);
drop policy if exists p_pkgmod_read on package_modules;
create policy p_pkgmod_read on package_modules for select to authenticated using (true);

-- school-scoped data: super admins see all, school admins see their own
drop policy if exists p_schools_read on schools;
create policy p_schools_read on schools for select to authenticated
  using (is_super_admin() or id = my_school());

drop policy if exists p_subs_read on subscriptions;
create policy p_subs_read on subscriptions for select to authenticated
  using (is_super_admin() or school_id = my_school());

drop policy if exists p_addons_read on subscription_addons;
create policy p_addons_read on subscription_addons for select to authenticated
  using (is_super_admin());

drop policy if exists p_ovr_read on feature_overrides;
create policy p_ovr_read on feature_overrides for select to authenticated
  using (is_super_admin() or school_id = my_school());

-- super admins may write the licensing tables
drop policy if exists p_subs_write on subscriptions;
create policy p_subs_write on subscriptions for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists p_addons_write on subscription_addons;
create policy p_addons_write on subscription_addons for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists p_ovr_write on feature_overrides;
create policy p_ovr_write on feature_overrides for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 5. THE RESOLVER (this is the whole point) -------
-- Merges core + package + add-ons + overrides into one flag set.
-- security definer so a school_admin can resolve their own flags.
create or replace function resolve_flags(p_school text)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  result jsonb := '{}'::jsonb;
  r record;
  sub subscriptions%rowtype;
begin
  -- 1 default deny, 2 core always on
  for r in select key, tier from modules where active loop
    result := result || jsonb_build_object(r.key, r.tier = 'core');
  end loop;

  select * into sub from subscriptions
    where school_id = p_school and status <> 'cancelled' limit 1;

  if sub.id is not null then
    -- 3 package bundle
    for r in select mo.key from package_modules pm
             join modules mo on mo.id = pm.module_id
             where pm.package_id = sub.package_id loop
      result := result || jsonb_build_object(r.key, true);
    end loop;
    -- 4 add-ons (union)
    for r in select mo.key from subscription_addons sa
             join modules mo on mo.id = sa.module_id
             where sa.subscription_id = sub.id loop
      result := result || jsonb_build_object(r.key, true);
    end loop;
  end if;

  -- 5 grants/trials, 6 revoke wins (later rows override earlier)
  for r in select flag_key, effect from feature_overrides
           where school_id = p_school
             and (expires_at is null or expires_at > now())
           order by created_at loop
    result := result || jsonb_build_object(r.flag_key, r.effect <> 'revoke');
  end loop;

  return result;
end; $$;

-- ---------- 6. SEED DATA ------------------------------------
insert into modules (id,key,name,tier,addon_only,metered,monthly_price) values
  ('students','module.students','Students / SIS','core',false,false,0),
  ('attendance','module.attendance','Attendance','core',false,false,0),
  ('academics','module.academics','Academics & Gradebook','core',false,false,0),
  ('messaging','module.messaging','Communications','core',false,false,0),
  ('finance','module.finance','Fees & Invoicing','standard',false,false,25),
  ('exams','module.exams','Exams & Assessments','standard',false,false,20),
  ('timetable','module.timetable','Timetable','standard',false,false,15),
  ('library','module.library','Library','standard',false,false,18),
  ('transport','module.transport','Transport','standard',false,false,22),
  ('payroll','module.payroll','Payroll','advanced',true,false,40),
  ('sms','module.sms','SMS Gateway','advanced',true,true,30),
  ('biometric','module.biometric','Biometric Access','advanced',true,false,35),
  ('analytics','module.analytics','Analytics Pro','advanced',true,false,45),
  ('api','module.api','API & Webhooks','advanced',true,false,25)
on conflict (id) do nothing;

insert into packages (id,name,type,price,student_limit) values
  ('starter','Starter','standard',49,500),
  ('pro','Pro','standard',149,1000),
  ('premium','Premium','standard',299,3000),
  ('custom','Custom','custom',0,5000)
on conflict (id) do nothing;

insert into package_modules (package_id,module_id) values
  ('pro','finance'),('pro','exams'),('pro','timetable'),
  ('premium','finance'),('premium','exams'),('premium','timetable'),
  ('premium','library'),('premium','transport')
on conflict do nothing;

insert into schools (id,name,subdomain,region) values
  ('SCH-10428','Greenwood International','greenwood','Nairobi, KE'),
  ('SCH-10550','Hillcrest School','hillcrest','Accra, GH')
on conflict (id) do nothing;

insert into subscriptions (id,school_id,package_id,status,billing_cycle) values
  ('sub_greenwood','SCH-10428','pro','active','monthly'),
  ('sub_hillcrest','SCH-10550','starter','active','monthly')
on conflict (id) do nothing;

insert into subscription_addons (subscription_id,module_id,price) values
  ('sub_greenwood','sms',30),
  ('sub_greenwood','payroll',40),
  ('sub_greenwood','library',18)
on conflict do nothing;

insert into feature_overrides (school_id,flag_key,effect,expires_at,reason) values
  ('SCH-10428','module.analytics','trial', now() + interval '14 days','Evaluation trial')
on conflict do nothing;

-- ---------- 7. ROLE GRANTS (REQUIRED) -----------------------
-- Tables created in the SQL editor are owned by `postgres`; the API roles
-- (`authenticated`/`anon`) get NO privileges by default, so every request
-- returns HTTP 403 "permission denied for table". RLS only filters rows AFTER
-- the role already has table access — these grants provide that access.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Future tables (e.g. from the setup-modules-*.sql files) inherit these grants
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- Verify it works:  select resolve_flags('SCH-10428');
