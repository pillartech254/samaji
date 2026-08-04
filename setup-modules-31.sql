-- ============================================================
--  Samaji — MIGRATION 31 : exam creation becomes admin-only
--  ("Exam Announcements"). A teacher may still read every mark
--  sheet/exam assigned to them, and enter/edit exam_results for it —
--  but ONLY while it's still in 'draft', and only for exams that
--  already exist. Teachers can no longer insert/update/delete
--  mark_sheets or exams at all (previously migration 16/23 let a
--  teacher silently create their own mark sheet + exam rows the
--  first time they saved a score in Marks & Grading).
--
--  Matches the School Portal's new "Exam Announcements" screen
--  (assets/school-academics.js), which is now the only place exams
--  get created — admins already had full CRUD on mark_sheets/exams
--  via p_marksheets_admin_rw / p_exams_admin_rw (migration 16/23),
--  so no change needed there.
--
--  Safe to run multiple times. Run AFTER setup-modules-30.sql.
-- ============================================================

-- ---------- 1. mark_sheets: teacher loses write, keeps read --------
drop policy if exists p_marksheets_teacher_rw on mark_sheets;
drop policy if exists p_marksheets_teacher_read on mark_sheets;
create policy p_marksheets_teacher_read on mark_sheets for select to authenticated
  using (teacher_id in (select id from teachers where auth_user_id = auth.uid()));

-- ---------- 2. exams: teacher loses write, keeps read ---------------
drop policy if exists p_exams_teacher_rw on exams;
drop policy if exists p_exams_teacher_read on exams;
create policy p_exams_teacher_read on exams for select to authenticated
  using (exists (
    select 1 from mark_sheets ms join teachers t on t.id = ms.teacher_id
    where ms.id = exams.mark_sheet_id and t.auth_user_id = auth.uid()
  ));

-- ---------- 3. exam_results: teacher keeps read anytime, but write --
-- ---------- (insert/update) only while the mark sheet is 'draft' ----
drop policy if exists p_exres_teacher_rw on exam_results;
drop policy if exists p_exres_teacher_read on exam_results;
drop policy if exists p_exres_teacher_insert on exam_results;
drop policy if exists p_exres_teacher_update on exam_results;

create policy p_exres_teacher_read on exam_results for select to authenticated
  using (exists (
    select 1 from exams e join mark_sheets ms on ms.id = e.mark_sheet_id
    join teachers t on t.id = ms.teacher_id
    where e.id = exam_results.exam_id and t.auth_user_id = auth.uid()
  ));

create policy p_exres_teacher_insert on exam_results for insert to authenticated
  with check (exists (
    select 1 from exams e join mark_sheets ms on ms.id = e.mark_sheet_id
    join teachers t on t.id = ms.teacher_id
    where e.id = exam_results.exam_id and t.auth_user_id = auth.uid() and ms.status = 'draft'
  ));

create policy p_exres_teacher_update on exam_results for update to authenticated
  using (exists (
    select 1 from exams e join mark_sheets ms on ms.id = e.mark_sheet_id
    join teachers t on t.id = ms.teacher_id
    where e.id = exam_results.exam_id and t.auth_user_id = auth.uid() and ms.status = 'draft'
  ))
  with check (exists (
    select 1 from exams e join mark_sheets ms on ms.id = e.mark_sheet_id
    join teachers t on t.id = ms.teacher_id
    where e.id = exam_results.exam_id and t.auth_user_id = auth.uid() and ms.status = 'draft'
  ));

-- ---------- 4. GRANTS (idempotent) ----------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Verify (as a teacher who is NOT assigned to a class+subject):
--   insert into mark_sheets (...) -> should fail (no insert policy for teacher role)
--   insert into exams (...)       -> should fail
-- Verify (as the assigned teacher, mark sheet status = 'published'):
--   update exam_results set score = 99 where ... -> should fail (status != 'draft')
--   select from exam_results ...                  -> should still succeed
