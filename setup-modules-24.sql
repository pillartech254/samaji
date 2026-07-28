-- ============================================================
--  Samaji — MIGRATION 24 : FOURTH SECURITY FIX, same audit,
--  same class of bug as setup-modules-23.sql — this time on the
--  fee-collection tables. This is the most damaging one: any
--  parent or teacher could INSERT a fake fee_payments row making
--  their own balance (or anyone else's) look paid without paying,
--  or edit/delete fee_structures to zero out what their child is
--  billed, using nothing but their normal login and a direct API
--  call — the Parent/Teacher Portal UIs don't expose this, but
--  RLS, not the UI, is what actually decides what's allowed.
--
--  school_classes, dormitories, fee_structures, fee_payments,
--  fee_items, and receipt_counters (setup-modules-8.sql) all used
--  "is_super_admin() or school_id = my_school()" with no
--  is_school_admin() check — identical shape to the bug fixed in
--  setup-modules-23.sql, just introduced in a different migration
--  file so it didn't show up in that same sweep.
--
--  Checked parent/index.html: it only ever SELECTs these six
--  tables, never writes them (M-Pesa payments are written by the
--  mpesa-stk edge function using the service-role key, which
--  bypasses RLS entirely — unaffected by this change either way).
--  Pre-existing narrower parent-read policies (p_feestr_parent,
--  p_feeitems_parent, p_feepay_parent from setup-modules-11.sql)
--  already cover parent read access to fee data correctly and are
--  untouched by this migration — only the overly-broad policy that
--  made them pointless is being replaced.
--
--  Safe to run multiple times. Run AFTER setup-modules-23.sql.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['school_classes','dormitories','fee_structures','fee_payments'] loop
    execute format('drop policy if exists p_%1$s_all on %1$s;', t);
    execute format('drop policy if exists p_%1$s_admin_all on %1$s;', t);
    execute format(
      'create policy p_%1$s_admin_all on %1$s for all to authenticated
         using (is_super_admin() or (school_id = my_school() and is_school_admin()))
         with check (is_super_admin() or (school_id = my_school() and is_school_admin()));', t);
  end loop;
end $$;

-- fee_items joins through its structure's school (no direct school_id column)
drop policy if exists p_fee_items_all on fee_items;
drop policy if exists p_fee_items_admin_all on fee_items;
create policy p_fee_items_admin_all on fee_items for all to authenticated
  using (exists (select 1 from fee_structures s where s.id = structure_id
    and (is_super_admin() or (s.school_id = my_school() and is_school_admin()))))
  with check (exists (select 1 from fee_structures s where s.id = structure_id
    and (is_super_admin() or (s.school_id = my_school() and is_school_admin()))));

-- receipt_counters is only ever touched by next_receipt_no(), a
-- security-definer function that bypasses RLS — admin-only here is
-- pure defense in depth, nothing legitimate reads this table directly.
drop policy if exists p_receipt_counters_all on receipt_counters;
drop policy if exists p_receipt_counters_admin_all on receipt_counters;
create policy p_receipt_counters_admin_all on receipt_counters for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));

-- school_classes / dormitories: Parent Portal reads these for basic
-- reference data (grade levels, dorm names) — add back open read
-- so that keeps working now that the admin policy no longer covers it.
drop policy if exists p_school_classes_read on school_classes;
create policy p_school_classes_read on school_classes for select to authenticated
  using (school_id = my_school());
drop policy if exists p_dormitories_read on dormitories;
create policy p_dormitories_read on dormitories for select to authenticated
  using (school_id = my_school());
