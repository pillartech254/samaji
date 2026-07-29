-- ============================================================
--  Samaji — MIGRATION 23 : THIRD SECURITY FIX, found while
--  continuing the audit after setup-modules-21/22.sql.
--
--  19 tables had a single "for all to authenticated using (school_id
--  = my_school())" policy and NOTHING else — i.e. full read/write/
--  delete for ANY authenticated user in the school (every parent,
--  every teacher), not just admins. Because RLS policies are additive
--  (if any policy permits an action, it's allowed), this made the
--  narrower policies elsewhere on the same tables (e.g. the
--  guardian_phone-scoped parent read on students) provide no real
--  protection at all — the broad policy already allowed everything.
--
--  Checked assets/teacher-modules.js and parent/index.html against
--  every affected table before writing this, so the fix matches what
--  each portal actually reads/writes today:
--    - api_keys, webhooks, biometric_devices, biometric_enrollments,
--      sms_credit_ledger, sms_messages, library_books, library_loans,
--      timetable_slots, transport_routes/vehicles/assignments, grades
--      (superseded by exam_results), fee_invoices (superseded by
--      fee_structures/fee_payments, confirmed dead code in
--      school-modules.js): NO non-admin portal touches these at all
--      (verified by grep) -> admin-only, full stop.
--    - announcements: parent portal reads these (SELECT) -> keep read
--      open school-wide, restrict write to admins.
--    - attendance, exam_results, exams: the Teacher Portal genuinely
--      writes these (attendance.upsert, exam_results.upsert) -> keep
--      teacher write, but scope it to classes/mark sheets they're
--      actually assigned to instead of the whole school. Parent
--      Portal reads attendance for its own children -> add that back
--      explicitly (guardian_phone-scoped, same pattern as the
--      existing fee_payments parent policy).
--    - students: keep read open school-wide (teachers already relied
--      on broad read across several screens) but remove write from
--      non-admins — student record CRUD is an admin-only action in
--      every portal's UI already.
--
--  Safe to run multiple times. Run AFTER setup-modules-22.sql.
-- ============================================================

-- ---------- Admin-only tables: no non-admin portal touches these ----
do $$
declare t text;
begin
  foreach t in array array[
    'api_keys','webhooks','biometric_devices','biometric_enrollments',
    'sms_credit_ledger','sms_messages','library_books','library_loans',
    'timetable_slots','transport_routes','transport_vehicles',
    'transport_assignments','grades','fee_invoices'
  ] loop
    execute format('drop policy if exists p_%1$s_rw on %2$s;',
      case t
        when 'api_keys' then 'apikeys' when 'transport_routes' then 'troutes'
        when 'transport_vehicles' then 'tveh' when 'transport_assignments' then 'tassign'
        when 'sms_credit_ledger' then 'smsledger' when 'sms_messages' then 'smsmsg'
        when 'library_books' then 'books' when 'library_loans' then 'loans'
        when 'timetable_slots' then 'tt' when 'biometric_devices' then 'biodev'
        when 'biometric_enrollments' then 'bioenr' when 'fee_invoices' then 'fees'
        else t end, t);
    execute format('drop policy if exists p_%1$s_admin_rw on %1$s;', t);
    execute format(
      'create policy p_%1$s_admin_rw on %1$s for all to authenticated
         using (is_super_admin() or (school_id = my_school() and is_school_admin()))
         with check (is_super_admin() or (school_id = my_school() and is_school_admin()));', t);
  end loop;
end $$;

-- ---------- announcements: admin write, whole-school read -----------
drop policy if exists p_ann_rw on announcements;
drop policy if exists p_ann_admin_rw on announcements;
create policy p_ann_admin_rw on announcements for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_ann_read on announcements;
create policy p_ann_read on announcements for select to authenticated
  using (school_id = my_school());

-- ---------- students: admin write, whole-school read -----------------
-- (parent's own-children read already exists as p_students_parent,
-- separate from and in addition to this broader school-wide read)
drop policy if exists p_students_rw on students;
drop policy if exists p_students_admin_rw on students;
create policy p_students_admin_rw on students for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_students_read on students;
create policy p_students_read on students for select to authenticated
  using (school_id = my_school());

-- ---------- attendance: admin full access; teacher scoped to their --
-- ---------- assigned classes; parent read-only for their children ---
drop policy if exists p_att_rw on attendance;
drop policy if exists p_att_admin_rw on attendance;
create policy p_att_admin_rw on attendance for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));

drop policy if exists p_att_teacher_rw on attendance;
create policy p_att_teacher_rw on attendance for all to authenticated
  using (exists (
    select 1 from students s
    join class_subject_teachers cst on cst.class_id = s.class_id
    join teachers t on t.id = cst.teacher_id
    where s.id = attendance.student_id and t.auth_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from students s
    join class_subject_teachers cst on cst.class_id = s.class_id
    join teachers t on t.id = cst.teacher_id
    where s.id = attendance.student_id and t.auth_user_id = auth.uid()
  ));

drop policy if exists p_att_parent_read on attendance;
create policy p_att_parent_read on attendance for select to authenticated
  using (exists (
    select 1 from students s
    join parent_accounts pa on pa.phone = s.guardian_phone and pa.school_id = s.school_id
    where s.id = attendance.student_id and pa.id = auth.uid()
  ));

-- ---------- exams / exam_results: admin full access; teacher scoped -
-- ---------- to mark sheets assigned to them --------------------------
drop policy if exists p_exams_rw on exams;
drop policy if exists p_exams_admin_rw on exams;
create policy p_exams_admin_rw on exams for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_exams_teacher_rw on exams;
create policy p_exams_teacher_rw on exams for all to authenticated
  using (exists (
    select 1 from mark_sheets ms join teachers t on t.id = ms.teacher_id
    where ms.id = exams.mark_sheet_id and t.auth_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from mark_sheets ms join teachers t on t.id = ms.teacher_id
    where ms.id = exams.mark_sheet_id and t.auth_user_id = auth.uid()
  ));

drop policy if exists p_exres_rw on exam_results;
drop policy if exists p_exres_admin_rw on exam_results;
create policy p_exres_admin_rw on exam_results for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_exres_teacher_rw on exam_results;
create policy p_exres_teacher_rw on exam_results for all to authenticated
  using (exists (
    select 1 from exams e join mark_sheets ms on ms.id = e.mark_sheet_id
    join teachers t on t.id = ms.teacher_id
    where e.id = exam_results.exam_id and t.auth_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from exams e join mark_sheets ms on ms.id = e.mark_sheet_id
    join teachers t on t.id = ms.teacher_id
    where e.id = exam_results.exam_id and t.auth_user_id = auth.uid()
  ));
