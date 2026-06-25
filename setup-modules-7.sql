-- ============================================================
--  Scholaris — MODULE DATA, part 7 : Biometric + API/Webhooks
--  Completes all 14 modules. Run AFTER the previous setup files.
-- ============================================================

-- ---------- BIOMETRIC ---------------------------------------
create table if not exists biometric_devices (
  id          uuid primary key default gen_random_uuid(),
  school_id   text not null references schools(id) on delete cascade,
  name        text not null,
  location    text,
  device_type text default 'fingerprint',   -- fingerprint | rfid | face
  serial      text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists biometric_devices_school_idx on biometric_devices(school_id);

create table if not exists biometric_enrollments (
  id          uuid primary key default gen_random_uuid(),
  school_id   text not null references schools(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (student_id)
);

-- ---------- API & WEBHOOKS ----------------------------------
create table if not exists api_keys (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  name       text not null,
  token      text not null,                 -- demo: store hashed in production
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_school_idx on api_keys(school_id);

create table if not exists webhooks (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  url        text not null,
  event      text not null default 'student.created',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists webhooks_school_idx on webhooks(school_id);

-- RLS
alter table biometric_devices     enable row level security;
alter table biometric_enrollments enable row level security;
alter table api_keys              enable row level security;
alter table webhooks              enable row level security;

drop policy if exists p_biodev_rw on biometric_devices;
create policy p_biodev_rw on biometric_devices for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_biodev_super on biometric_devices;
create policy p_biodev_super on biometric_devices for select to authenticated using (is_super_admin());

drop policy if exists p_bioenr_rw on biometric_enrollments;
create policy p_bioenr_rw on biometric_enrollments for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_bioenr_super on biometric_enrollments;
create policy p_bioenr_super on biometric_enrollments for select to authenticated using (is_super_admin());

drop policy if exists p_apikeys_rw on api_keys;
create policy p_apikeys_rw on api_keys for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_apikeys_super on api_keys;
create policy p_apikeys_super on api_keys for select to authenticated using (is_super_admin());

drop policy if exists p_webhooks_rw on webhooks;
create policy p_webhooks_rw on webhooks for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_webhooks_super on webhooks;
create policy p_webhooks_super on webhooks for select to authenticated using (is_super_admin());

-- Seed one device for Greenwood
insert into biometric_devices (school_id, name, location, device_type, serial) values
  ('SCH-10428','Main Gate Scanner','Main Gate','fingerprint','ZK-7700-0012')
on conflict do nothing;
