-- ============================================================
--  Samaji — MIGRATION 45 : maintenance mode
--
--  Requested directly: from the super_admin account, a toggle that
--  puts every portal into a maintenance state — blocking login on
--  school/teacher/parent entirely, and on the admin console for
--  every role EXCEPT super_admin itself (so whoever turned it on can
--  always get back in to turn it back off; admin/index.html already
--  serves more than one platform-level role — billing_admin, support,
--  etc, per its own CUR_ROLE comment — and only super_admin should
--  bypass this, not every role that happens to log into that portal).
--
--  Single-row table (id is fixed at 1, enforced below) rather than a
--  generic key-value settings table — there's exactly one setting
--  here, and a fixed-id row is simpler to read/write than a key
--  lookup for that.
--
--  RLS is deliberately asymmetric: SELECT is open to anyone,
--  including anonymous/unauthenticated requests. The maintenance
--  flag has to be checked as part of each portal's own boot flow —
--  right alongside where it already fetches the signed-in user's own
--  profile/role — which happens with an authenticated session by
--  that point, but the check needs to work reliably regardless, so
--  it's not gated behind any role check the way the actual toggle
--  (UPDATE) is. There's nothing sensitive in a single boolean and a
--  message string — nothing here to protect by restricting reads.
--
--  Safe to run multiple times.
-- ============================================================

create table if not exists platform_settings (
  id                integer primary key default 1,
  maintenance_mode  boolean not null default false,
  maintenance_message text,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id),
  constraint platform_settings_singleton check (id = 1)
);

insert into platform_settings (id, maintenance_mode)
  values (1, false)
  on conflict (id) do nothing;

alter table platform_settings enable row level security;

drop policy if exists p_platform_settings_read on platform_settings;
create policy p_platform_settings_read on platform_settings for select
  to anon, authenticated
  using (true);

drop policy if exists p_platform_settings_write on platform_settings;
create policy p_platform_settings_write on platform_settings for update
  to authenticated
  using (is_super_admin())
  with check (is_super_admin());

grant select on platform_settings to anon, authenticated;
grant update (maintenance_mode, maintenance_message, updated_at, updated_by) on platform_settings to authenticated;
