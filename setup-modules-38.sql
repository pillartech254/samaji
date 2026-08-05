-- ============================================================
-- setup-modules-38.sql
-- KCB Buni (WSO2 API Manager) Till/Paybill payment integration —
-- a SECOND, independent payment rail alongside the existing Safaricom
-- Daraja integration (mpesa_config / mpesa_transactions / the
-- supabase/functions/mpesa-stk edge function). None of that is
-- touched here — this is purely additive, mirroring its schema/RLS
-- shape so a school can eventually choose either provider (or both).
--
-- Field names below use generic terms (base_url, till_number,
-- reference) since KCB's exact API contract is only visible after
-- subscribing to their "M-PESA Express" product in the Buni developer
-- portal — see supabase/functions/kcb-stk/index.ts for the TODOs that
-- need KCB's confirmed endpoint paths/payload shape before this goes
-- live.
-- ============================================================

-- ---------- 1. KCB CONFIG (per school) ---------------------------
create table if not exists kcb_config (
  school_id       text primary key references schools(id) on delete cascade,
  base_url        text not null default 'https://sandbox.buni.kcbgroup.com',  -- WSO2 gateway host; confirm exact value from KCB's Buni portal
  till_number     text not null,          -- KCB Till/Paybill number issued for this school
  consumer_key    text not null,          -- WSO2 application "Consumer Key"
  consumer_secret text not null,          -- WSO2 application "Consumer Secret"
  callback_url    text,                   -- IPN URL given to KCB; defaults to the kcb-stk edge function's /callback route if blank
  environment     text not null default 'sandbox',
  updated_at      timestamptz not null default now()
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
grant select, insert, update, delete on kcb_config       to authenticated;
grant select, insert, update, delete on kcb_transactions to authenticated;
