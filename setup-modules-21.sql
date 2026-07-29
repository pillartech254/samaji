-- ============================================================
--  Samaji — MIGRATION 21 : CRITICAL SECURITY FIX
--  handle_new_user() granted platform-wide super_admin to ANY
--  unrecognized signup. Run this immediately — see README/commit
--  message for full impact and recommended follow-up.
--  Safe to run multiple times. Run AFTER setup-modules-20.sql.
-- ============================================================

-- Overrides the version from setup-modules-14.sql. Same teacher-matching
-- logic; only the fallback branch changes. Previously, any signup whose
-- email did NOT match an unclaimed teachers.email fell through to
--   insert into public.profiles (id, role) values (new.id, 'super_admin')
-- — and /teacher/ lets anyone sign up with any email. That made platform
-- -wide super_admin (read every school's data, write the schools table,
-- and call admin_backup_table()/admin_reset_table() against any school)
-- reachable by anyone who filled in the public teacher signup form with
-- an email a school hadn't registered. Legitimate accounts (school
-- admins, parents) are unaffected — they're provisioned by the
-- admin-users edge function, which sets role/school_id explicitly via
-- upsert() after creation regardless of what this trigger does first.
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  t teachers%rowtype;
begin
  select * into t from teachers
    where auth_user_id is null and email is not null and lower(email) = lower(new.email)
    limit 1;
  if t.id is not null then
    insert into public.profiles (id, role, school_id) values (new.id, 'teacher', t.school_id)
      on conflict (id) do update set role = 'teacher', school_id = t.school_id;
    update teachers set auth_user_id = new.id where id = t.id;
  else
    -- No privileges at all for an unrecognized signup — not super_admin.
    -- role='unassigned' with school_id=null matches no policy anywhere
    -- (is_super_admin() is false, is_school_admin() requires school_id
    -- is not null, and every school_id = my_school() check compares
    -- against null, which is never true).
    insert into public.profiles (id, role, school_id) values (new.id, 'unassigned', null)
      on conflict (id) do nothing;
  end if;
  return new;
end; $$;

-- ---------- Audit query: find accounts that MAY be exploiting the ------
-- ---------- bug above, so you can review them before this fix lands ----
-- profiles.role='super_admin' with school_id is null is the exact shape
-- the bug produced. It's also the shape of your own legitimate founding
-- admin account(s) (created before the admin-users edge function
-- existed) — so review this list by email/created_at, don't mass-delete.
-- Run this as a SEPARATE query (SQL Editor "Run" applies the whole
-- file, but you want to eyeball this result before acting on it).
select p.id, u.email, u.created_at, p.role, p.school_id
from profiles p
join auth.users u on u.id = p.id
where p.role = 'super_admin' and p.school_id is null
order by u.created_at desc;
