-- ============================================================
--  Samaji — MIGRATION 34 : Delete a school (safely), block
--  duplicate school names, close a gap where an archived/suspended
--  school kept full access, and fix a bug the delete path exposed
--  in the audit log.
--
--  Four things, run together because they all touch the same
--  admin-console screen (Schools) or the delete path it needed:
--
--  PART A — Duplicate names.
--    `schools.name` has never had a uniqueness check — the
--    screenshot that prompted this migration shows two schools
--    both named "Wamunyu Academy" (different subdomains, different
--    regions). A hard `unique` index would fail to apply against
--    that existing data, so this uses a BEFORE INSERT/UPDATE
--    trigger instead: it only stops *new* collisions
--    (case-insensitive, whitespace-trimmed) going forward, and
--    leaves whatever already exists untouched. Archived schools
--    are excluded from the check, so a name can be reused once the
--    old school using it has been archived or deleted.
--
--  PART B — Deleting a school.
--    This is the destructive one, so it gets the most care.
--
--    Why a plain `delete from schools` doesn't work today:
--    `subscriptions.school_id`, `feature_overrides.school_id` and
--    `profiles.school_id` were never given `on delete cascade`
--    (see setup.sql). Right now that's accidental protection — any
--    delete attempt just fails with a foreign-key error instead of
--    doing anything. This migration replaces that accident with a
--    deliberate, safe procedure instead of just adding cascades
--    everywhere, because a few tables have their own ordering
--    problems if you cascade blindly:
--      - `mpesa_transactions.parent_id` and `teachers.auth_user_id`
--        reference auth.users with NO cascade/set-null. Deleting a
--        parent's or teacher's login before clearing those columns
--        raises a foreign-key error.
--      - `school_backups.school_id` currently cascades — meaning a
--        backup taken specifically so it would survive the school
--        being deleted was getting deleted right along with it.
--        Fixed below to a plain reference with no cascade.
--
--    admin_delete_school() does, in order, inside one transaction:
--      1. confirms the caller is super_admin AND typed the exact
--         school name (belt-and-braces beyond the confirmation the
--         UI already requires)
--      2. writes a summary (row counts + the school's own record)
--         to school_deletion_log — a table with NO foreign key to
--         schools, so this row is exactly what survives after step
--         4. This is a count/receipt, not a full data export; use
--         Database -> Backup for that first if you need one, since
--         that flow already exists and this doesn't duplicate it.
--      3. detaches the two auth.users references that don't cascade
--         (mpesa_transactions.parent_id, teachers.auth_user_id) and
--         deletes the school's own admin/teacher/parent LOGINS
--         (auth.users rows — never super_admin/billing_admin/support,
--         which are platform-wide accounts and are explicitly
--         excluded even if one somehow had a stray school_id)
--      4. deletes subscriptions/feature_overrides explicitly (no
--         cascade), then the school row itself — which cascades
--         through everything else (students, fee records, exams,
--         payroll, M-Pesa transactions, biometric, API keys, ...)
--
--    A direct `delete from schools ...` from the client (or a
--    compromised session, or a future bug) is blocked outright by
--    a trigger below — the ONLY way a school row can be removed is
--    through this function. That mirrors how audit_log already
--    protects itself (see setup-modules-26.sql): the guard is a
--    transaction-local flag this function sets right before it
--    deletes, which a bare DELETE from anywhere else never sets.
--
--  PART C — Archived/suspended schools still worked.
--    Setting a school to "archived" or "suspended" in Edit School
--    updated the badge in this table and did nothing else
--    whatsoever — every admin/teacher/parent login for that school
--    kept full access to every licensed module, because none of
--    the three portals ever looked at schools.status. Fixed by
--    adding a status check right after each portal fetches its
--    school row on login (school/, teacher/, parent/'s enterApp),
--    signing the user out with a plain message if it isn't
--    'active'. This is a client-side change alongside this
--    migration, not a SQL change — see the note further down for
--    why resolve_flags() itself is deliberately left untouched.
--
--    This closes the login gate in the app itself. It is NOT a
--    substitute for auditing every RLS policy that currently only
--    checks "school_id = my_school()" — a still-valid session
--    token for a since-suspended account could still reach the
--    underlying tables via a direct API call. That's real, separate
--    work, called out below rather than rushed into this migration.
--
--  PART D — A latent bug this migration exposed.
--    audit_log.school_id references schools(id) ON DELETE SET NULL
--    (setup-modules-26.sql) — meant to let existing audit rows survive
--    a school's deletion with their school_id cleared. That clause
--    only governs what happens to audit_log rows that ALREADY exist
--    when a school is deleted. It does nothing for the NEW audit_log
--    rows the audit triggers themselves insert for the deletion event
--    — the schools table's own DELETE, and every cascaded child row
--    (students, fee_payments, profiles, ...) that gets removed as
--    part of the same statement. Each of those AFTER-trigger inserts
--    tries to write school_id = the school that's mid-deletion in the
--    very same transaction, which the live FK constraint rejects —
--    the row it would point to is already gone by the time any of
--    those triggers fire. Deferring the constraint wouldn't help
--    either: the school is still gone by commit time too.
--
--    This was unreachable before — deleting a school was never
--    actually possible until this migration — so it never surfaced.
--    It would have made step 4 of admin_delete_school() (the actual
--    `delete from schools`) fail on EVERY school that has ANY audited
--    child row, which in practice means every real school. Caught by
--    running the real end-to-end delete against a full copy of this
--    schema rather than trusting the SQL on a read-through.
--
--    Fixed the same way school_backups was fixed above: audit_log is
--    a log, not live relational data, and its job is a forensic trail
--    that should survive the thing it describes — so its FK to
--    schools() is dropped entirely rather than special-cased per
--    table. This is also strictly more useful than the old ON DELETE
--    SET NULL behavior: audit_log rows for a deleted school now keep
--    their real school_id (findable by searching for it) instead of
--    going NULL, which matches how school_backups and
--    school_deletion_log already behave.
--
--  Safe to run multiple times. Run AFTER setup-modules-33.sql.
-- ============================================================

do $$
declare
  fk record;
begin
  for fk in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'audit_log'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = 'school_id'
  loop
    execute format('alter table audit_log drop constraint %I', fk.constraint_name);
  end loop;
end $$;

-- ---------- PART A: duplicate school names ----------------------

create or replace function prevent_duplicate_school_name()
returns trigger language plpgsql as $$
declare
  clash record;
begin
  -- `before update of name` fires whenever `name` is in the UPDATE's
  -- SET list, even if the value is unchanged — the admin console's
  -- edit form always sends name/region/status together. Without this
  -- guard, saving an unrelated field (region, status) on either of a
  -- pre-existing grandfathered duplicate would fail every time, since
  -- the OTHER duplicate would "clash" with an identical name that
  -- never actually changed.
  if TG_OP = 'UPDATE' and lower(trim(new.name)) = lower(trim(old.name)) then
    return new;
  end if;

  select id, name into clash
    from schools
    where lower(trim(name)) = lower(trim(new.name))
      and id <> new.id
      and coalesce(status, 'active') <> 'archived'
    limit 1;

  if clash.id is not null then
    raise exception 'A school named "%" already exists (id: %). Choose a different name, or archive the existing one first.',
      trim(new.name), clash.id
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_school_name on schools;
create trigger trg_prevent_duplicate_school_name
before insert or update of name on schools
for each row execute function prevent_duplicate_school_name();

-- ---------- PART B: safe school deletion -------------------------

-- Survives the school it describes — deliberately NOT a foreign key.
create table if not exists school_deletion_log (
  id            uuid primary key default gen_random_uuid(),
  school_id     text not null,          -- no FK: the row it pointed to is gone
  school_name   text not null,
  school_record jsonb not null,         -- the schools row itself, for reference
  record_counts jsonb not null,         -- {"students": 842, "fee_payments": 3120, ...}
  deleted_by    uuid references auth.users(id) on delete set null,
  deleted_by_email text,
  deleted_at    timestamptz not null default now()
);
create index if not exists school_deletion_log_school_idx on school_deletion_log(school_id);

alter table school_deletion_log enable row level security;
drop policy if exists p_deletion_log_read on school_deletion_log;
create policy p_deletion_log_read on school_deletion_log for select to authenticated
  using (is_super_admin());
-- No write policy for anyone, same reasoning as audit_log: only
-- admin_delete_school() (security definer, bypasses RLS) writes here.

-- A backup taken specifically to survive its school being deleted
-- was being deleted right along with it. Drop the cascade — the
-- constraint name below is Postgres's default auto-generated name
-- for an unnamed inline `references` clause; the DO block confirms
-- it's actually there (and finds it under any other name) before
-- touching anything, rather than assuming.
do $$
declare
  fk record;
begin
  for fk in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'school_backups'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = 'school_id'
  loop
    execute format('alter table school_backups drop constraint %I', fk.constraint_name);
  end loop;
end $$;

-- Only admin_delete_school() may remove a row from `schools`. Every
-- other path — a raw client-side delete, a future bug, a compromised
-- super_admin session — hits this instead of a foreign-key error
-- that might not exist for an empty/unused school. The guard is a
-- transaction-local setting the function sets right before it
-- deletes; nothing else in the app ever sets it.
create or replace function prevent_direct_school_delete()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('samaji.allow_school_delete', true), '') <> 'true' then
    raise exception 'Schools can only be deleted via admin_delete_school().';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevent_direct_school_delete on schools;
create trigger trg_prevent_direct_school_delete
before delete on schools
for each row execute function prevent_direct_school_delete();

-- Row counts for the confirmation dialog — "this will delete 842
-- students, 3,120 fee payments, 4 logins" — so a super_admin sees
-- the blast radius before typing the confirmation. Checks each
-- table exists first since not every install has run every
-- migration (same defensive pattern as admin_list_users).
create or replace function admin_school_deletion_preview(p_id text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
  tbl text;
  n bigint;
  candidates text[] := array[
    'students','teachers','staff','fee_payments','fee_invoices',
    'mpesa_transactions','exams','sms_messages','library_books',
    'transport_vehicles','payroll_runs'
  ];
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

  foreach tbl in array candidates loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = tbl) then
      execute format('select count(*) from %I where school_id = $1', tbl) into n using p_id;
      if n > 0 then
        result := result || jsonb_build_object(tbl, n);
      end if;
    end if;
  end loop;

  select count(*) into n from profiles where school_id = p_id and role in ('school_admin','teacher','parent');
  if n > 0 then result := result || jsonb_build_object('logins', n); end if;

  return result;
end;
$$;

-- The actual deletion. See the file header for the full reasoning
-- behind the ordering — it isn't arbitrary.
create or replace function admin_delete_school(p_id text, p_confirm_name text)
returns void
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  v_school   schools%rowtype;
  v_counts   jsonb := '{}'::jsonb;
  v_tbl      text;
  v_n        bigint;
  v_candidates text[] := array[
    'students','teachers','staff','fee_payments','fee_invoices',
    'mpesa_transactions','exams','sms_messages','library_books',
    'transport_vehicles','payroll_runs'
  ];
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

  select * into v_school from schools where id = p_id;
  if v_school.id is null then
    raise exception 'School not found.';
  end if;
  if trim(p_confirm_name) is distinct from trim(v_school.name) then
    raise exception 'Confirmation text does not match the school name.';
  end if;

  -- 1. Snapshot counts + the school row before anything is touched.
  foreach v_tbl in array v_candidates loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = v_tbl) then
      execute format('select count(*) from %I where school_id = $1', v_tbl) into v_n using p_id;
      if v_n > 0 then v_counts := v_counts || jsonb_build_object(v_tbl, v_n); end if;
    end if;
  end loop;
  select count(*) into v_n from profiles where school_id = p_id and role in ('school_admin','teacher','parent');
  if v_n > 0 then v_counts := v_counts || jsonb_build_object('logins', v_n); end if;

  insert into school_deletion_log (school_id, school_name, school_record, record_counts, deleted_by, deleted_by_email)
  values (p_id, v_school.name, to_jsonb(v_school), v_counts, auth.uid(),
          (select email from auth.users where id = auth.uid()));

  -- 2. Detach the two auth.users references that would otherwise
  --    block deleting those logins (no cascade/set-null on them).
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='mpesa_transactions') then
    update mpesa_transactions set parent_id = null where school_id = p_id;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='teachers') then
    update teachers set auth_user_id = null where school_id = p_id;
  end if;

  -- 3. Delete the school's own admin/teacher/parent logins. Scoped
  --    to exactly those three roles — never super_admin/billing_admin
  --    /support, which are platform-wide accounts, even if one
  --    somehow ended up with a stray school_id.
  delete from auth.users
  where id in (select id from profiles where school_id = p_id and role in ('school_admin','teacher','parent'));

  -- 4. Tables with no cascade on school_id, then the school itself
  --    (cascades through everything that does have one).
  delete from subscriptions where school_id = p_id;
  delete from feature_overrides where school_id = p_id;

  perform set_config('samaji.allow_school_delete', 'true', true); -- transaction-local
  delete from schools where id = p_id;
end;
$$;

-- ---------- PART C: archived/suspended schools still worked --------------
--
-- The fix here is NOT in resolve_flags(). That function is also what
-- the admin console's own Licensing screen calls to show a school's
-- real package/add-on state (setup-modules-11.sql, admin/index.html)
-- — including for a school that's currently suspended, e.g. to review
-- what they had before reactivating them. Short-circuiting
-- resolve_flags() for non-active schools would make that screen show
-- every module as unlicensed for exactly the schools an admin most
-- needs to inspect correctly. resolve_flags() is left as-is on purpose.
--
-- The actual gate belongs at the portal login boundary instead — see
-- the "status !== 'active'" check added to school/, teacher/ and
-- parent/'s enterApp() in this same change. Each already fetches its
-- own schools row on login; this migration doesn't need to touch
-- anything for that part, it's a client-side change alongside it.
--
-- As noted in the file header: this closes the login gate in the app
-- itself. It is not a substitute for auditing every RLS policy that
-- currently only checks "school_id = my_school()" — a valid,
-- not-yet-expired session token for a since-suspended account could
-- still reach the underlying tables via a direct API call. That's
-- real, separate work; flagging it here rather than folding a
-- half-tested version of it into this migration.
