-- ============================================================
--  Samaji — MIGRATION 10 : Subjects catalog, teacher directory,
--  and per-class subject + teacher assignment.
--  Once a class is created, an admin assigns which subjects it
--  takes and which teacher teaches each subject — this feeds the
--  Timetable (subject/teacher pickers) and any future module that
--  needs to know "who teaches what, to which class".
--  Safe to run multiple times. Run AFTER setup-modules-9.sql.
-- ============================================================

-- ---------- 1. SUBJECTS CATALOG (per school) ----------------
create table if not exists subjects (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  name       text not null,
  code       text,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create index if not exists subjects_school_idx on subjects(school_id);

-- ---------- 2. TEACHER DIRECTORY -----------------------------
-- A lightweight staff list (not tied to auth/login) admins maintain
-- so the same teacher can be picked across multiple classes/subjects.
create table if not exists teachers (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  created_at timestamptz not null default now()
);
create index if not exists teachers_school_idx on teachers(school_id);

-- ---------- 3. SUBJECTS ASSIGNED TO A CLASS ------------------
create table if not exists class_subjects (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references school_classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, subject_id)
);
create index if not exists class_subjects_class_idx on class_subjects(class_id);

-- ---------- 4. TEACHER ASSIGNED TO A CLASS+SUBJECT -----------
create table if not exists class_subject_teachers (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references school_classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, subject_id)              -- one teacher per class+subject
);
create index if not exists class_subject_teachers_class_idx on class_subject_teachers(class_id);

-- ---------- 5. RLS --------------------------------------------
alter table subjects              enable row level security;
alter table teachers              enable row level security;
alter table class_subjects        enable row level security;
alter table class_subject_teachers enable row level security;

do $$
declare t text;
begin
  foreach t in array array['subjects','teachers'] loop
    execute format('drop policy if exists p_%1$s_rw on %1$s;', t);
    execute format(
      'create policy p_%1$s_rw on %1$s for all to authenticated using (is_super_admin() or school_id = my_school()) with check (is_super_admin() or school_id = my_school());', t);
  end loop;
end $$;

-- class_subjects / class_subject_teachers join through school_classes
drop policy if exists p_class_subjects_rw on class_subjects;
create policy p_class_subjects_rw on class_subjects for all to authenticated
  using (exists (select 1 from school_classes c where c.id = class_id and (is_super_admin() or c.school_id = my_school())))
  with check (exists (select 1 from school_classes c where c.id = class_id and (is_super_admin() or c.school_id = my_school())));

drop policy if exists p_cst_rw on class_subject_teachers;
create policy p_cst_rw on class_subject_teachers for all to authenticated
  using (exists (select 1 from school_classes c where c.id = class_id and (is_super_admin() or c.school_id = my_school())))
  with check (exists (select 1 from school_classes c where c.id = class_id and (is_super_admin() or c.school_id = my_school())));

-- ---------- 6. GRANTS (idempotent) ----------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- 7. SEED: common subjects for Greenwood (demo) -----
insert into subjects (school_id, name, code) values
  ('SCH-10428','Mathematics','MATH'),
  ('SCH-10428','English','ENG'),
  ('SCH-10428','Kiswahili','KIS'),
  ('SCH-10428','Science','SCI'),
  ('SCH-10428','Social Studies','SST'),
  ('SCH-10428','Religious Education','CRE')
on conflict (school_id, name) do nothing;

-- Verify: select * from subjects where school_id='SCH-10428';
