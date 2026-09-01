-- ============================================================
--  Samaji — MIGRATION 44 : let a school admin (and, once added,
--  a bursar/accountant account) trigger an M-Pesa/KCB STK push
--  directly from Collect Payment — not just a parent from their own
--  portal.
--
--  Requested directly: a school should be able to run EITHER fully
--  manual fee collection (cash/cheque/bank, already supported),
--  fully automated (parent pays via their own portal, already
--  supported), or a mix — an admin/bursar at the front desk pushing
--  an STK prompt to a parent's phone right there and then, with
--  manual recording always available as a fallback if the automated
--  push fails for any reason.
--
--  student_ids/parent_id on mpesa_transactions and kcb_transactions
--  already existed for a PARENT-initiated payment (parent_id was
--  already nullable — no schema change needed there). A school-
--  initiated push has no "parent_id" in that same sense: nobody
--  necessarily has a Parent Portal account yet, and even where one
--  exists, the admin/bursar initiating this isn't that account. Adds
--  initiated_by instead, tracking which STAFF account triggered a
--  given push — kept separate from parent_id (never both set on the
--  same row) so "who actually initiated this" stays unambiguous
--  either way.
--
--  p_mpesa_tx_school / p_kcb_tx_school (setup-modules-11.sql /
--  setup-modules-36.sql) already grant read access scoped to
--  `school_id = my_school()`, with no role check at all — noted here,
--  not fixed here: this is the same over-broad-policy pattern flagged
--  and only partially audited in setup-modules-38.sql's own header
--  comment (any authenticated role in the school can currently read
--  it, not just admin). Out of scope for this migration, which only
--  adds the INSERT policy a school_admin needs to actually create a
--  push — narrower than what read access already (over-)permits, not
--  wider.
--
--  Deliberately does NOT yet mention "bursar" — that role doesn't
--  exist yet. This policy is scoped to is_school_admin() specifically
--  for now; the next migration, when the bursar role is added, is
--  where this gets extended to include it too, kept as two separate,
--  clearly-scoped changes rather than one migration guessing ahead at
--  a role its own tests can't yet exercise.
--
--  Safe to run multiple times.
--  Run AFTER setup-modules-43.sql.
-- ============================================================

alter table mpesa_transactions add column if not exists initiated_by uuid references auth.users(id);
alter table kcb_transactions add column if not exists initiated_by uuid references auth.users(id);

drop policy if exists p_mpesa_tx_school_insert on mpesa_transactions;
create policy p_mpesa_tx_school_insert on mpesa_transactions for insert to authenticated
  with check (school_id = my_school() and is_school_admin() and parent_id is null and initiated_by = auth.uid());

drop policy if exists p_kcb_tx_school_insert on kcb_transactions;
create policy p_kcb_tx_school_insert on kcb_transactions for insert to authenticated
  with check (school_id = my_school() and is_school_admin() and parent_id is null and initiated_by = auth.uid());
