-- ============================================================
--  Samaji — MIGRATION 43 : enable Realtime on mpesa_transactions
--  and kcb_transactions, so the Parent Portal can listen for a
--  payment's completion instead of guessing with a fixed timeout.
--
--  Reported directly: a real sandbox payment went through — the
--  parent's own phone got the M-Pesa confirmation SMS, and the
--  transaction genuinely did reach status='completed' shortly after
--  — but the Parent Portal's payment modal had already given up and
--  shown "Payment timed out" by the time that happened, because
--  Safaricom's own async callback simply took longer to arrive than
--  the frontend's fixed ~2-minute polling window. The receipt never
--  auto-appeared; the parent had to notice the M-Pesa Transactions
--  list had updated on its own, separately, later.
--
--  A fixed timeout can never fully solve this — there's no polling
--  window long enough to guarantee a callback that might simply be
--  slow (well-documented as unreliable specifically in Safaricom's
--  sandbox). What actually closes this is a real listener: the
--  Parent Portal subscribes to Postgres changes on the specific
--  transaction row the moment a payment is initiated, and reacts the
--  instant that row's status changes — whenever the callback
--  actually arrives, not bounded by a client-side clock at all. This
--  migration is the one piece of that which has to happen in the
--  database: a table's changes are only delivered over Supabase
--  Realtime if the table is added to the `supabase_realtime`
--  publication.
--
--  Existing RLS policies (p_mpesa_tx_parent, p_kcb_tx_parent) already
--  scope SELECT to `parent_id = auth.uid()` — Realtime respects the
--  same RLS a normal query would, so this doesn't grant anyone
--  visibility into a transaction that wasn't already visible to them
--  via the API.
--
--  Safe to run multiple times — Postgres publications simply skip a
--  table already present rather than erroring.
--
--  Run AFTER setup-modules-42.sql.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mpesa_transactions'
  ) then
    alter publication supabase_realtime add table mpesa_transactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kcb_transactions'
  ) then
    alter publication supabase_realtime add table kcb_transactions;
  end if;
end $$;
