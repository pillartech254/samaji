-- ============================================================
--  Samaji — MIGRATION 15 : CBC Assessment Engine, Phase 1
--  Foundational schema only — does not touch exams/exam_results/
--  grades yet (that's Phase 2). Purely additive: safe to run
--  alongside everything that already works.
--
--  Adds:
--   1. academic_years / terms   (normalized; existing free-text
--      "Term 1" strings elsewhere are untouched for now)
--   2. assessment_types          (CAT 1, Project, End Term Exam...)
--   3. grading_schemes / grading_levels (configurable bands, each
--      band can carry a letter grade AND a CBC competency code
--      together, matching how most schools actually print both)
--   4. teachers.school_position  (principal/deputy_principal/dos —
--      a title, NOT a login role; RLS trust is unchanged)
--   5. school_classes.class_teacher_id (per-class, not school-wide)
--  Safe to run multiple times. Run AFTER setup-modules-14.sql.
-- ============================================================

-- ---------- 1. ACADEMIC YEARS & TERMS -------------------------
create table if not exists academic_years (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  year       integer not null,
  status     text not null default 'active' check (status in ('upcoming','active','closed')),
  created_at timestamptz not null default now(),
  unique (school_id, year)
);
create index if not exists academic_years_school_idx on academic_years(school_id);

create table if not exists terms (
  id               uuid primary key default gen_random_uuid(),
  school_id        text not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  name             text not null,               -- 'Term 1' | 'Term 2' | 'Term 3'
  sort             integer not null default 0,
  start_date       date,
  end_date         date,
  status           text not null default 'upcoming' check (status in ('upcoming','active','closed')),
  created_at       timestamptz not null default now(),
  unique (academic_year_id, name)
);
create index if not exists terms_school_idx on terms(school_id);
create index if not exists terms_year_idx on terms(academic_year_id);

-- ---------- 2. ASSESSMENT TYPES -------------------------------
-- Applicable grades stored as a text[] of school_classes.level
-- values (e.g. '{Grade 1,Grade 2}'); null/empty = applies to all.
create table if not exists assessment_types (
  id                  uuid primary key default gen_random_uuid(),
  school_id           text not null references schools(id) on delete cascade,
  name                text not null,             -- 'CAT 1', 'Project', 'End Term Exam'
  max_marks           integer not null default 100,
  weight_percent      numeric not null default 100,   -- this type's share of the final subject score
  contributes_to_final boolean not null default true,
  applicable_grades   text[],
  is_system           boolean not null default false, -- true for the seeded defaults below
  created_at          timestamptz not null default now(),
  unique (school_id, name)
);
create index if not exists assessment_types_school_idx on assessment_types(school_id);

-- ---------- 3. GRADING SCHEMES & LEVELS -----------------------
create table if not exists grading_schemes (
  id                uuid primary key default gen_random_uuid(),
  school_id         text not null references schools(id) on delete cascade,
  name              text not null,               -- 'CBC Standard Scheme'
  is_default        boolean not null default false,
  applicable_grades text[],                      -- null/empty = applies to all
  created_at        timestamptz not null default now(),
  unique (school_id, name)
);
create index if not exists grading_schemes_school_idx on grading_schemes(school_id);

-- A band can carry a letter grade AND a CBC competency code together
-- (most Kenyan report cards print both for the same score range).
create table if not exists grading_levels (
  id               uuid primary key default gen_random_uuid(),
  scheme_id        uuid not null references grading_schemes(id) on delete cascade,
  min_score        numeric not null,
  max_score        numeric not null,
  grade_label      text,                         -- 'A', 'B+', ...
  competency_code  text,                          -- 'EE', 'ME', 'AE', 'BE'
  competency_label text,                          -- 'Exceeding Expectation'
  remark           text,                          -- 'Excellent', 'Good'
  sort             integer not null default 0,
  created_at       timestamptz not null default now(),
  check (max_score >= min_score)
);
create index if not exists grading_levels_scheme_idx on grading_levels(scheme_id);

-- ---------- 4. TEACHER SCHOOL-WIDE POSITION -------------------
-- A title, not a login role — RLS/my_school()/is_school_admin()
-- are completely unchanged. Used only to gate in-app verify/
-- approve/publish actions (wired up in Phase 3). Deliberately no
-- uniqueness constraint: some schools run co-principals or more
-- than one deputy.
alter table teachers add column if not exists school_position text
  check (school_position in ('principal','deputy_principal','dos'));
create index if not exists teachers_position_idx on teachers(school_id, school_position) where school_position is not null;

-- ---------- 5. PER-CLASS CLASS TEACHER ------------------------
alter table school_classes add column if not exists class_teacher_id uuid references teachers(id) on delete set null;
create index if not exists school_classes_teacher_idx on school_classes(class_teacher_id);

-- ---------- 6. ROLE HELPER (for Phase 3's RLS) -----------------
create or replace function my_school_position()
returns text language sql stable security definer
set search_path = public as $$
  select school_position from teachers where auth_user_id = auth.uid() limit 1;
$$;
grant execute on function my_school_position() to authenticated;

-- ---------- 7. RLS ----------------------------------------------
-- Same pattern as the payroll tables: admins get full CRUD for
-- their school; everyone authenticated in the school can READ
-- (teachers need to see assessment types/grading schemes/terms to
-- know what they're scoring against; none of this is sensitive
-- salary-type data, unlike payroll).
alter table academic_years   enable row level security;
alter table terms            enable row level security;
alter table assessment_types enable row level security;
alter table grading_schemes  enable row level security;
alter table grading_levels   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['academic_years','terms','assessment_types','grading_schemes'] loop
    execute format('drop policy if exists p_%1$s_admin_rw on %1$s;', t);
    execute format(
      'create policy p_%1$s_admin_rw on %1$s for all to authenticated
         using (is_super_admin() or (school_id = my_school() and is_school_admin()))
         with check (is_super_admin() or (school_id = my_school() and is_school_admin()));', t);
    execute format('drop policy if exists p_%1$s_read on %1$s;', t);
    execute format('create policy p_%1$s_read on %1$s for select to authenticated using (school_id = my_school());', t);
  end loop;
end $$;

-- grading_levels has no school_id of its own — scope through its scheme.
drop policy if exists p_grading_levels_admin_rw on grading_levels;
create policy p_grading_levels_admin_rw on grading_levels for all to authenticated
  using (exists (select 1 from grading_schemes s where s.id = scheme_id and (is_super_admin() or (s.school_id = my_school() and is_school_admin()))))
  with check (exists (select 1 from grading_schemes s where s.id = scheme_id and (is_super_admin() or (s.school_id = my_school() and is_school_admin()))));
drop policy if exists p_grading_levels_read on grading_levels;
create policy p_grading_levels_read on grading_levels for select to authenticated
  using (exists (select 1 from grading_schemes s where s.id = scheme_id and s.school_id = my_school()));

-- ---------- 8. GRANTS (idempotent) ----------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ---------- 9. SEED: current academic year + terms + CBC ------
--  defaults for Greenwood (demo school) -----------------------
insert into academic_years (school_id, year, status) values
  ('SCH-10428', extract(year from now())::int, 'active')
on conflict (school_id, year) do nothing;

insert into terms (school_id, academic_year_id, name, sort, status)
  select 'SCH-10428', ay.id, t.name, t.sort, case when t.sort = 2 then 'active' else 'upcoming' end
  from academic_years ay, (values ('Term 1',1),('Term 2',2),('Term 3',3)) as t(name, sort)
  where ay.school_id = 'SCH-10428' and ay.year = extract(year from now())::int
on conflict (academic_year_id, name) do nothing;

insert into assessment_types (school_id, name, max_marks, weight_percent, contributes_to_final, is_system) values
  ('SCH-10428','CAT 1',100,20,true,true),
  ('SCH-10428','CAT 2',100,20,true,true),
  ('SCH-10428','Assignment',100,10,true,true),
  ('SCH-10428','Project',100,10,true,true),
  ('SCH-10428','Practical',100,10,true,true),
  ('SCH-10428','Portfolio',100,10,true,true),
  ('SCH-10428','Observation',100,10,true,true),
  ('SCH-10428','Midterm Exam',100,20,true,true),
  ('SCH-10428','End Term Exam',100,50,true,true)
on conflict (school_id, name) do nothing;

insert into grading_schemes (school_id, name, is_default) values
  ('SCH-10428','CBC Standard Scheme', true)
on conflict (school_id, name) do nothing;

insert into grading_levels (scheme_id, min_score, max_score, grade_label, competency_code, competency_label, remark, sort)
  select s.id, v.min_score, v.max_score, v.grade_label, v.competency_code, v.competency_label, v.remark, v.sort
  from grading_schemes s,
    (values
      (80,100,'A','EE','Exceeding Expectation','Excellent',1),
      (60,79, 'B','ME','Meeting Expectation','Good',2),
      (40,59, 'C','AE','Approaching Expectation','Fair',3),
      (0, 39, 'D','BE','Below Expectation','Needs improvement',4)
    ) as v(min_score,max_score,grade_label,competency_code,competency_label,remark,sort)
  where s.school_id = 'SCH-10428' and s.name = 'CBC Standard Scheme'
  and not exists (select 1 from grading_levels gl where gl.scheme_id = s.id);

-- Verify:
--   select * from academic_years where school_id='SCH-10428';
--   select t.name, ay.year from terms t join academic_years ay on ay.id=t.academic_year_id where t.school_id='SCH-10428';
--   select * from assessment_types where school_id='SCH-10428' order by name;
--   select gl.* from grading_levels gl join grading_schemes s on s.id=gl.scheme_id where s.school_id='SCH-10428' order by gl.sort;
