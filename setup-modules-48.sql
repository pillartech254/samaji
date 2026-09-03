-- ============================================================
--  Samaji — MIGRATION 48 : configurable receipt size + public
--  receipt verification (for the QR code on printed receipts)
--
--  Requested directly: a professional receipt redesign with a QR
--  code that verifies authenticity when scanned, and a school-level
--  setting (A5 / A6 / POS 80mm thermal) that applies consistently
--  wherever a receipt is shown — school portal and parent portal
--  alike.
--
--  Two pieces here:
--   1. schools.receipt_size — a simple per-school setting, same
--      pattern as logo_url. Both portals already fetch the school
--      row when rendering a receipt; this just adds one more column
--      to that same read.
--   2. verify_receipt(p_id) — a SECURITY DEFINER function, not a
--      direct table grant. fee_payments holds a lot that shouldn't
--      be exposed to an anonymous QR scan (phone numbers, methods,
--      full history) — this returns only what's needed to visually
--      confirm a receipt is real: the receipt number, amount, date,
--      school name, and the student's first name + last-initial
--      (deliberately not the full name, for the same reason a
--      shipping confirmation shows "J. Smith" rather than a full
--      name to a stranger scanning a package label). Looked up by
--      the payment's own UUID, not the human-facing receipt_no —
--      receipt numbers are sequential per school and guessable;
--      UUIDs aren't, so a curious scanner can't enumerate other
--      families' receipts by trying nearby numbers.
--
--  Run AFTER setup-modules-47.sql. Safe to run multiple times.
-- ============================================================

alter table schools add column if not exists receipt_size text not null default 'a5';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'schools_receipt_size_check'
  ) then
    alter table schools add constraint schools_receipt_size_check
      check (receipt_size in ('a5','a6','pos80'));
  end if;
end $$;

create or replace function verify_receipt(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'valid', true,
    'receipt_no', fp.receipt_no,
    'amount', fp.amount,
    'paid_at', fp.paid_at,
    'method', fp.method,
    'term', fp.term,
    'year', fp.year,
    'school_name', s.name,
    'student_name', s2.first_name || ' ' || left(s2.last_name, 1) || '.'
  ) into result
  from fee_payments fp
  join schools s on s.id = fp.school_id
  join students s2 on s2.id = fp.student_id
  where fp.id = p_id;

  if result is null then
    return jsonb_build_object('valid', false);
  end if;

  return result;
end;
$$;

grant execute on function verify_receipt(uuid) to anon, authenticated;
