-- ============================================================
--  Samaji — MIGRATION 38 : fix parent-portal data silently
--  disappearing when a guardian's phone number is stored in a
--  different format than their portal login's phone number, plus a
--  related pre-existing access-control gap this testing surfaced.
--
--  Reported directly: a parent (logged in, account working, other
--  children/data visible) had a payment made for one of their
--  children, and NOTHING for that child showed anywhere in their
--  portal — not the payment, not attendance, nothing. The account
--  wasn't broken and the payment wasn't lost; the two records were
--  just never actually linked at the database level, even though
--  they looked linked everywhere a human would check.
--
--  Root cause: students.guardian_phone and parent_accounts.phone
--  are BOTH stored exactly as typed, with zero normalization,
--  wherever they're entered (school-plus.js's add/edit student form
--  and CSV import for the first; admin/index.html's Add User form
--  for the second). The SAME real phone number can end up stored as
--  "0712345678" in one column and "+254712345678" (or
--  "254712345678", or with spaces) in the other, depending on
--  nothing more than how two different people happened to type it
--  on two different days.
--
--  The client already knows this and handles it: parent/index.html's
--  own loadChildren() runs a sanitizePhone() normalizer over BOTH
--  values before comparing them client-side, specifically so format
--  differences like this don't matter. But that normalization only
--  covers the initial `select * from students` call — every
--  RLS policy gating what a parent can actually READ (students,
--  fee_payments, attendance) does a raw `pa.phone = s.guardian_phone`
--  string comparison, with no normalization at all. Postgres RLS
--  fails CLOSED and SILENT: a row that doesn't match is just never
--  returned, with no error anywhere in the chain — so a genuine
--  guardian, correctly linked in every way a school admin would
--  check by eye, sees nothing for that child, and there's no
--  exception or log entry pointing at why.
--
--  PART A fixes that: normalize_phone() — the SQL-side twin of
--  parent/index.html's own sanitizePhone(), same two rules in the
--  same order (strip everything but digits; a resulting 10-digit
--  number starting with "0" becomes "254" + the other 9 digits) —
--  used on BOTH sides of the three affected policies (students,
--  fee_payments, attendance) instead of raw equality. Existing
--  stored values are untouched; this only changes how they're
--  COMPARED, so there's no data migration and no risk of changing
--  what's displayed anywhere.
--
--  PART B is a second, DIFFERENT bug this testing caught, not
--  something Part A introduces. Testing Part A properly meant
--  checking not just "does the right parent now see the right
--  child" but "does an unrelated parent still see nothing" — and
--  that check failed, for a reason unrelated to phone formatting.
--  See Part B's own comment below for the full explanation and fix.
--
--  What this migration does NOT do: the "school_id = my_school()
--  with no role check" pattern Part B fixes for students turns out
--  to appear on 30+ policies across this schema (a lot of them look
--  superseded by later, more specific policies, some maybe not —
--  not verified either way here). Auditing which of those are still
--  live and whether each one should exclude parents is real,
--  separate work deserving its own careful pass and its own tests,
--  not something to rush through opportunistically while fixing an
--  unrelated reported bug. This migration only touches the three
--  tables actually reachable from the parent portal's own client
--  code (students, fee_payments, attendance) — verified with RLS
--  actually enforced, not just checking policy text.
--
--  Safe to run multiple times. Run AFTER setup-modules-37.sql.
-- ============================================================

create or replace function normalize_phone(p text)
returns text
language sql immutable
as $$
  select case
    when length(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g')) = 10
         and left(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 1) = '0'
    then '254' || substring(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') from 2)
    else regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g')
  end;
$$;

-- normalize_phone() is IMMUTABLE, so it can back a real index — without
-- this, every parent-portal page load would force a sequential scan
-- (recomputing the normalization for every student row in the school)
-- instead of an index lookup.
create index if not exists students_guardian_phone_norm_idx
  on students (normalize_phone(guardian_phone));
create index if not exists parent_accounts_phone_norm_idx
  on parent_accounts (normalize_phone(phone));

-- ---------- students: parent read, by normalized phone -----------------
drop policy if exists p_students_parent on students;
create policy p_students_parent on students for select to authenticated
  using (
    exists (
      select 1 from parent_accounts pa
      where pa.id = auth.uid()
        and pa.school_id = students.school_id
        and normalize_phone(pa.phone) = normalize_phone(students.guardian_phone)
    )
  );

-- ---------- fee_payments: parent read, by normalized phone --------------
drop policy if exists p_feepay_parent on fee_payments;
create policy p_feepay_parent on fee_payments for select to authenticated
  using (
    exists (
      select 1 from students s
      join parent_accounts pa
        on normalize_phone(pa.phone) = normalize_phone(s.guardian_phone)
        and pa.school_id = s.school_id
      where s.id = fee_payments.student_id and pa.id = auth.uid()
    )
  );

-- ---------- attendance: parent read, by normalized phone ----------------
drop policy if exists p_att_parent_read on attendance;
create policy p_att_parent_read on attendance for select to authenticated
  using (
    exists (
      select 1 from students s
      join parent_accounts pa
        on normalize_phone(pa.phone) = normalize_phone(s.guardian_phone)
        and pa.school_id = s.school_id
      where s.id = attendance.student_id and pa.id = auth.uid()
    )
  );

-- ============================================================
--  PART B — a pre-existing gap this testing surfaced, not
--  something introduced by Part A above.
--
--  Testing Part A properly meant checking not just "does the right
--  parent now see the right child" but "does an UNRELATED parent
--  still see nothing" — and that second check failed, for a reason
--  that has nothing to do with phone-number formatting. students has
--  its own blanket read policy (p_students_read, setup-modules-
--  23.sql), scoped only to school_id = my_school() with no role
--  check at all — meaning it applies to every authenticated role in
--  the school, parents included, and grants full visibility into
--  every student's record: name, admission number, class, medical
--  notes, blood group, guardian contact details, all of it. The
--  narrower, guardian-phone-scoped p_students_parent policy sitting
--  right next to it never actually restricted anything for the
--  students table specifically, because Postgres RLS policies are
--  additive — a row is visible if ANY policy permits it — so the
--  broader policy already granted full access regardless of what the
--  narrower one said.
--
--  The comment already sitting above p_students_read in
--  setup-modules-23.sql ("parent's own-children read already exists
--  as p_students_parent, separate from and in addition to this
--  broader school-wide read") shows this was never the intent — the
--  author believed the two policies worked together to restrict
--  parents to their own children, when in practice the broader one
--  silently made the narrower one a no-op for that role. fee_payments
--  and attendance don't have this problem: their own admin-catchall
--  policies gate on is_school_admin(), which correctly excludes
--  parents, confirmed by TEST 4 below passing for those two tables
--  while it caught this one.
--
--  Fixed by excluding the parent role from the blanket policy, the
--  same way fee_payments/attendance's admin policies already
--  naturally exclude it via is_school_admin() — parents are now
--  governed exclusively by p_students_parent, as the original
--  comment already assumed was happening.
-- ============================================================

create or replace function is_parent()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'parent');
$$;
grant execute on function is_parent() to authenticated;

drop policy if exists p_students_read on students;
create policy p_students_read on students for select to authenticated
  using (school_id = my_school() and not is_parent());
