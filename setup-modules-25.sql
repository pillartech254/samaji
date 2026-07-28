-- ============================================================
--  Samaji — MIGRATION 25 : FIFTH SECURITY FIX, same audit,
--  same bug class as setup-modules-23/24.sql.
--
--  subjects, class_subjects, and class_subject_teachers
--  (setup-modules-10.sql) had the same "is_super_admin() or
--  school_id = my_school()" policy with no is_school_admin()
--  check — any parent or teacher could add/edit/delete subjects
--  or reassign which teacher teaches which class+subject.
--  (teachers itself was already fixed properly in
--  setup-modules-14.sql, which is why it isn't here.)
--
--  Checked assets/teacher-modules.js and parent/index.html: both
--  only ever SELECT these three tables, never write them, so
--  read stays open school-wide and only write becomes admin-only.
--
--  Safe to run multiple times. Run AFTER setup-modules-24.sql.
-- ============================================================

drop policy if exists p_subjects_rw on subjects;
drop policy if exists p_subjects_admin_rw on subjects;
create policy p_subjects_admin_rw on subjects for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_subjects_read on subjects;
create policy p_subjects_read on subjects for select to authenticated
  using (school_id = my_school());

drop policy if exists p_class_subjects_rw on class_subjects;
drop policy if exists p_class_subjects_admin_rw on class_subjects;
create policy p_class_subjects_admin_rw on class_subjects for all to authenticated
  using (exists (select 1 from school_classes c where c.id = class_id
    and (is_super_admin() or (c.school_id = my_school() and is_school_admin()))))
  with check (exists (select 1 from school_classes c where c.id = class_id
    and (is_super_admin() or (c.school_id = my_school() and is_school_admin()))));
drop policy if exists p_class_subjects_read on class_subjects;
create policy p_class_subjects_read on class_subjects for select to authenticated
  using (exists (select 1 from school_classes c where c.id = class_id and c.school_id = my_school()));

drop policy if exists p_cst_rw on class_subject_teachers;
drop policy if exists p_cst_admin_rw on class_subject_teachers;
create policy p_cst_admin_rw on class_subject_teachers for all to authenticated
  using (exists (select 1 from school_classes c where c.id = class_id
    and (is_super_admin() or (c.school_id = my_school() and is_school_admin()))))
  with check (exists (select 1 from school_classes c where c.id = class_id
    and (is_super_admin() or (c.school_id = my_school() and is_school_admin()))));
drop policy if exists p_cst_read on class_subject_teachers;
create policy p_cst_read on class_subject_teachers for select to authenticated
  using (exists (select 1 from school_classes c where c.id = class_id and c.school_id = my_school()));
