-- ============================================================
--  Samaji — MIGRATION 26 : Audit log for sensitive actions.
--
--  Continuing the security work from migrations 21-25 (which closed
--  the actual holes) with forward-looking visibility: a tamper-evident
--  trail of who did what to the data that matters most — money,
--  student records, and account privileges — so if something like the
--  bugs fixed in 21/22 recurs (a new one, a misconfiguration, whatever)
--  there's a record to investigate, instead of finding out only from
--  the damage.
--
--  Writes happen ONLY via triggers (security definer, bypasses RLS) —
--  there is deliberately no INSERT/UPDATE/DELETE policy for anyone,
--  including super_admin, so the log can't be edited or covered up
--  from the client side. Only reachable by dropping to the Postgres
--  superuser connection Supabase gives you outside RLS entirely.
--
--  Safe to run multiple times. Run AFTER setup-modules-25.sql.
-- ============================================================

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  school_id   text references schools(id) on delete set null,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  action      text not null,   -- INSERT | UPDATE | DELETE
  table_name  text not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_school_idx on audit_log(school_id, created_at desc);
create index if not exists audit_log_record_idx on audit_log(table_name, record_id);

alter table audit_log enable row level security;

-- Read-only: super_admin sees everything, a school_admin sees their own
-- school's entries. No write policy for anyone — see note above.
drop policy if exists p_audit_read on audit_log;
create policy p_audit_read on audit_log for select to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()));

create or replace function audit_trigger_fn()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_row    jsonb;
  v_school text;
begin
  v_row := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  v_school := coalesce(v_row->>'school_id', case when TG_TABLE_NAME = 'schools' then v_row->>'id' else null end);

  insert into audit_log (school_id, actor_id, actor_email, action, table_name, record_id, old_data, new_data)
  values (
    v_school,
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    TG_OP,
    TG_TABLE_NAME,
    v_row->>'id',
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else null end
  );
  return coalesce(NEW, OLD);
end;
$$;

-- Money: every payment, and any change to what a student is billed.
drop trigger if exists trg_audit_fee_payments on fee_payments;
create trigger trg_audit_fee_payments after insert or update or delete on fee_payments
  for each row execute function audit_trigger_fn();

drop trigger if exists trg_audit_fee_structures on fee_structures;
create trigger trg_audit_fee_structures after update or delete on fee_structures
  for each row execute function audit_trigger_fn();

drop trigger if exists trg_audit_fee_items on fee_items;
create trigger trg_audit_fee_items after insert or update or delete on fee_items
  for each row execute function audit_trigger_fn();

-- Student records: edits and deletions (not routine bulk-import
-- creation — that would just be noise from CSV imports).
drop trigger if exists trg_audit_students on students;
create trigger trg_audit_students after update or delete on students
  for each row execute function audit_trigger_fn();

-- Privileges: every profile change, full stop — this is exactly what
-- the setup-modules-21/22.sql bugs would have shown up in immediately.
drop trigger if exists trg_audit_profiles on profiles;
create trigger trg_audit_profiles after insert or update or delete on profiles
  for each row execute function audit_trigger_fn();

-- Platform-level: school records and M-Pesa credentials.
drop trigger if exists trg_audit_schools on schools;
create trigger trg_audit_schools after insert or update or delete on schools
  for each row execute function audit_trigger_fn();

drop trigger if exists trg_audit_mpesa_config on mpesa_config;
create trigger trg_audit_mpesa_config after insert or update or delete on mpesa_config
  for each row execute function audit_trigger_fn();
