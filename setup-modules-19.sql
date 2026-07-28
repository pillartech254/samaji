-- ============================================================
--  Samaji — MIGRATION 19: Opening balances (fee arrears carried
--  over from a school's previous system at onboarding).
--
--  A student's total fee balance is (current fee structures billed)
--  + opening_balance − (all fee_payments to date). opening_balance is
--  a one-time, per-student snapshot set during migration — it is not
--  tied to a specific term, and is never modified automatically.
--
--  Safe to run multiple times. Run AFTER setup.sql + modules 2-18.
-- ============================================================

alter table students add column if not exists opening_balance numeric not null default 0;
alter table students add column if not exists opening_balance_note text;
