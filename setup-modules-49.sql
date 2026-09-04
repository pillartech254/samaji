-- ============================================================
--  Samaji — MIGRATION 49 : custom staff roles with per-module
--  permissions (super_admin only)
--
--  Requested directly: the role system was fixed (school_admin,
--  teacher, parent) with no way to add a position like Librarian or
--  Bursar/Accountant, or control exactly which modules each such
--  person can use. Explicitly scoped to super_admin — this is
--  platform administration, the same tier as creating schools and
--  users in the first place, not something individual schools manage
--  themselves.
--
--  ARCHITECTURE, AND WHY: rewriting every existing table's RLS to
--  understand arbitrary custom roles would touch the entire security
--  model of an already-live system — is_school_admin() alone is
--  referenced throughout dozens of policies, all built around a
--  small, fixed set of role names. Instead: a new 'staff' role,
--  distinct from school_admin, whose access to any given table is
--  governed by an explicit module grant checked via
--  staff_has_module() below.
--
--  The key safety property this leans on: a newly created 'staff'
--  profile has NO role name any existing policy already recognizes,
--  so by default it can access nothing at all — not "some access
--  that turns out to be too broad," genuinely zero, until a specific
--  module is added to their assigned role AND the corresponding
--  table's own policy is updated to check staff_has_module() for it.
--  This is what makes it safe to build and extend incrementally:
--  each module covered is a deliberate, individually-tested addition,
--  never an accidental grant.
--
--  This migration lays the foundation (schema + the reusable
--  authorization function) and wires up the modules covered so far;
--  see the migration's own end for exactly which ones, and note
--  honestly that extending coverage to every remaining module is
--  further, separate work, module by module, not a blanket switch.
--
--  Run AFTER setup-modules-48.sql. Safe to run multiple times.
-- ============================================================

