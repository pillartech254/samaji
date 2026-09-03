-- ============================================================
--  Samaji — MIGRATION 47 : fix read access to schools,
--  class_subject_teachers, school_classes, academic_years,
--  dormitories, and terms for multi-school parents
--
--  Reported directly, with screenshots, right after multi-school
--  parent support shipped: the school switcher listed both schools
--  correctly and switching to the second one worked — but switching
--  BACK to the first (SCH-10428) showed "This school's account is
--  currently unavailable," even though the school is active and
--  perfectly readable in every other context.
--
--  Root cause: migration 46 correctly fixed every RLS policy that
--  reads through parent_accounts (students, fee_payments, attendance,
--  report_cards, fee_structures, fee_items — all already scoped
--  per-school correctly, no changes needed there, reconfirmed
--  directly against the live policies before writing this migration,
--  not from memory). But six policies were missed because they don't
--  go through parent_accounts at all — they use my_school(), which
--  returns the single profiles.school_id value. Migration 46 itself
--  updates profiles.school_id to whichever school was most recently
--  linked (informational only, exactly as documented in that
--  migration's own header) — so a parent's profiles.school_id only
--  ever points at ONE of their schools. Reading any of these six
--  tables for the OTHER school correctly finds a row, but RLS
--  silently returns nothing, which the Parent Portal's own code
--  (correctly, if the row is genuinely missing) interprets as "this
--  school doesn't exist / isn't active."
--
--  The fix follows the exact same pattern already used everywhere
--  else a parent needs cross-school access: EXISTS against
--  parent_accounts for the specific school being read, additive to
--  the existing my_school()-based access (school_admin/super_admin
--  behavior is completely unchanged).
--
--  mpesa_transactions/kcb_transactions use parent_id = auth.uid()
--  directly (school-independent, no fix needed there). announcements
--  already has its own parent_accounts-based policy alongside the
--  school-scoped one (RLS is additive), so it's already safe too.
--
--  This list came from a full, systematic audit of every table the
--  Parent Portal actually touches — both direct sb.from() calls and
--  the ones routed through window.SamajiCache.get(sb, SCHOOL,
--  "table", ...), a different call shape a from()-only search misses
--  entirely. An earlier draft of this migration claimed that audit
--  was already complete after fixing only schools and
--  class_subject_teachers; re-verifying that claim independently
--  rather than trusting it turned up school_classes, academic_years,
--  dormitories, and terms still broken — worth recording here so the
--  next person (or the next version of this comment) doesn't repeat
--  the same premature "done" claim.
--
--  Run AFTER setup-modules-46.sql. Safe to run multiple times.
-- ============================================================

drop policy if exists p_schools_read on schools;
create policy p_schools_read on schools for select to authenticated
  using (
    is_super_admin()
    or id = my_school()
    or exists (select 1 from parent_accounts pa where pa.id = auth.uid() and pa.school_id = schools.id)
  );

drop policy if exists p_cst_read on class_subject_teachers;
create policy p_cst_read on class_subject_teachers for select to authenticated
  using (
    exists (
      select 1 from school_classes c
      where c.id = class_subject_teachers.class_id
        and (
          c.school_id = my_school()
          or exists (select 1 from parent_accounts pa where pa.id = auth.uid() and pa.school_id = c.school_id)
        )
    )
  );

-- school_classes itself: NOT actually covered by the "every other
-- table checked" claim above when this migration was first written —
-- caught only when independently re-verifying that claim rather than
-- trusting it, by grepping the Parent Portal's own source directly.
-- It queries school_classes for level/stream/curriculum, and that
-- table's own p_school_classes_read policy has the identical
-- my_school()-only restriction as schools and class_subject_teachers
-- did. Same fix, same pattern.
drop policy if exists p_school_classes_read on school_classes;
create policy p_school_classes_read on school_classes for select to authenticated
  using (
    school_id = my_school()
    or exists (select 1 from parent_accounts pa where pa.id = auth.uid() and pa.school_id = school_classes.school_id)
  );

-- academic_years, dormitories, terms: found only by then doing a
-- FULL systematic audit of every table the Parent Portal touches —
-- both direct sb.from() calls and the ones routed through
-- window.SamajiCache.get(sb, SCHOOL, "table", ...), which the first
-- pass's grep missed entirely (a different call shape, not caught by
-- a from()-only search). All three have the identical my_school()-
-- only restriction. announcements was in this same list but is
-- already safe — it has its own p_ann_parent policy alongside the
-- school-scoped one, and RLS policies are additive, so parents
-- already reach it correctly through that separate policy.
drop policy if exists p_academic_years_read on academic_years;
create policy p_academic_years_read on academic_years for select to authenticated
  using (
    school_id = my_school()
    or exists (select 1 from parent_accounts pa where pa.id = auth.uid() and pa.school_id = academic_years.school_id)
  );

drop policy if exists p_dormitories_read on dormitories;
create policy p_dormitories_read on dormitories for select to authenticated
  using (
    school_id = my_school()
    or exists (select 1 from parent_accounts pa where pa.id = auth.uid() and pa.school_id = dormitories.school_id)
  );

drop policy if exists p_terms_read on terms;
create policy p_terms_read on terms for select to authenticated
  using (
    school_id = my_school()
    or exists (select 1 from parent_accounts pa where pa.id = auth.uid() and pa.school_id = terms.school_id)
  );
