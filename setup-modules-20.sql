-- ============================================================
--  Samaji — MIGRATION 20: Indexing pass for query patterns the
--  app actually uses, beyond the school_id indexes already in
--  place from earlier migrations.
--
--  Note: most of this app's reads fetch a whole school_id-scoped
--  table once and filter/sort client-side (see SamajiCache in
--  assets/school-plus.js), so school_id — already indexed on
--  every school-scoped table — is the index that matters most
--  for day-to-day page loads. These four cover the remaining
--  query shapes that don't fit that pattern: per-student lookups
--  across a whole table, and one server-side ORDER BY.
--
--  Safe to run multiple times. Run AFTER setup-modules-19.sql.
-- ============================================================

-- Report cards / transcripts pull every result for one student
-- across many exams — only exam_id was indexed before this.
create index if not exists exam_results_student_idx on exam_results(student_id);

-- Parent portal's attendance history: .in("student_id", ids).gte("on_date", ...)
-- — the existing (school_id, on_date) index doesn't serve a per-student filter.
create index if not exists attendance_student_date_idx on attendance(student_id, on_date desc);

-- Receipts list is the one place payments are sorted server-side
-- (.order("paid_at", {ascending:false})) rather than in the browser.
create index if not exists fee_payments_school_paidat_idx on fee_payments(school_id, paid_at desc);

-- Admission number is the natural lookup key for CSV/opening-balance
-- imports and any future direct API/webhook lookups.
create index if not exists students_admission_no_idx on students(admission_no) where admission_no is not null;
