-- ============================================================
--  Samaji — MODULE DATA, part 6 : SMS Gateway
--  Creates the sms_credit_ledger (balance = sum of delta) + message log.
--  Run AFTER the previous setup files.
-- ============================================================

-- Credit ledger: every row is a delta (+ topups / − sends); balance = sum
create table if not exists sms_credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  delta      integer not null,               -- positive = credit, negative = debit
  reason     text,                           -- opening_balance | topup | sms_send
  created_at timestamptz not null default now()
);
create index if not exists sms_credit_ledger_school_idx on sms_credit_ledger(school_id);

-- Secure the credit ledger with RLS
alter table sms_credit_ledger enable row level security;
drop policy if exists p_smsledger_rw on sms_credit_ledger;
create policy p_smsledger_rw on sms_credit_ledger for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_smsledger_super on sms_credit_ledger;
create policy p_smsledger_super on sms_credit_ledger for select to authenticated
  using (is_super_admin());

-- Sent-message log
create table if not exists sms_messages (
  id         uuid primary key default gen_random_uuid(),
  school_id  text not null references schools(id) on delete cascade,
  recipient  text not null,
  body       text not null,
  segments   integer not null default 1,
  cost       integer not null default 1,    -- credits consumed
  status     text not null default 'sent',  -- sent | failed | queued
  created_at timestamptz not null default now()
);
create index if not exists sms_messages_school_idx on sms_messages(school_id, created_at desc);

alter table sms_messages enable row level security;
drop policy if exists p_smsmsg_rw on sms_messages;
create policy p_smsmsg_rw on sms_messages for all to authenticated
  using (school_id = my_school()) with check (school_id = my_school());
drop policy if exists p_smsmsg_super on sms_messages;
create policy p_smsmsg_super on sms_messages for select to authenticated
  using (is_super_admin());

-- Seed an opening credit balance for Greenwood (if none yet)
insert into sms_credit_ledger (school_id, delta, reason)
select 'SCH-10428', 5000, 'opening_balance'
where not exists (select 1 from sms_credit_ledger where school_id = 'SCH-10428');
