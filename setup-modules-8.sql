-- ============================================================
--  Samaji — MIGRATION 8 : Academic setup, richer students,
--  fee structures, payments & receipts.
--  Safe to run multiple times. Run AFTER setup.sql + modules 2-7.
-- ============================================================

-- ---------- 1. CLASSES & STREAMS ----------------------------
create table if not exists school_classes (
  id          uuid primary key default gen_random_uuid(),
  school_id   text not null references schools(id) on delete cascade,
  level       text not null,                 -- 'Grade 6', 'PP1', 'Form 2'
  stream      text,                           -- 'East', 'A', null
  curriculum  text not null default 'CBC',    -- 'CBC' | '8-4-4'
  capacity    int  not null default 40,
  sort        int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (school_id, level, stream)
);
create index if not exists school_classes_school_idx on school_classes(school_id);

-- ---------- 2. DORMITORIES ----------------------------------
create table if not exists dormitories (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  name       text not null,
  gender     text not null default 'Mixed',   -- Boys | Girls | Mixed
  capacity   int  not null default 30,
  captain    text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

-- ---------- 3. RICHER STUDENT BIODATA -----------------------
alter table students add column if not exists class_id        uuid references school_classes(id);
alter table students add column if not exists dormitory_id    uuid references dormitories(id);
alter table students add column if not exists date_of_birth   date;
alter table students add column if not exists admission_date  date;
alter table students add column if not exists residence       text default 'Day';   -- Day | Boarder
alter table students add column if not exists county          text;
alter table students add column if not exists nationality     text default 'Kenyan';
alter table students add column if not exists religion        text;
alter table students add column if not exists blood_group     text;
alter table students add column if not exists medical_notes   text;
alter table students add column if not exists guardian_relation text;
alter table students add column if not exists guardian_email  text;
alter table students add column if not exists photo_url       text;

-- ---------- 4. FEE STRUCTURES & ITEMS -----------------------
create table if not exists fee_structures (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  level      text not null,                  -- applies to all students of this level
  term       text not null,                  -- 'Term 1'
  year       int  not null,
  name       text not null default 'Fee Structure',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, level, term, year)
);

create table if not exists fee_items (
  id           uuid primary key default gen_random_uuid(),
  structure_id uuid not null references fee_structures(id) on delete cascade,
  name         text not null,                -- 'Tuition', 'Boarding', 'Transport'
  amount       numeric not null default 0,
  mandatory    boolean not null default true,
  sort         int not null default 0
);
create index if not exists fee_items_structure_idx on fee_items(structure_id);

-- ---------- 5. PAYMENTS / RECEIPTS --------------------------
create table if not exists fee_payments (
  id          uuid primary key default gen_random_uuid(),
  school_id   text not null references schools(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  receipt_no  text not null,
  amount      numeric not null,
  method      text not null default 'Cash',  -- Cash | M-Pesa | Bank | Cheque | Card
  reference   text,                            -- M-Pesa code / cheque no
  term        text not null,
  year        int  not null,
  note        text,
  received_by text,
  paid_at     timestamptz not null default now(),
  unique (school_id, receipt_no)
);
create index if not exists fee_payments_school_idx on fee_payments(school_id);
create index if not exists fee_payments_student_idx on fee_payments(student_id);

-- Per-school receipt counter (atomic via a function)
create table if not exists receipt_counters (
  school_id text primary key references schools(id) on delete cascade,
  last_no   int not null default 0
);

create or replace function next_receipt_no(p_school text)
returns text language plpgsql security definer
set search_path = public as $$
declare n int;
begin
  insert into receipt_counters (school_id, last_no) values (p_school, 1)
    on conflict (school_id) do update set last_no = receipt_counters.last_no + 1
    returning last_no into n;
  return 'RCT-' || to_char(now(),'YYYY') || '-' || lpad(n::text, 5, '0');
end; $$;

-- ---------- 6. RLS ------------------------------------------
alter table school_classes  enable row level security;
alter table dormitories     enable row level security;
alter table fee_structures  enable row level security;
alter table fee_items       enable row level security;
alter table fee_payments    enable row level security;
alter table receipt_counters enable row level security;

-- school-scoped read+write for that school's admins; super admins see all
do $$
declare t text;
begin
  foreach t in array array['school_classes','dormitories','fee_structures','fee_payments'] loop
    execute format('drop policy if exists p_%1$s_all on %1$s;', t);
    execute format(
      'create policy p_%1$s_all on %1$s for all to authenticated using (is_super_admin() or school_id = my_school()) with check (is_super_admin() or school_id = my_school());', t);
  end loop;
end $$;

-- fee_items joins through its structure's school
drop policy if exists p_fee_items_all on fee_items;
create policy p_fee_items_all on fee_items for all to authenticated
  using (exists (select 1 from fee_structures s where s.id = structure_id and (is_super_admin() or s.school_id = my_school())))
  with check (exists (select 1 from fee_structures s where s.id = structure_id and (is_super_admin() or s.school_id = my_school())));

drop policy if exists p_receipt_counters_all on receipt_counters;
create policy p_receipt_counters_all on receipt_counters for all to authenticated
  using (is_super_admin() or school_id = my_school()) with check (is_super_admin() or school_id = my_school());

-- ---------- 7. GRANTS (idempotent) --------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ---------- 8. SEED: Kenyan CBC curriculum ------------------
-- Populates standard CBC levels for every existing school (no streams yet;
-- admins add streams in Settings). Idempotent via the unique constraint.
do $$
declare s record; lv text; i int := 0;
  levels text[] := array['PP1','PP2','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9'];
begin
  for s in select id from schools loop
    i := 0;
    foreach lv in array levels loop
      insert into school_classes (school_id, level, stream, curriculum, sort)
      values (s.id, lv, null, 'CBC', i)
      on conflict (school_id, level, stream) do nothing;
      i := i + 1;
    end loop;
  end loop;
end $$;

-- Sample dormitories + a Grade 6 fee structure for Greenwood (demo only)
insert into dormitories (school_id, name, gender, capacity, captain) values
  ('SCH-10428','Kilimanjaro','Boys',40,'Mr. Otieno'),
  ('SCH-10428','Serengeti','Girls',40,'Ms. Wanjiru')
on conflict (school_id, name) do nothing;

insert into fee_structures (school_id, level, term, year, name) values
  ('SCH-10428','Grade 6','Term 1', extract(year from now())::int, 'Grade 6 — Term 1')
on conflict (school_id, level, term, year) do nothing;

insert into fee_items (structure_id, name, amount, mandatory, sort)
select fs.id, x.name, x.amount, true, x.sort
from fee_structures fs,
  (values ('Tuition',12000,0),('Activity Fee',1500,1),('Lunch Program',4500,2),('Exam Fee',1000,3)) as x(name,amount,sort)
where fs.school_id='SCH-10428' and fs.level='Grade 6' and fs.term='Term 1'
  and not exists (select 1 from fee_items fi where fi.structure_id = fs.id);

-- Verify:  select level, stream from school_classes where school_id='SCH-10428' order by sort;