-- ---------- 1. custom_roles : a super_admin-defined position -----------
create table if not exists custom_roles (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references schools(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

-- ---------- 2. role_modules : which modules a custom role may use ------
create table if not exists role_modules (
  role_id uuid not null references custom_roles(id) on delete cascade,
  module_key text not null,
  primary key (role_id, module_key)
);

-- ---------- 3. link a staff profile to their assigned custom role ------
alter table profiles add column if not exists custom_role_id uuid references custom_roles(id) on delete set null;

-- ---------- 4. RLS: management is super_admin only, exactly as ---------
-- ----------    requested. A staff member may read their OWN role's -----
-- ----------    name and module list — needed so their own portal -------
-- ----------    knows what to show them — but cannot see or touch --------
-- ----------    any other role. ------------------------------------------
alter table custom_roles enable row level security;
alter table role_modules enable row level security;

drop policy if exists p_custom_roles_super on custom_roles;
create policy p_custom_roles_super on custom_roles for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists p_custom_roles_read_own on custom_roles;
create policy p_custom_roles_read_own on custom_roles for select to authenticated
  using (id in (select custom_role_id from profiles where id = auth.uid()));

drop policy if exists p_role_modules_super on role_modules;
create policy p_role_modules_super on role_modules for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists p_role_modules_read_own on role_modules;
create policy p_role_modules_read_own on role_modules for select to authenticated
  using (role_id in (select custom_role_id from profiles where id = auth.uid()));

-- ---------- 5. the reusable authorization check -------------------------
-- Deliberately self-contained on school scoping — takes the target
-- school_id directly and checks it against the calling user's own
-- profile, rather than assuming the surrounding policy already
-- enforces that match. Deliberately does NOT also check
-- is_super_admin()/is_school_admin() internally — those already have
-- their own, separate checks in every existing policy; this function
-- is meant to be OR'd onto those unchanged, covering only the new
-- 'staff' case.
create or replace function staff_has_module(p_school_id text, p_module text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    join role_modules rm on rm.role_id = p.custom_role_id
    where p.id = auth.uid()
      and p.role = 'staff'
      and p.school_id = p_school_id
      and rm.module_key = p_module
  );
$$;

grant execute on function staff_has_module(text, text) to authenticated;

-- ---------- 6. admin_list_users needs to know about 'staff' too --------
-- Reused as-is for the non-parent branch (school_id = p_school_id) —
-- 'staff' already flows through that path correctly since it isn't
-- parent-specific. No change needed there; called out here only so
-- the next reader isn't left wondering whether it was checked.

-- ---------- 7. module coverage wired up in this migration --------------
-- students (read) and fee_payments/fee_structures/fee_items (the
-- Bursar/Accountant case named directly in the request) — chosen as
-- the first modules covered because nearly every other module's own
-- screens need at least read access to student records for context,
-- and finance was the explicit motivating example. See the PR/commit
-- this migration ships with for the full, honest list of what is and
-- isn't covered yet.

drop policy if exists p_students_staff_read on students;
create policy p_students_staff_read on students for select to authenticated
  using (staff_has_module(school_id, 'module.students'));

drop policy if exists p_fee_payments_staff on fee_payments;
create policy p_fee_payments_staff on fee_payments for all to authenticated
  using (staff_has_module(school_id, 'module.finance'))
  with check (staff_has_module(school_id, 'module.finance'));

drop policy if exists p_fee_structures_staff on fee_structures;
create policy p_fee_structures_staff on fee_structures for all to authenticated
  using (staff_has_module(school_id, 'module.finance'))
  with check (staff_has_module(school_id, 'module.finance'));

drop policy if exists p_fee_items_staff on fee_items;
create policy p_fee_items_staff on fee_items for all to authenticated
  using (
    exists (select 1 from fee_structures fs where fs.id = fee_items.structure_id and staff_has_module(fs.school_id, 'module.finance'))
  )
  with check (
    exists (select 1 from fee_structures fs where fs.id = fee_items.structure_id and staff_has_module(fs.school_id, 'module.finance'))
  );

-- ---------- 8. fix a pre-existing policy this migration's new -----------
-- ----------    'staff' role accidentally fell through --------------------
-- p_students_read used "school_id = my_school() AND NOT is_parent()" —
-- a lazy shorthand for "teacher" written back when the only non-
-- parent, non-school_admin role was 'teacher' (school_admin already
-- has its own separate p_students_admin_rw policy). Caught directly
-- by this migration's own tests, not assumed safe: the new 'staff'
-- role is also "not a parent," so this negation silently granted
-- every staff member — Librarian, Bursar, anyone — full, unrestricted
-- read access to every student at their school, completely bypassing
-- staff_has_module('module.students') a few lines above. Same fix
-- pattern already used once before for is_school_admin() in
-- setup-modules-22.sql: an explicit allow-list instead of a broad
-- negation that can't see roles that didn't exist yet when it was
-- written.
drop policy if exists p_students_read on students;
create policy p_students_read on students for select to authenticated
  using (
    school_id = my_school()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher')
  );

-- Same leak, same fix, found by the same sweep: p_report_cards_read
-- used the identical "not is_parent()" shorthand (setup-modules-39.
-- sql), meaning any 'staff' member would have had unrestricted read
-- access to every student's report card at their school regardless
-- of module grants. Fixed the same way, and module.academics support
-- added at the same time since this policy was already being
-- touched — a staff member (e.g. an academic coordinator role)
-- genuinely granted that module can now read report cards; anyone
-- without it, including every other staff role, cannot.
drop policy if exists p_report_cards_read on report_cards;
create policy p_report_cards_read on report_cards for select to authenticated
  using (
    school_id = my_school()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher')
  );

drop policy if exists p_report_cards_staff on report_cards;
create policy p_report_cards_staff on report_cards for select to authenticated
  using (staff_has_module(school_id, 'module.academics'));

-- ---------- 9. admin_list_users: surface the real custom role name -----
-- ----------    (e.g. "Bursar"), not just the generic 'staff' role -------
-- ----------    value, so the Users list is actually informative ---------
create or replace function admin_list_users(p_school_id text default null)
returns jsonb
language plpgsql security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

  select coalesce(jsonb_agg(row_order), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'user_id', u.id,
      'email', u.email,
      'role', p.role,
      'custom_role_name', cr.name,
      'school_id', coalesce(pa.school_id, p.school_id),
      'phone', coalesce(pa.phone, u.raw_user_meta_data->>'phone', ''),
      'full_name', coalesce(pa.full_name, t.name, u.raw_user_meta_data->>'full_name', ''),
      'created_at', u.created_at,
      'must_change_pw', coalesce(pa.must_change_password, false)
    ) as row_order
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.parent_accounts pa on pa.id = u.id
    left join public.teachers t on t.auth_user_id = u.id
    left join public.custom_roles cr on cr.id = p.custom_role_id
    where
      p_school_id is null
      or (p.role <> 'parent' and p.school_id = p_school_id)
      or (p.role = 'parent' and pa.school_id = p_school_id)
    order by
      case p.role
        when 'super_admin' then 0
        when 'school_admin' then 1
        when 'teacher' then 2
        when 'staff' then 3
        when 'parent' then 4
        else 5
      end,
      u.created_at desc
  ) sub;

  return result;
end;
$$;

