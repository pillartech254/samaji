-- ============================================================
--  Samaji — MIGRATION 33 :
--   1. Official 8-band CBC grading scale (EE1/EE2/ME1/ME2/AE1/AE2/
--      BE1/BE2, with points) replaces the simplified 4-band demo
--      scheme. The printed report card still only has 4 physical
--      columns (EE/ME/AE/BE) — assets/report-card.js now derives
--      that base band from the first 2 characters of whichever
--      sub-level code matched, so this is purely additive precision.
--   2. Demo assessment types renamed/reordered to the canonical
--      First/Second/Third Test mapping: Opening CAT, Midterm Exam,
--      End of Term. The rest (CAT 2, Assignment, Project, Practical,
--      Portfolio, Observation) become formative (contributes_to_final
--      = false) so they no longer compete for the report card's 3
--      test slots but stay available to record.
--   3. A teacher may now set how many marks a test is "out of"
--      (exams.max_score) for exams they own, while still in draft —
--      narrower than full exam edit rights: a guard trigger blocks a
--      non-admin from changing any other column on that row.
--
--  Safe to run multiple times. Run AFTER setup-modules-32.sql.
-- ============================================================

-- ---------- 1. grading_levels: add points ----------------------
alter table grading_levels add column if not exists points numeric;

-- Reseed the demo school's default CBC Standard Scheme to the
-- official 8-band scale. Any other school that wants this should
-- edit/add bands themselves in Settings → CBC Assessment → Grading
-- Schemes (now has a Points field too).
do $$
declare v_scheme_id uuid;
begin
  select id into v_scheme_id from grading_schemes where school_id = 'SCH-10428' and name = 'CBC Standard Scheme';
  if v_scheme_id is not null then
    delete from grading_levels where scheme_id = v_scheme_id;
    insert into grading_levels (scheme_id, min_score, max_score, grade_label, competency_code, competency_label, remark, points, color, sort) values
      (v_scheme_id, 90, 100, null, 'EE1', 'Exceeding Expectation', 'Outstanding', 4.0, '#067647', 1),
      (v_scheme_id, 75, 89,  null, 'EE2', 'Exceeding Expectation', 'Excellent',   3.5, '#0E9384', 2),
      (v_scheme_id, 58, 74,  null, 'ME1', 'Meeting Expectation',   'Very Good',   3.0, '#4F46E5', 3),
      (v_scheme_id, 41, 57,  null, 'ME2', 'Meeting Expectation',   'Good',        2.5, '#6366F1', 4),
      (v_scheme_id, 31, 40,  null, 'AE1', 'Approaching Expectation','Fair',       2.0, '#B54708', 5),
      (v_scheme_id, 21, 30,  null, 'AE2', 'Approaching Expectation','Fair',       1.5, '#C2680F', 6),
      (v_scheme_id, 11, 20,  null, 'BE1', 'Below Expectation',     'Needs improvement', 1.0, '#B42318', 7),
      -- The source table's lowest band is "1-10"; widened to 0-10 here so a
      -- literal score of 0 still lands in a band instead of matching none.
      (v_scheme_id, 0,  10,  null, 'BE2', 'Below Expectation',     'Needs improvement', 0.5, '#912018', 8);
  end if;
end $$;

-- ---------- 2. assessment_types: canonical First/Second/Third Test --
update assessment_types set name = 'Opening CAT', sort = 1
  where school_id = 'SCH-10428' and name = 'CAT 1';
update assessment_types set sort = 2
  where school_id = 'SCH-10428' and name = 'Midterm Exam';
update assessment_types set name = 'End of Term', sort = 3
  where school_id = 'SCH-10428' and name = 'End Term Exam';
update assessment_types set contributes_to_final = false
  where school_id = 'SCH-10428' and name in ('CAT 2','Assignment','Project','Practical','Portfolio','Observation');

-- ---------- 3. Teacher may edit an exam's max_score only, while draft -
-- Narrower than "teacher can edit exams" (still admin-only for every
-- other field/creation) — matches assets/teacher-modules.js's new
-- editable "out of __ marks" field per test column.
drop policy if exists p_exams_teacher_update_maxscore on exams;
create policy p_exams_teacher_update_maxscore on exams for update to authenticated
  using (exists (
    select 1 from mark_sheets ms join teachers t on t.id = ms.teacher_id
    where ms.id = exams.mark_sheet_id and t.auth_user_id = auth.uid() and ms.status = 'draft'
  ))
  with check (exists (
    select 1 from mark_sheets ms join teachers t on t.id = ms.teacher_id
    where ms.id = exams.mark_sheet_id and t.auth_user_id = auth.uid() and ms.status = 'draft'
  ));

create or replace function guard_exam_teacher_maxscore_only()
returns trigger language plpgsql as $$
begin
  if is_super_admin() or is_school_admin() then
    return new;
  end if;
  -- A non-admin reached this row via p_exams_teacher_update_maxscore —
  -- confirm they only touched max_score, nothing else.
  if new.id <> old.id or new.school_id <> old.school_id or new.name <> old.name
     or new.subject is distinct from old.subject or new.subject_id is distinct from old.subject_id
     or new.class_id is distinct from old.class_id or new.teacher_id is distinct from old.teacher_id
     or new.term <> old.term or new.term_id is distinct from old.term_id
     or new.academic_year_id is distinct from old.academic_year_id
     or new.mark_sheet_id is distinct from old.mark_sheet_id
     or new.assessment_type_id is distinct from old.assessment_type_id
     or new.exam_date is distinct from old.exam_date
     or new.created_at is distinct from old.created_at then
    raise exception 'Teachers may only change how many marks a test is out of (max_score) — everything else about an exam is set by the school admin in Exam Announcements.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_exams_teacher_maxscore_only on exams;
create trigger trg_exams_teacher_maxscore_only
  before update on exams
  for each row execute function guard_exam_teacher_maxscore_only();

-- ---------- GRANTS (idempotent) --------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Verify:
--   select competency_code, min_score, max_score, points from grading_levels gl
--     join grading_schemes s on s.id=gl.scheme_id where s.school_id='SCH-10428' order by gl.sort;
--   select name, sort, contributes_to_final from assessment_types where school_id='SCH-10428' order by sort;
-- Verify (as the assigned teacher, mark sheet status = 'draft'):
--   update exams set max_score = 50 where id = '<exam-id>'  -> should succeed
--   update exams set name = 'x'    where id = '<exam-id>'   -> should raise the guard exception
