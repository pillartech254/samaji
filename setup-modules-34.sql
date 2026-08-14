-- ============================================================
--  Samaji — MIGRATION 34 : missing indexes on genuinely hot,
--  currently-unindexed filter paths. NOT a blanket "index every
--  column" pass — the schema already has 57 indexes (mostly
--  school_id FKs) plus several implicit ones from unique
--  constraints (mark_sheets, exams, report_cards, report_remarks
--  all already get a usable composite index for free that way).
--  These are the specific gaps an audit of every .eq/.in/.order
--  call site in the app turned up, cross-checked against what
--  already exists:
--
--   - subscriptions(school_id) and feature_overrides(school_id,
--     created_at): resolve_flags() — called on EVERY portal login,
--     every portal — runs "where school_id = ..." against both and
--     neither had an index at all.
--   - fee_structures(school_id): loaded on every School Portal login
--     via SamajiCache.preload, and on most Fees screens.
--   - students(school_id, class_id): every class roster, marks-entry
--     grid and report-card generation filters students by both.
--   - students(guardian_phone): joined against parent_accounts.phone
--     in the Parent Portal's row-level security policies (students,
--     attendance, fee_payments) — evaluated per row on every query a
--     parent makes, so this one doubles as an RLS speedup.
--   - class_subject_teachers(teacher_id): loadMyAssignments() runs
--     this on every Teacher Portal screen (dashboard, attendance,
--     grading, report books all call it).
--   - staff(teacher_id) and payslips(staff_id): the "My Payroll" tab
--     looks itself up by these on every visit.
--
--  Safe to run multiple times. Run AFTER setup-modules-33.sql.
-- ============================================================

create index if not exists subscriptions_school_idx on subscriptions(school_id);
create index if not exists feature_overrides_school_idx on feature_overrides(school_id, created_at);
create index if not exists fee_structures_school_idx on fee_structures(school_id);
create index if not exists students_school_class_idx on students(school_id, class_id);
create index if not exists students_guardian_phone_idx on students(guardian_phone) where guardian_phone is not null;
create index if not exists class_subject_teachers_teacher_idx on class_subject_teachers(teacher_id);
create index if not exists staff_teacher_idx on staff(teacher_id) where teacher_id is not null;
create index if not exists payslips_staff_idx on payslips(staff_id);

-- ---------- GRANTS (idempotent) --------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Verify:
--   select indexname from pg_indexes where tablename in
--     ('subscriptions','feature_overrides','fee_structures','students',
--      'class_subject_teachers','staff','payslips') order by tablename;
--   explain analyze select * from subscriptions where school_id='SCH-10428' and status<>'cancelled' limit 1;
