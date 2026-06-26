-- ============================================================
--  Samaji — MIGRATION 9 : fee-collection guardrails + bus
--  transport toggle on payments.
--  Safe to run multiple times. Run AFTER setup-modules-8.sql.
-- ============================================================

-- Idempotency key set by the client when a "Collect payment" form is
-- opened. A double-click (or a retried request) reuses the same key, so
-- the unique index below rejects the second insert as a duplicate
-- instead of recording the fee twice.
alter table fee_payments add column if not exists client_ref text;
create unique index if not exists fee_payments_client_ref_uidx
  on fee_payments(school_id, client_ref) where client_ref is not null;

-- Bus transport included in this particular payment (so receipts and
-- reports can show it separately from tuition/boarding items).
alter table fee_payments add column if not exists includes_transport boolean not null default false;
alter table fee_payments add column if not exists transport_amount   numeric not null default 0;
