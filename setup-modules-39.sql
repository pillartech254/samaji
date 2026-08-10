-- ============================================================
-- setup-modules-39.sql
-- Library module overhaul: librarian portal login, lending
-- lifecycle (days-borrowed → auto due date, lost-book tracking),
-- and an independent lost-book charges ledger that is surfaced
-- to parents but deliberately kept OUT of fee_structures/fee_items
-- (per explicit product requirement — library fines are not part
-- of the termly fee structure).
-- Run AFTER setup-modules-38.sql. Safe to run multiple times.
-- ============================================================

-- ---------- 1. LIBRARY_BOOKS — replacement cost + shelf location --
alter table library_books add column if not exists replacement_cost numeric not null default 0;
alter table library_books add column if not exists shelf_location   text;

-- ---------- 2. LIBRARY_LOANS — lending lifecycle -------------------
-- class_at_borrow: snapshot of the student's class at issue time, so
-- the loan record stays historically accurate after a promotion.
-- days_allowed: what the librarian enters; due_date is computed from
-- it in the application layer (borrowed_at + days_allowed) rather
-- than picked by hand, per the "input days borrowed, system
-- calculates return date" requirement.
-- status replaces the old returned_at-only state (active/returned/
-- lost) so a lost book can be distinguished from one still out.
alter table library_loans add column if not exists class_at_borrow text;
alter table library_loans add column if not exists days_allowed   integer not null default 14;
alter table library_loans add column if not exists status         text not null default 'active';
alter table library_loans add column if not exists lost_at        date;
alter table library_loans add column if not exists lost_charge    numeric;
alter table library_loans add column if not exists issued_by      uuid references auth.users(id) on delete set null;
alter table library_loans add column if not exists returned_by    uuid references auth.users(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'library_loans_status_check') then
    alter table library_loans add constraint library_loans_status_check
      check (status in ('active','returned','lost'));
  end if;
end $$;

-- Backfill status for rows written before this column existed.
update library_loans set status = 'returned' where returned_at is not null and status = 'active';

create index if not exists library_loans_status_idx on library_loans(status);
create index if not exists library_loans_student_idx on library_loans(student_id);

-- ---------- 3. LIBRARY_CHARGES — independent lost-book ledger ------
-- Deliberately its own table, NOT a fee_items/fee_structures row:
-- a lost-book surcharge is a library fine, not part of the termly
-- fee structure, and must read as its own, separate line to both
-- admins and parents.
create table if not exists library_charges (
  id          uuid primary key default gen_random_uuid(),
  school_id   text not null references schools(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  loan_id     uuid references library_loans(id) on delete set null,
  book_title  text not null,
  amount      numeric not null check (amount >= 0),
  reason      text not null default 'Lost book',
  status      text not null default 'unpaid' check (status in ('unpaid','paid','waived')),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index if not exists library_charges_school_idx on library_charges(school_id);
create index if not exists library_charges_student_idx on library_charges(student_id);

alter table library_charges enable row level security;

-- ---------- 4. LIBRARIAN ROLE HELPER --------------------------------
-- Mirrors is_school_admin()'s allow-list shape (setup-modules-22.sql):
-- a librarian is a distinct, lower-trust role — explicitly NOT
-- included in is_school_admin(), so it stays locked out of every
-- table gated by that function (payroll, staff, teachers, exams,
-- report cards, mpesa/kcb config, etc.) without touching any of
-- those policies.
create or replace function is_librarian()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and school_id is not null and role = 'librarian');
$$;
grant execute on function is_librarian() to authenticated;

-- ---------- 5. RLS — library_books ----------------------------------
-- Whole school may browse the catalogue (parents/teachers included —
-- it's just a title list); only school_admin/librarian may write.
drop policy if exists p_books_rw on library_books;
drop policy if exists p_books_super on library_books;
drop policy if exists p_books_read on library_books;
drop policy if exists p_books_write on library_books;

create policy p_books_read on library_books for select to authenticated
  using (is_super_admin() or school_id = my_school());

create policy p_books_write on library_books for all to authenticated
  using (is_super_admin() or (school_id = my_school() and (is_school_admin() or is_librarian())))
  with check (is_super_admin() or (school_id = my_school() and (is_school_admin() or is_librarian())));

-- ---------- 6. RLS — library_loans ----------------------------------
drop policy if exists p_loans_rw on library_loans;
drop policy if exists p_loans_super on library_loans;
drop policy if exists p_loans_write on library_loans;
drop policy if exists p_loans_parent_read on library_loans;

create policy p_loans_write on library_loans for all to authenticated
  using (is_super_admin() or (school_id = my_school() and (is_school_admin() or is_librarian())))
  with check (is_super_admin() or (school_id = my_school() and (is_school_admin() or is_librarian())));

-- Parent: read loans for their own children only (same join pattern
-- as p_feepay_parent in setup-modules-11.sql).
create policy p_loans_parent_read on library_loans for select to authenticated
  using (
    exists (
      select 1 from students s
      join parent_accounts pa on pa.phone = s.guardian_phone and pa.school_id = s.school_id
      where s.id = library_loans.student_id and pa.id = auth.uid()
    )
  );

-- ---------- 7. RLS — library_charges ---------------------------------
create policy p_charges_write on library_charges for all to authenticated
  using (is_super_admin() or (school_id = my_school() and (is_school_admin() or is_librarian())))
  with check (is_super_admin() or (school_id = my_school() and (is_school_admin() or is_librarian())));

create policy p_charges_parent_read on library_charges for select to authenticated
  using (
    exists (
      select 1 from students s
      join parent_accounts pa on pa.phone = s.guardian_phone and pa.school_id = s.school_id
      where s.id = library_charges.student_id and pa.id = auth.uid()
    )
  );

-- ---------- 8. GRANTS (idempotent) ------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ---------- 9. HOW TO CREATE A LIBRARIAN LOGIN -------------------------
-- No new account-creation function needed: admin_create_user() /
-- admin-users Edge Function (setup-modules-11.sql) already accepts
-- an arbitrary p_role — go to Admin console → Users → + New user,
-- pick "Librarian" from the Role dropdown, and set their school.
-- They then sign in at /librarian/ with that email + password.

-- Verify:
--   select id, title, replacement_cost, shelf_location from library_books limit 5;
--   select id, status, days_allowed, class_at_borrow, lost_charge from library_loans order by created_at desc limit 5;
--   select * from library_charges order by created_at desc limit 5;
