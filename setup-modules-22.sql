-- ============================================================
--  Samaji — MIGRATION 22 : SECOND SECURITY FIX, found while
--  continuing the audit after setup-modules-21.sql.
--  Run this immediately too — see commit message for full impact.
--  Safe to run multiple times. Run AFTER setup-modules-21.sql.
-- ============================================================

-- is_school_admin() (setup-modules-14.sql) was defined as a deny-list:
--   role <> 'teacher'  (plus school_id is not null)
-- Every policy that uses it is written as
--   is_super_admin() or (school_id = my_school() and is_school_admin())
-- so is_school_admin() was only ever meant to mean "this specific
-- school's admin". But a parent account also gets school_id set on
-- their profile (role='parent'), and 'parent' <> 'teacher' — so the
-- deny-list let parents through too.
--
-- Impact: any parent, via a direct API call (not through the Parent
-- Portal UI, which doesn't expose this — but RLS, not the UI, is the
-- real boundary), could read AND write: payslips and staff_deductions
-- (real salary/loan figures for every staff member at their child's
-- school), the staff and teachers directories, payroll_runs,
-- mark_sheets, report_cards (including forging a child's official
-- report card), learner_ratings, report_remarks, academic_years,
-- terms, assessment_types, and grading_schemes/grading_levels.
--
-- Fix: switch to an allow-list of exactly the role this was meant to
-- cover. super_admin doesn't need to be listed here — every one of the
-- ~10 policies above already checks is_super_admin() separately via OR.
create or replace function is_school_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and school_id is not null and role = 'school_admin');
$$;

-- ---------- Audit query: run separately, review before trusting -------
-- Any fee_payments/mark_sheets/report_cards/staff/payslips row whose
-- created_at (or updated_at, where present) doesn't line up with normal
-- admin usage patterns is worth a second look, but there's no reliable
-- automated way to tell "a parent's legitimate admin-permitted action"
-- from "exploited the bug" after the fact from data alone — this bug
-- didn't leave a distinct marker the way the super_admin one did. If
-- you have Supabase database/API logs retained, cross-referencing
-- writes to these tables against parent_accounts user ids is the more
-- reliable check.
