-- ============================================================
--  Samaji — MIGRATION 42 : attendance can only ever be WRITTEN by a
--  teacher — not by an admin at all, not even for today.
--
--  Refines setup-modules-41.sql. That migration let both teacher and
--  admin write today's attendance, only blocking writes to past
--  dates. The actual intent, clarified directly: admin should never
--  be able to write attendance at all, today included — marking and
--  adjusting attendance is exclusively a teacher responsibility.
--  Admin's role narrows to read-only, unconditionally, for both
--  school_admin and super_admin — no admin tier is exempt, matching
--  how setup-modules-41.sql already applied its own restriction
--  universally rather than carving out an exception for either.
--
--  A genuine support correction to historical data still has a
--  legitimate path (direct SQL/service-role access, which bypasses
--  RLS entirely) — this doesn't remove Pillartech's ability to fix a
--  real data error, it just means the app itself never offers admin
--  a way to write attendance through the ordinary UI, at any tier.
--
--  p_att_admin_insert/update/delete (setup-modules-41.sql) are
--  dropped outright, not narrowed further — there's no remaining
--  case where admin should write this table. p_att_admin_read is
--  untouched: viewing attendance (reports, dashboards, browsing by
--  date) still works exactly as before.
--
--  Safe to run multiple times. Run AFTER setup-modules-41.sql.
-- ============================================================

drop policy if exists p_att_admin_insert on attendance;
drop policy if exists p_att_admin_update on attendance;
drop policy if exists p_att_admin_delete on attendance;
