-- ============================================================
--  Samaji — MIGRATION 36 : KCB Buni (WSO2 API Manager) Till/Paybill
--  payment integration — a SECOND, independent payment rail
--  alongside the existing Safaricom Daraja integration
--  (mpesa_config / mpesa_transactions / supabase/functions/mpesa-stk).
--  None of that is touched here — this is purely additive, mirroring
--  its schema/RLS shape so a school can eventually choose either
--  provider (or both).
--
--  Ported over, unmodified, from a separate unmerged branch
--  (claude/grade-three-report-card-hgps9e) where it was originally
--  numbered setup-modules-38.sql. Renumbered to 36 here — it's the
--  next free number in THIS branch's own migration sequence
--  (34: school deletion/dedup, 35: user name editing), and reusing
--  "38" would just recreate the exact collision problem this
--  renumbering exists to avoid: that branch's own 34-39 mean
--  completely different things (indexes, CBC/CBE grading engine)
--  than anything in this sequence. When that branch is eventually
--  merged too, whoever reconciles the two sequences needs to treat
--  THIS file as the canonical copy of the KCB migration and drop the
--  other branch's now-duplicate setup-modules-38.sql rather than
--  running both — running this twice is harmless (every statement
--  below is idempotent), but running the original 38.sql on top of
--  this one is pure duplication, not a conflict, so it's safe either
--  way if that step gets missed.
--
--  Field names below use generic terms (base_url, till_number,
--  reference) since KCB's exact API contract is only visible after
--  subscribing to their "M-PESA Express" product in the Buni developer
--  portal — see supabase/functions/kcb-stk/index.ts, which per its own
--  header was verified end-to-end against KCB's sandbox (OAuth2 token
--  exchange, /stkpush, and the async IPN callback all confirmed
--  working) as of 2026-08. Re-test against production host/credentials
--  before relying on it for real collections — sandbox correctness
--  doesn't guarantee production behaves identically.
--
--  Safe to run multiple times. Run AFTER setup-modules-35.sql.
-- ============================================================

-- ---------- 1. KCB CONFIG (per school) ---------------------------
-- Field names/defaults below are CONFIRMED against KCB's own published
-- STKPushRequest schema (Buni portal > MpesaExpressAPIService > Documents),
-- not guessed.
create table if not exists kcb_config (
  school_id         text primary key references schools(id) on delete cascade,
  base_url          text not null default 'https://uat.buni.kcbgroup.com/mm/api/request/1.0.0',  -- confirmed live UAT/sandbox server from the "Try Out" tab; production will differ
  till_number       text,                   -- -> STKPushRequest.orgShortCode (KCB calls it "Till/Paybill number" at signup, 5-6 digits); only required when shared_short_code = false
  org_passkey       text,                   -- -> STKPushRequest.orgPassKey; only required when shared_short_code = false
  shared_short_code boolean not null default true,  -- -> STKPushRequest.sharedShortCode: true = KCB uses its own internal shortcode/passkey (till_number/org_passkey ignored server-side); false = your own dedicated till_number+org_passkey are used. CONFIRM which mode KCB actually issued you before going live.
  consumer_key      text not null,          -- WSO2 application "Consumer Key"
  consumer_secret   text not null,          -- WSO2 application "Consumer Secret"
  callback_url      text,                   -- -> STKPushRequest.callbackUrl (KCB's IPN field, sent per-request, not registered separately); defaults to the kcb-stk edge function's /callback route if blank
  environment       text not null default 'sandbox',
  updated_at        timestamptz not null default now()
);

-- ---------- 2. KCB TRANSACTIONS -----------------------------------
create table if not exists kcb_transactions (
  id                uuid primary key default gen_random_uuid(),
  school_id         text not null references schools(id) on delete cascade,
  parent_id         uuid references auth.users(id),
  phone             text not null,
  amount            numeric not null,
  student_ids       text[],
  reference         text,          -- our own request reference sent to KCB (their equivalent of Daraja's CheckoutRequestID)
  external_ref      text,          -- KCB/WSO2's own transaction id, once known, from the initiate response
  receipt_no        text,          -- M-Pesa receipt number once KCB's IPN confirms payment
  result_code       text,
  result_desc       text,
  status            text not null default 'pending',   -- pending | completed | failed | cancelled
  raw_callback      jsonb,         -- full IPN body, kept as received until the exact field mapping is confirmed against KCB's spec
  created_at        timestamptz not null default now()
);
create index if not exists kcb_tx_school_idx on kcb_transactions(school_id);
create index if not exists kcb_tx_reference_idx on kcb_transactions(reference);

-- ---------- 3. RLS -------------------------------------------------
-- Identical shape to mpesa_config/mpesa_transactions' RLS (setup-modules-11.sql).
alter table kcb_config       enable row level security;
alter table kcb_transactions enable row level security;

drop policy if exists p_kcb_cfg on kcb_config;
create policy p_kcb_cfg on kcb_config for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists p_kcb_tx_super on kcb_transactions;
create policy p_kcb_tx_super on kcb_transactions for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists p_kcb_tx_school on kcb_transactions;
create policy p_kcb_tx_school on kcb_transactions for select to authenticated
  using (school_id = my_school());

drop policy if exists p_kcb_tx_parent on kcb_transactions;
create policy p_kcb_tx_parent on kcb_transactions for select to authenticated
  using (parent_id = auth.uid());

drop policy if exists p_kcb_tx_parent_insert on kcb_transactions;
create policy p_kcb_tx_parent_insert on kcb_transactions for insert to authenticated
  with check (parent_id = auth.uid());

-- ---------- 4. GRANTS (idempotent) --------------------------------
-- service_role is what the kcb-stk edge function runs as — it bypasses
-- RLS but still needs an explicit table-level GRANT like any other role;
-- forgetting this produces "permission denied for table kcb_config"
-- (Postgres error 42501) the first time the function actually queries it,
-- discovered via live testing rather than at migration time.
grant select, insert, update, delete on kcb_config       to authenticated, service_role;
grant select, insert, update, delete on kcb_transactions to authenticated, service_role;
