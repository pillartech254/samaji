-- ============================================================
--  Samaji — MIGRATION 41 : attendance can only ever be written
--  for today — not adjusted afterward, by anyone, including the
--  school admin.
--
--  Requested directly: once a teacher saves the register for a day,
--  nobody — including the school admin — should be able to go back
--  and change it. Only today's register stays editable; every
--  earlier date is frozen the moment it stops being today.
--
--  No new "submitted" flag or table needed for this — the rule the
--  person actually described is simpler than a submit/lock workflow:
--  editability is purely a function of on_date being today or not.
--  The moment a date is no longer today, it's frozen automatically,
--  for everyone, with no separate "submit" action required to
--  trigger it.
--
--  p_att_admin_rw and p_att_teacher_rw were both `for all` policies —
--  one `using`/`with check` pair covering SELECT, INSERT, UPDATE, and
--  DELETE together. Adding on_date = today to a `for all` policy's
--  `using` clause would have blocked SELECT too, making past
--  attendance invisible, not just uneditable — the opposite of what
--  was asked (past dates should show, greyed out, not disappear).
--  Split into separate per-command policies instead: SELECT stays
--  exactly as unrestricted as before; INSERT/UPDATE/DELETE gain the
--  today-only restriction.
--
--  Uses Africa/Nairobi as the reference "today", not the database
--  server's own (UTC) calendar date — Postgres's bare current_date
--  is UTC, and Nairobi is UTC+3, so a bare current_date comparison
--  would flip to "tomorrow" a school's actual afternoon while UTC is
--  still on today's date, incorrectly blocking a same-day save.
--
--  Safe to run multiple times. Run AFTER setup-modules-40.sql.
-- ============================================================

create or replace function is_today_nairobi(d date)
returns boolean language sql stable as $$
  select d = (now() at time zone 'Africa/Nairobi')::date;
$$;

-- ---------- admin: unrestricted read; write only for today ----------
drop policy if exists p_att_admin_rw on attendance;

create policy p_att_admin_read on attendance for select to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()));

create policy p_att_admin_insert on attendance for insert to authenticated
  with check ((is_super_admin() or (school_id = my_school() and is_school_admin())) and is_today_nairobi(on_date));

create policy p_att_admin_update on attendance for update to authenticated
  using ((is_super_admin() or (school_id = my_school() and is_school_admin())) and is_today_nairobi(on_date))
  with check ((is_super_admin() or (school_id = my_school() and is_school_admin())) and is_today_nairobi(on_date));

create policy p_att_admin_delete on attendance for delete to authenticated
  using ((is_super_admin() or (school_id = my_school() and is_school_admin())) and is_today_nairobi(on_date));

-- ---------- teacher: unrestricted read of their own classes; write only for today ----------
drop policy if exists p_att_teacher_rw on attendance;

create policy p_att_teacher_read on attendance for select to authenticated
  using (exists (
    select 1 from students s
    join class_subject_teachers cst on cst.class_id = s.class_id
    join teachers t on t.id = cst.teacher_id
    where s.id = attendance.student_id and t.auth_user_id = auth.uid()
  ));

create policy p_att_teacher_insert on attendance for insert to authenticated
  with check (
    is_today_nairobi(on_date)
    and exists (
      select 1 from students s
      join class_subject_teachers cst on cst.class_id = s.class_id
      join teachers t on t.id = cst.teacher_id
      where s.id = attendance.student_id and t.auth_user_id = auth.uid()
    )
  );

create policy p_att_teacher_update on attendance for update to authenticated
  using (
    is_today_nairobi(on_date)
    and exists (
      select 1 from students s
      join class_subject_teachers cst on cst.class_id = s.class_id
      join teachers t on t.id = cst.teacher_id
      where s.id = attendance.student_id and t.auth_user_id = auth.uid()
    )
  )
  with check (
    is_today_nairobi(on_date)
    and exists (
      select 1 from students s
      join class_subject_teachers cst on cst.class_id = s.class_id
      join teachers t on t.id = cst.teacher_id
      where s.id = attendance.student_id and t.auth_user_id = auth.uid()
    )
  );

create policy p_att_teacher_delete on attendance for delete to authenticated
  using (
    is_today_nairobi(on_date)
    and exists (
      select 1 from students s
      join class_subject_teachers cst on cst.class_id = s.class_id
      join teachers t on t.id = cst.teacher_id
      where s.id = attendance.student_id and t.auth_user_id = auth.uid()
    )
  );
