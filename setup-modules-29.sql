-- ============================================================
-- School profile & logo — fixes two bugs that made every save a no-op:
--
-- 1. The Settings → School Profile UI has been writing to
--    schools.logo_url / .address / .phone / .email / .motto since it
--    was built, but those columns never existed on the table (the
--    original schema only has id/name/subdomain/region/status). Every
--    update silently failed with a "column does not exist" error.
-- 2. Even with the columns added, the only UPDATE policy on `schools`
--    (p_schools_write, setup-modules-11.sql) is is_super_admin()-only —
--    a school_admin editing their own school's profile has never been
--    allowed to write to this table at all.
--
-- The app-side fix (school-plus.js) also switches logo storage from a
-- base64 data URL crammed into the logo_url column (bloats every
-- `select("*") from schools` call across all four portals, including
-- the admin console's "list every school" query) to a real file in
-- Supabase Storage, with logo_url holding just the public URL.
-- ============================================================

alter table schools add column if not exists logo_url text;
alter table schools add column if not exists address  text;
alter table schools add column if not exists phone    text;
alter table schools add column if not exists email    text;
alter table schools add column if not exists motto    text;

-- ---------- school_admin may update their own school's profile ----------
-- Scoped to their own row only; the trigger below still locks out the
-- handful of fields (subdomain/status/region) that only a super_admin
-- (via the admin console) should ever change, even if a crafted request
-- included them.
drop policy if exists p_schools_admin_write on schools;
create policy p_schools_admin_write on schools for update to authenticated
  using (id = my_school() and is_school_admin())
  with check (id = my_school() and is_school_admin());

create or replace function protect_school_admin_fields()
returns trigger language plpgsql as $$
begin
  if not is_super_admin() then
    new.subdomain := old.subdomain;
    new.status    := old.status;
    new.region    := old.region;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_school_admin_fields on schools;
create trigger trg_protect_school_admin_fields
before update on schools
for each row execute function protect_school_admin_fields();

-- ---------- Storage bucket for logos ----------
-- Public read (logos appear on receipts/statements parents view without
-- being logged in to Storage), write restricted to that school's own
-- admin, scoped by the first path segment (<school_id>/logo.<ext>).
insert into storage.buckets (id, name, public)
values ('school-logos', 'school-logos', true)
on conflict (id) do update set public = true;

drop policy if exists school_logos_read on storage.objects;
create policy school_logos_read on storage.objects for select
  to public
  using (bucket_id = 'school-logos');

drop policy if exists school_logos_write on storage.objects;
create policy school_logos_write on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.my_school()
    and public.is_school_admin()
  );

drop policy if exists school_logos_update on storage.objects;
create policy school_logos_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.my_school()
    and public.is_school_admin()
  );

drop policy if exists school_logos_delete on storage.objects;
create policy school_logos_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = public.my_school()
    and public.is_school_admin()
  );
