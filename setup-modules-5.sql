-- ============================================================
--  Scholaris — MODULE DATA, part 5 : Payroll
--  Staff + monthly payroll runs with Kenyan statutory deductions.
--  Run AFTER the previous setup files.
-- ============================================================

create table if not exists staff (
  id           uuid primary key default gen_random_uuid(),
  school_id    text not null references schools(id) on delete cascade,
  full_name    text not null,
  role         text,
  kra_pin      text,
  phone        text,
  basic_salary integer not null default 0,
  allowances   integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists staff_school_idx on staff(school_id);

create table if not exists payroll_runs (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  period     text not null,                 -- 'YYYY-MM'
  status     text not null default 'draft', -- draft | finalized
  created_at timestamptz not null default now(),
  unique (school_id, period)
);
create index if not exists payroll_runs_school_idx on payroll_runs(school_id);

create table if not exists payslips (
  id            uuid primary key default gen_random_uuid(),
  school_id     text not null references schools(id) on delete cascade,
  run_id        uuid not null references payroll_runs(id) on delete cascade,
  staff_id      uuid not null references staff(id) on delete cascade,
  basic         integer not null default 0,
  allowances    integer not null default 0,
  gross         integer not null default 0,
  paye          integer not null default 0,
  nssf          integer not null default 0,
  shif          integer not null default 0,
  housing_levy  integer not null default 0,
  net           integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists payslips_run_idx on payslips(run_id);

-- RLS
alter table staff        enable row level security;
alter table payroll_runs enable row level security;
alter table payslips     enable row level security;

drop policy if exists p_staff_rw on staff;
create policy p_staff_rw on staff for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_staff_super on staff;
create policy p_staff_super on staff for select to authenticated using (is_super_admin());

drop policy if exists p_pruns_rw on payroll_runs;
create policy p_pruns_rw on payroll_runs for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_pruns_super on payroll_runs;
create policy p_pruns_super on payroll_runs for select to authenticated using (is_super_admin());

drop policy if exists p_pslips_rw on payslips;
create policy p_pslips_rw on payslips for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_pslips_super on payslips;
create policy p_pslips_super on payslips for select to authenticated using (is_super_admin());

-- Seed a few staff for Greenwood
insert into staff (school_id, full_name, role, kra_pin, phone, basic_salary, allowances) values
  ('SCH-10428','Amina Otieno','Head Teacher','A001234567X','+254700111000',95000,25000),
  ('SCH-10428','Joseph Mwangi','Senior Teacher','A002345678Y','+254700222000',62000,12000),
  ('SCH-10428','Grace Akinyi','Teacher','A003456789Z','+254700333000',48000,8000),
  ('SCH-10428','Peter Kamau','Bursar','A004567890W','+254700444000',55000,10000)
on conflict do nothing;
