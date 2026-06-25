-- ============================================================
--  Scholaris — MODULE DATA, part 4 : Transport
--  (Analytics needs NO new tables — it reads existing module data.)
--  Run AFTER the previous setup files.
-- ============================================================

create table if not exists transport_routes (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  name       text not null,
  fare       integer not null default 0,
  stops      text,
  created_at timestamptz not null default now()
);
create index if not exists transport_routes_school_idx on transport_routes(school_id);

create table if not exists transport_vehicles (
  id           uuid primary key default gen_random_uuid(),
  school_id    text not null references schools(id) on delete cascade,
  reg_no       text not null,
  capacity     integer,
  driver_name  text,
  driver_phone text,
  route_id     uuid references transport_routes(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists transport_vehicles_school_idx on transport_vehicles(school_id);

create table if not exists transport_assignments (
  id          uuid primary key default gen_random_uuid(),
  school_id   text not null references schools(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  route_id    uuid not null references transport_routes(id) on delete cascade,
  pickup_stop text,
  created_at  timestamptz not null default now(),
  unique (student_id)                          -- one route per student (upsertable)
);
create index if not exists transport_assignments_school_idx on transport_assignments(school_id);

-- RLS
alter table transport_routes      enable row level security;
alter table transport_vehicles    enable row level security;
alter table transport_assignments enable row level security;

drop policy if exists p_troutes_rw on transport_routes;
create policy p_troutes_rw on transport_routes for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_troutes_super on transport_routes;
create policy p_troutes_super on transport_routes for select to authenticated using (is_super_admin());

drop policy if exists p_tveh_rw on transport_vehicles;
create policy p_tveh_rw on transport_vehicles for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_tveh_super on transport_vehicles;
create policy p_tveh_super on transport_vehicles for select to authenticated using (is_super_admin());

drop policy if exists p_tassign_rw on transport_assignments;
create policy p_tassign_rw on transport_assignments for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_tassign_super on transport_assignments;
create policy p_tassign_super on transport_assignments for select to authenticated using (is_super_admin());

-- Seed a couple of routes + a vehicle for Greenwood (ready when Transport is enabled)
insert into transport_routes (school_id, name, fare, stops) values
  ('SCH-10428','Route A — Westlands',3500,'Westlands, Parklands, Ngara'),
  ('SCH-10428','Route B — South B',4000,'South B, South C, Nairobi West')
on conflict do nothing;
