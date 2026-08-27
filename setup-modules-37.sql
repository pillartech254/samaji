-- ============================================================
--  Samaji — MIGRATION 37 : let super_admin permanently clear a
--  school's Activity Log.
--
--  audit_log was, until now, genuinely append-only from every
--  portal's perspective — the comment above showAuditLog() in
--  admin/index.html even says so ("nothing in this console... can
--  write to or edit it"). This migration deliberately breaks that,
--  on request, so it's worth being explicit about the trade-off:
--  audit_log exists specifically so actions (including a
--  super_admin's own) are provable after the fact. Letting the same
--  role that can DO those actions also ERASE the record of having
--  done them means that specific accountability property is gone —
--  a super_admin who wanted to hide something could clear the log
--  right after doing it, and there would be nothing in audit_log
--  itself to show that happened.
--
--  What this migration does NOT try to do: stop that. It can't —
--  once rows are deleted, they're gone, by design (the person asking
--  for this explicitly wants permanent deletion, not a soft-hide).
--  What it DOES do: make the act of clearing itself provable, even
--  though the cleared content isn't. audit_log_clear_events is a
--  separate table the clear operation cannot touch (it's not
--  audit_log, so deleting from audit_log never removes its own
--  clear-event rows) recording who cleared what, when, and how many
--  rows — the same shape as school_deletion_log from
--  setup-modules-34.sql. It has no write policy of its own; only
--  admin_clear_audit_log() (security definer) can insert into it.
--
--  Always scoped to one school, never a global wipe — matching
--  admin_reset_table()'s existing design (setup-modules-11.sql),
--  which never allowed clearing every school's data in one call
--  either.
--
--  Safe to run multiple times. Run AFTER setup-modules-36.sql.
-- ============================================================

create table if not exists audit_log_clear_events (
  id            uuid primary key default gen_random_uuid(),
  school_id     text not null,     -- no FK: intentionally independent of both
                                    -- audit_log and schools, same reasoning as
                                    -- school_deletion_log — must outlive either
  school_name   text,
  rows_deleted  integer not null,
  cleared_by    uuid references auth.users(id) on delete set null,
  cleared_by_email text,
  cleared_at    timestamptz not null default now()
);
create index if not exists audit_log_clear_events_school_idx on audit_log_clear_events(school_id);

alter table audit_log_clear_events enable row level security;
drop policy if exists p_audit_clear_events_read on audit_log_clear_events;
create policy p_audit_clear_events_read on audit_log_clear_events for select to authenticated
  using (is_super_admin());
-- No write policy — only admin_clear_audit_log() (security definer,
-- bypasses RLS) inserts here, same as audit_log and school_deletion_log.

create or replace function admin_clear_audit_log(p_school_id text)
returns integer
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_school_name text;
  v_count integer;
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;
  if p_school_id is null or trim(p_school_id) = '' then
    raise exception 'A school must be selected — clearing every school''s activity log in one call is not allowed.';
  end if;

  select name into v_school_name from schools where id = p_school_id;

  select count(*) into v_count from audit_log where school_id = p_school_id;

  -- Written BEFORE the delete below, and to a table the delete can
  -- never reach, so the receipt survives even though the log entries
  -- it describes will not.
  insert into audit_log_clear_events (school_id, school_name, rows_deleted, cleared_by, cleared_by_email)
  values (p_school_id, v_school_name, v_count, auth.uid(), (select email from auth.users where id = auth.uid()));

  delete from audit_log where school_id = p_school_id;

  return v_count;
end;
$$;
