-- ============================================================
--  Samaji — MIGRATION 50 : fix staff role assignment not
--  persisting, and make Students universally available to staff
--
--  Reported directly, with a screenshot: a Librarian assigned only
--  students/library/communications could still see every licensed
--  module — the restriction wasn't applying at all.
--
--  ROOT CAUSE: the "Add User" flow's staff path did a direct
--  sb.from("profiles").update({custom_role_id: ...}) from the admin
--  console. profiles has exactly one RLS policy — SELECT, scoped to
--  "id = auth.uid()" (read your own profile). There has never been
--  an UPDATE policy on profiles at all. The update silently matched
--  zero rows — Postgres RLS on UPDATE doesn't error when a row fails
--  the USING clause, it just isn't updated — so custom_role_id was
--  never actually set. On login, the staff module fetch (gated on
--  profiles.custom_role_id being present) never ran, STAFF_MODULES
--  stayed null, and the School Portal's own filtering correctly did
--  nothing, because as far as it could tell there was nothing to
--  filter by.
--
--  FIX: a proper security definer RPC, matching the same pattern
--  already used for admin_create_user, rather than a broad UPDATE
--  policy on profiles that would need careful scoping of its own.
--
--  SECOND CHANGE, requested directly in the same report: Students
--  should be visible to every staff member regardless of their
--  role's specific module grants — a Librarian needs the list to
--  issue books, a Bursar needs it to bill, and this is true of
--  essentially any staff position. Rather than something a
--  super_admin has to remember to check for every role, this makes
--  module.students implicitly available to any 'staff' account at
--  their own school, on top of whatever else their role explicitly
--  grants.
--
--  Run AFTER setup-modules-49.sql. Safe to run multiple times.
-- ============================================================

-- ---------- 1. the actual fix: a real way to persist the assignment ----
create or replace function admin_set_custom_role(p_user_id uuid, p_custom_role_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

  update profiles
  set custom_role_id = p_custom_role_id
  where id = p_user_id and role = 'staff';

  if not found then
    raise exception 'No staff profile found for that user — the role can only be assigned to an account created with the staff role.';
  end if;
end;
$$;

grant execute on function admin_set_custom_role(uuid, uuid) to authenticated;

-- ---------- 2. Students: universally available to any staff member -----
-- ----------    at their own school, on top of whatever their role's ----
-- ----------    own explicit grants are ----------------------------------
drop policy if exists p_students_staff_read on students;
create policy p_students_staff_read on students for select to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'staff' and p.school_id = students.school_id
    )
  );
