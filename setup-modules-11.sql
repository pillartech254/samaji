-- ============================================================
--  Samaji — MIGRATION 11 : Teacher portal login + Payroll v2
--  (loans/advances as deductions, allowance breakdown, P9 data)
--  Safe to run multiple times. Run AFTER setup-modules-10.sql.
-- ============================================================

-- ---------- 1. LINK THE TEACHER DIRECTORY TO A LOGIN ---------
-- A teacher signs up on /teacher/ with the SAME email an admin
-- entered in Settings → Teachers. handle_new_user() (below) then
-- auto-attaches their new auth account to that directory row and
-- gives them the 'teacher' role instead of the demo 'super_admin'.
alter table teachers add column if not exists auth_user_id uuid references auth.users(id);
create unique index if not exists teachers_auth_user_uidx on teachers(auth_user_id) where auth_user_id is not null;

-- ---------- 2. LINK PAYROLL (staff) TO THE TEACHER DIRECTORY --
-- staff = payroll roster (covers non-teaching staff too — bursars,
-- head teachers, etc. — so payroll identity fields live here, not on
-- the lightweight teachers directory). teacher_id is set only when the
-- payroll row belongs to someone who also has a teacher-portal login.
-- The flat "allowances" figure is split into named lines so the
-- payslip can mimic a TSC payslip; kra_pin/role already existed.
alter table staff add column if not exists teacher_id          uuid references teachers(id) on delete set null;
alter table staff add column if not exists house_allowance     integer not null default 0;
alter table staff add column if not exists transport_allowance integer not null default 0;
alter table staff add column if not exists id_no               text;
alter table staff add column if not exists payroll_no          text;  -- TSC/employee no.
alter table staff add column if not exists station             text;
create unique index if not exists staff_teacher_uidx on staff(teacher_id) where teacher_id is not null;

-- ---------- 3. LOANS & SALARY ADVANCES ------------------------
-- Recorded once; a fixed installment is deducted from every payroll
-- run until the balance reaches zero (then status flips to completed).
create table if not exists staff_deductions (
  id             uuid primary key default gen_random_uuid(),
  school_id      text not null references schools(id) on delete cascade,
  staff_id       uuid not null references staff(id) on delete cascade,
  kind           text not null default 'advance' check (kind in ('advance','loan')),
  description    text,
  principal      integer not null default 0,
  monthly_amount integer not null default 0,
  balance        integer not null default 0,
  status         text not null default 'active' check (status in ('active','completed','cancelled')),
  created_at     timestamptz not null default now()
);
create index if not exists staff_deductions_staff_idx on staff_deductions(staff_id);

-- ---------- 4. PAYSLIP BREAKDOWN + HISTORY --------------------
-- house/transport allowance broken out (TSC-style line items) and the
-- exact loan/advance lines applied that run, frozen at generation time
-- so later edits to a loan don't rewrite history.
alter table payslips add column if not exists house_allowance     integer not null default 0;
alter table payslips add column if not exists transport_allowance integer not null default 0;
alter table payslips add column if not exists deductions_other    integer not null default 0;
alter table payslips add column if not exists deduction_lines     jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payslips_run_staff_uniq') then
    alter table payslips add constraint payslips_run_staff_uniq unique (run_id, staff_id);
  end if;
end $$;

-- ---------- 5. AUTO-LINK NEW SIGN-UPS TO A TEACHER RECORD -----
-- Overrides the demo trigger from setup.sql: if the email being
-- signed up matches an unclaimed teachers.email, the new account
-- becomes that teacher (role='teacher', their school) instead of
-- the default super_admin demo path.
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  t teachers%rowtype;
begin
  select * into t from teachers
    where auth_user_id is null and email is not null and lower(email) = lower(new.email)
    limit 1;
  if t.id is not null then
    insert into public.profiles (id, role, school_id) values (new.id, 'teacher', t.school_id)
      on conflict (id) do update set role = 'teacher', school_id = t.school_id;
    update teachers set auth_user_id = new.id where id = t.id;
  else
    insert into public.profiles (id, role) values (new.id, 'super_admin')
      on conflict (id) do nothing;
  end if;
  return new;
end; $$;

-- ---------- 6. ROLE HELPER ------------------------------------
-- Deliberately NOT "role = 'school_admin'": some existing admin
-- accounts were set up as 'super_admin' with a school_id attached
-- (the original handle_new_user() default), and both must keep full
-- access exactly as before. 'teacher' is the only new, lower-trust
-- role this migration introduces, so it's the only one excluded here.
create or replace function is_school_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and school_id is not null and role <> 'teacher');
$$;
grant execute on function is_school_admin() to authenticated;

-- ---------- 7. RLS — payroll becomes admin-write / self-read --
-- (previously any authenticated user in the school could read/write
-- every payslip; that was fine while only school_admin logged in, but
-- the teacher portal now brings a lower-trust role into the same
-- school, so payroll must be scoped: admins manage it, a teacher may
-- only ever see their own linked payslips/deductions.)
alter table staff_deductions enable row level security;

drop policy if exists p_teachers_rw on teachers;
drop policy if exists p_teachers_admin_rw on teachers;
create policy p_teachers_admin_rw on teachers for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_teachers_self_read on teachers;
create policy p_teachers_self_read on teachers for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists p_staff_rw on staff;
drop policy if exists p_staff_super on staff;
drop policy if exists p_staff_admin_rw on staff;
create policy p_staff_admin_rw on staff for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_staff_self_read on staff;
create policy p_staff_self_read on staff for select to authenticated
  using (teacher_id in (select id from teachers where auth_user_id = auth.uid()));

drop policy if exists p_pruns_rw on payroll_runs;
drop policy if exists p_pruns_super on payroll_runs;
drop policy if exists p_pruns_admin_rw on payroll_runs;
create policy p_pruns_admin_rw on payroll_runs for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_pruns_read on payroll_runs;
create policy p_pruns_read on payroll_runs for select to authenticated
  using (school_id = my_school());  -- period/status only, no salary figures

drop policy if exists p_pslips_rw on payslips;
drop policy if exists p_pslips_super on payslips;
drop policy if exists p_pslips_admin_rw on payslips;
create policy p_pslips_admin_rw on payslips for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_pslips_self_read on payslips;
create policy p_pslips_self_read on payslips for select to authenticated
  using (staff_id in (select s.id from staff s join teachers t on t.id = s.teacher_id where t.auth_user_id = auth.uid()));

drop policy if exists p_sded_admin_rw on staff_deductions;
create policy p_sded_admin_rw on staff_deductions for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_sded_self_read on staff_deductions;
create policy p_sded_self_read on staff_deductions for select to authenticated
  using (staff_id in (select s.id from staff s join teachers t on t.id = s.teacher_id where t.auth_user_id = auth.uid()));

-- ---------- 8. GRANTS (idempotent) ----------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ---------- 9. EXISTING school_admin ACCOUNTS ------------------
-- Older demo profiles were created as 'super_admin' by the original
-- handle_new_user() trigger even when meant to run a single school.
-- If you already have a school_admin, no action needed — this
-- migration only changes behaviour for NEW sign-ups.

-- To make one of your existing teachers.email rows loggable in
-- immediately without waiting for them to sign up fresh, have them
-- sign up on /teacher/ with that exact email — the trigger above
-- claims the match automatically.

-- Verify:
--   select id, name, email, auth_user_id from teachers where school_id='SCH-10428';
--   select id, staff_id, kind, balance, status from staff_deductions;
