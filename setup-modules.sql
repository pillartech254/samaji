-- ============================================================
--  Scholaris — MODULE DATA tables (run AFTER setup.sql)
--  Real per-school data for the working school-portal modules.
--  Every table is school-scoped and protected by RLS:
--    - school_admin: full CRUD on their own school's rows
--    - super_admin : read-only across all schools
--  Supabase → SQL Editor → New query → paste → Run.
-- ============================================================

-- ---------- STUDENTS / SIS ----------------------------------
create table if not exists students (
  id             uuid primary key default gen_random_uuid(),
  school_id      text not null references schools(id) on delete cascade,
  admission_no   text,
  first_name     text not null,
  last_name      text not null,
  grade          text,                       -- e.g. 'Grade 5', 'Form 2'
  gender         text,                        -- 'M' | 'F' | other
  guardian_name  text,
  guardian_phone text,
  status         text not null default 'active',  -- active | inactive | alumni
  created_at     timestamptz not null default now()
);
create index if not exists students_school_idx on students(school_id);

-- ---------- ATTENDANCE --------------------------------------
create table if not exists attendance (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  on_date    date not null default current_date,
  status     text not null default 'present',  -- present | absent | late
  created_at timestamptz not null default now(),
  unique (student_id, on_date)                  -- one mark per student per day (upsertable)
);
create index if not exists attendance_school_date_idx on attendance(school_id, on_date);

-- ---------- GRADEBOOK ---------------------------------------
create table if not exists grades (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  subject    text not null,
  term       text not null default 'Term 1',
  score      numeric not null check (score >= 0 and score <= 100),
  created_at timestamptz not null default now(),
  unique (student_id, subject, term)            -- one score per subject/term (upsertable)
);
create index if not exists grades_school_idx on grades(school_id);

-- ---------- FEES / INVOICING --------------------------------
create table if not exists fee_invoices (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  title      text not null,                   -- 'Term 1 Tuition'
  amount     integer not null,                -- whole currency units
  paid       boolean not null default false,
  due_date   date,
  created_at timestamptz not null default now()
);
create index if not exists fees_school_idx on fee_invoices(school_id);

-- ---------- ROW-LEVEL SECURITY ------------------------------
alter table students     enable row level security;
alter table attendance   enable row level security;
alter table grades       enable row level security;
alter table fee_invoices enable row level security;

-- helper macro pattern: own school for school_admin, read-all for super_admin
-- STUDENTS
drop policy if exists p_students_rw on students;
create policy p_students_rw on students for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_students_super on students;
create policy p_students_super on students for select to authenticated
  using (is_super_admin());

-- ATTENDANCE
drop policy if exists p_att_rw on attendance;
create policy p_att_rw on attendance for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_att_super on attendance;
create policy p_att_super on attendance for select to authenticated
  using (is_super_admin());

-- GRADES
drop policy if exists p_grades_rw on grades;
create policy p_grades_rw on grades for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_grades_super on grades;
create policy p_grades_super on grades for select to authenticated
  using (is_super_admin());

-- FEES
drop policy if exists p_fees_rw on fee_invoices;
create policy p_fees_rw on fee_invoices for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_fees_super on fee_invoices;
create policy p_fees_super on fee_invoices for select to authenticated
  using (is_super_admin());

-- ---------- SEED a few students for Greenwood (demo) --------
insert into students (school_id, admission_no, first_name, last_name, grade, gender, guardian_name, guardian_phone) values
  ('SCH-10428','GRN-001','Aisha','Mohammed','Grade 6','F','Fatuma Mohammed','+254700111222'),
  ('SCH-10428','GRN-002','Brian','Otieno','Grade 6','M','Joseph Otieno','+254700333444'),
  ('SCH-10428','GRN-003','Catherine','Wanjiru','Grade 5','F','Mary Wanjiru','+254700555666'),
  ('SCH-10428','GRN-004','David','Kiprono','Grade 5','M','Samuel Kiprono','+254700777888'),
  ('SCH-10428','GRN-005','Esther','Achieng','Grade 4','F','Grace Achieng','+254700999000')
on conflict do nothing;

-- A couple of demo fee invoices
insert into fee_invoices (school_id, student_id, title, amount, paid, due_date)
  select school_id, id, 'Term 1 Tuition', 15000, false, current_date + 14
  from students where school_id = 'SCH-10428'
on conflict do nothing;
