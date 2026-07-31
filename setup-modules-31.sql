-- ============================================================
--  Samaji — MIGRATION 31 : Superadmin can restrict a school's OWNER
--  account too, not just staff it creates.
--
--  Migration 30 let a school's admin ("owner") delegate a subset of
--  their own access to staff accounts they create — but the owner
--  itself stayed permanently unrestricted. This adds a per-school
--  switch (schools.restrict_admin) so super_admin can lock the owner
--  down to exactly the rights ticked in the Admin Console → Rights
--  tab too — e.g. hide Settings entirely until super_admin enables it.
--
--  Off (false) by default — every existing school's admin keeps full,
--  unrestricted access exactly as before. Only schools a super_admin
--  explicitly flips the switch on for are affected.
--
--  Run AFTER setup-modules-30.sql.
-- ============================================================

alter table schools add column if not exists restrict_admin boolean not null default false;

-- Only super_admin may flip this — even though p_schools_admin_write
-- (setup-modules-29.sql) lets an owner update their own school's profile
-- fields, the existing protect_school_admin_fields() trigger already
-- locks out subdomain/status/region from a non-super_admin write; add
-- restrict_admin to that same protected list so an owner can never
-- unlock themselves.
create or replace function protect_school_admin_fields()
returns trigger language plpgsql as $$
begin
  if not is_super_admin() then
    new.subdomain      := old.subdomain;
    new.status         := old.status;
    new.region         := old.region;
    new.restrict_admin := old.restrict_admin;
  end if;
  return new;
end;
$$;
-- trigger trg_protect_school_admin_fields already exists (setup-modules-29.sql)
-- and re-resolves this function body on every run — no need to recreate it.

-- can_manage_school_users(): when a school's owner has been restricted,
-- their own ability to manage users/rights now depends on 'manage_users'
-- being enabled for their school too, same as a rights-holding staff
-- account. Unrestricted schools (the default) are unaffected.
create or replace function can_manage_school_users()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.school_id is not null
      and p.role <> 'teacher'
      and (
        (
          p.school_role = 'owner'
          and (
            not coalesce((select s.restrict_admin from schools s where s.id = p.school_id), false)
            or exists (select 1 from school_rights sr where sr.school_id = p.school_id and sr.right_key = 'manage_users' and sr.enabled = true)
          )
        )
        or exists (select 1 from user_rights ur where ur.user_id = p.id and ur.right_key = 'manage_users')
      )
  );
$$;
grant execute on function can_manage_school_users() to authenticated;

grant execute on all functions in schema public to anon, authenticated;

-- ---------- NOTES --------------------------------------------------
-- To restrict a school's own admin (not just staff they create):
-- Admin Console → Rights → pick the school → toggle "Restrict this
-- school's admin" on, then tick exactly which rights they keep. The
-- admin's School Portal nav (modules, Reports, Settings and its
-- sub-tabs) is then filtered the same way a delegated staff account
-- already is. Leave the toggle off (default) to keep that school's
-- admin fully unrestricted, as before this migration.
