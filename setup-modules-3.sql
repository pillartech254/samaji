-- ============================================================
--  Scholaris — MODULE DATA, part 3 : Timetable + Communications
--  Run AFTER setup.sql, setup-modules.sql, setup-modules-2.sql.
-- ============================================================

-- ---------- TIMETABLE ---------------------------------------
create table if not exists timetable_slots (
  id          uuid primary key default gen_random_uuid(),
  school_id   text not null references schools(id) on delete cascade,
  grade       text not null,                 -- the class, e.g. 'Grade 6'
  day_of_week integer not null check (day_of_week between 1 and 5),  -- 1=Mon .. 5=Fri
  period      integer not null check (period between 1 and 8),
  subject     text not null,
  teacher     text,
  created_at  timestamptz not null default now(),
  unique (school_id, grade, day_of_week, period)
);
create index if not exists timetable_school_grade_idx on timetable_slots(school_id, grade);

-- ---------- COMMUNICATIONS ----------------------------------
create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  title      text not null,
  body       text,
  audience   text not null default 'all',     -- all | parents | teachers | students
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists announcements_school_idx on announcements(school_id, created_at desc);

-- ---------- ROW-LEVEL SECURITY ------------------------------
alter table timetable_slots enable row level security;
alter table announcements   enable row level security;

drop policy if exists p_tt_rw on timetable_slots;
create policy p_tt_rw on timetable_slots for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_tt_super on timetable_slots;
create policy p_tt_super on timetable_slots for select to authenticated using (is_super_admin());

drop policy if exists p_ann_rw on announcements;
create policy p_ann_rw on announcements for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_ann_super on announcements;
create policy p_ann_super on announcements for select to authenticated using (is_super_admin());

-- ---------- SEED a welcome announcement ---------------------
insert into announcements (school_id, title, body, audience, created_by) values
  ('SCH-10428','Term 1 reopening','School reopens Monday 6th. Buses run as usual.','all','system')
on conflict do nothing;
