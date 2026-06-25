-- ============================================================
--  Scholaris — MODULE DATA, part 2 : Exams + Library
--  Run AFTER setup.sql and setup-modules.sql.
--  Supabase → SQL Editor → New query → paste → Run.
-- ============================================================

-- ---------- EXAMS -------------------------------------------
create table if not exists exams (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  name       text not null,                 -- 'Mid-Term Exam'
  subject    text not null,
  term       text not null default 'Term 1',
  max_score  integer not null default 100,
  exam_date  date,
  created_at timestamptz not null default now()
);
create index if not exists exams_school_idx on exams(school_id);

create table if not exists exam_results (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  exam_id    uuid not null references exams(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  score      numeric not null check (score >= 0),
  created_at timestamptz not null default now(),
  unique (exam_id, student_id)              -- one result per student per exam (upsertable)
);
create index if not exists exam_results_exam_idx on exam_results(exam_id);

-- ---------- LIBRARY -----------------------------------------
create table if not exists library_books (
  id               uuid primary key default gen_random_uuid(),
  school_id        text not null references schools(id) on delete cascade,
  title            text not null,
  author           text,
  isbn             text,
  category         text,
  copies_total     integer not null default 1,
  copies_available integer not null default 1,
  created_at       timestamptz not null default now()
);
create index if not exists library_books_school_idx on library_books(school_id);

create table if not exists library_loans (
  id          uuid primary key default gen_random_uuid(),
  school_id   text not null references schools(id) on delete cascade,
  book_id     uuid not null references library_books(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  borrowed_at date not null default current_date,
  due_date    date,
  returned_at date,
  created_at  timestamptz not null default now()
);
create index if not exists library_loans_school_idx on library_loans(school_id);

-- ---------- ROW-LEVEL SECURITY ------------------------------
alter table exams         enable row level security;
alter table exam_results  enable row level security;
alter table library_books enable row level security;
alter table library_loans enable row level security;

drop policy if exists p_exams_rw on exams;
create policy p_exams_rw on exams for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_exams_super on exams;
create policy p_exams_super on exams for select to authenticated using (is_super_admin());

drop policy if exists p_exres_rw on exam_results;
create policy p_exres_rw on exam_results for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_exres_super on exam_results;
create policy p_exres_super on exam_results for select to authenticated using (is_super_admin());

drop policy if exists p_books_rw on library_books;
create policy p_books_rw on library_books for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_books_super on library_books;
create policy p_books_super on library_books for select to authenticated using (is_super_admin());

drop policy if exists p_loans_rw on library_loans;
create policy p_loans_rw on library_loans for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_loans_super on library_loans;
create policy p_loans_super on library_loans for select to authenticated using (is_super_admin());

-- ---------- SEED a few books for Greenwood ------------------
insert into library_books (school_id, title, author, isbn, category, copies_total, copies_available) values
  ('SCH-10428','Things Fall Apart','Chinua Achebe','9780385474542','Fiction',4,4),
  ('SCH-10428','The River and the Source','Margaret Ogola','9789966466264','Fiction',3,3),
  ('SCH-10428','Introductory Mathematics','KLB','9789966254012','Textbook',6,6),
  ('SCH-10428','Biology Form 2','KLB','9789966254500','Textbook',5,5)
on conflict do nothing;
