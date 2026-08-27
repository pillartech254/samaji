-- ============================================================
--  Samaji — MIGRATION 39 : let parents read their own children's
--  PUBLISHED report cards — the feature gap behind "even exams
--  shows nothing" (there was no Parent Portal view for this at
--  all), plus the same access-control gap found on students in
--  setup-modules-38.sql, this time on report_cards.
--
--  report_cards is the right table for this, not exams/mark_sheets/
--  exam_results directly: it's the frozen, publish-gated snapshot
--  ("Only a Principal/Deputy Principal may generate/publish" per
--  setup-modules-18.sql's own p_report_cards_publisher_rw) — a row
--  existing in this table IS the "this has been published" signal.
--  Parents seeing raw, in-progress marks before a teacher/principal
--  has actually finalized and published them would undermine that
--  model entirely, so this migration does NOT touch exams,
--  mark_sheets, or exam_results — parents get exactly what the
--  school has chosen to publish, nothing earlier.
--
--  p_report_cards_read (setup-modules-18.sql) has the identical
--  shape to the students-table bug fixed in Part B of
--  setup-modules-38.sql: `school_id = my_school()` with no role
--  check, so it already applies to every authenticated role
--  including parent — granting every parent in a school read access
--  to every published report card for every student there, not just
--  their own child's. Fixed the same way: excluded via is_parent()
--  (added in setup-modules-38.sql), with a dedicated policy scoped
--  through the same normalize_phone()-based guardian match used for
--  students/fee_payments/attendance there.
--
--  Safe to run multiple times. Run AFTER setup-modules-38.sql.
-- ============================================================

drop policy if exists p_report_cards_read on report_cards;
create policy p_report_cards_read on report_cards for select to authenticated
  using (school_id = my_school() and not is_parent());

drop policy if exists p_report_cards_parent on report_cards;
create policy p_report_cards_parent on report_cards for select to authenticated
  using (
    exists (
      select 1 from students s
      join parent_accounts pa
        on normalize_phone(pa.phone) = normalize_phone(s.guardian_phone)
        and pa.school_id = s.school_id
      where s.id = report_cards.student_id and pa.id = auth.uid()
    )
  );
