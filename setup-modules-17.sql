-- ============================================================
--  Samaji — MIGRATION 17 : CBC Assessment Engine, Phase 3 (thin)
--  + learner ratings (competencies / values / psychomotor)
--
--  Deliberately trimmed: skips Submitted/Verified/Approved as
--  separate gated actions for now — a Principal or Deputy
--  Principal can publish a mark sheet directly (or unpublish it to
--  make corrections), matching the spec's "Only Principal or
--  Headteacher can Publish... unless Principal unlocks results."
--  The fuller multi-stage workflow can be layered on top later
--  without breaking this.
--  Safe to run multiple times. Run AFTER setup-modules-16.sql.
-- ============================================================

-- ---------- 1. PUBLISH AUDIT TRAIL ------------------------------
alter table mark_sheets add column if not exists published_at timestamptz;
alter table mark_sheets add column if not exists published_by uuid references teachers(id) on delete set null;

-- ---------- 1b. TEACHER DIRECTORY READ FOR ALL STAFF -----------
-- Teachers previously could only read their OWN row (RLS from
-- migration 14), which blocks resolving another teacher's name for
-- things like "Class Teacher: Jane Wambui" on a report card. Name/
-- email/phone/position aren't sensitive like payroll, so — matching
-- the same-school-read pattern already used for subjects/classes —
-- open read to the whole school.
drop policy if exists p_teachers_school_read on teachers;
create policy p_teachers_school_read on teachers for select to authenticated
  using (school_id = my_school());

-- ---------- 2. PUBLISHER HELPER ---------------------------------
create or replace function is_publisher()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from teachers where auth_user_id = auth.uid() and school_position in ('principal','deputy_principal'));
$$;
grant execute on function is_publisher() to authenticated;

-- ---------- 3. RLS: a Principal/Deputy may read & publish/unpublish
--  ANY mark sheet in their school (not just ones they teach) --------
drop policy if exists p_marksheets_publisher_read on mark_sheets;
create policy p_marksheets_publisher_read on mark_sheets for select to authenticated
  using (school_id = my_school() and is_publisher());

drop policy if exists p_marksheets_publish on mark_sheets;
create policy p_marksheets_publish on mark_sheets for update to authenticated
  using (school_id = my_school() and is_publisher())
  with check (school_id = my_school() and is_publisher());

-- ---------- 4. LEARNER RATINGS -----------------------------------
-- One unified table for competencies, values and psychomotor skills
-- (same shape, avoids three near-duplicate tables/policies/UIs).
-- level_code matches a grading_levels.competency_code from the
-- school's grading scheme (EE/ME/AE/BE) rather than a raw score,
-- since these are holistic judgements, not numeric assessments.
create table if not exists learner_ratings (
  id               uuid primary key default gen_random_uuid(),
  school_id        text not null references schools(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  term_id          uuid not null references terms(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  category         text not null check (category in ('competency','value','psychomotor')),
  item_name        text not null,                -- 'Communication', 'Respect', 'Sports'...
  level_code       text,                          -- 'EE' | 'ME' | 'AE' | 'BE'
  created_at       timestamptz not null default now(),
  unique (student_id, term_id, academic_year_id, category, item_name)
);
create index if not exists learner_ratings_school_idx on learner_ratings(school_id);
create index if not exists learner_ratings_student_idx on learner_ratings(student_id, term_id, academic_year_id);

alter table learner_ratings enable row level security;

drop policy if exists p_learner_ratings_admin_rw on learner_ratings;
create policy p_learner_ratings_admin_rw on learner_ratings for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));

-- Only the recorded class teacher of the student's class may rate them
-- (competencies/values/psychomotor are holistic, not subject-specific).
drop policy if exists p_learner_ratings_classteacher_rw on learner_ratings;
create policy p_learner_ratings_classteacher_rw on learner_ratings for all to authenticated
  using (exists (
    select 1 from students st join school_classes sc on sc.id = st.class_id
    join teachers t on t.id = sc.class_teacher_id
    where st.id = learner_ratings.student_id and t.auth_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from students st join school_classes sc on sc.id = st.class_id
    join teachers t on t.id = sc.class_teacher_id
    where st.id = learner_ratings.student_id and t.auth_user_id = auth.uid()
  ));

drop policy if exists p_learner_ratings_read on learner_ratings;
create policy p_learner_ratings_read on learner_ratings for select to authenticated
  using (school_id = my_school());

-- ---------- 5. OVERALL REMARKS -----------------------------------
-- One holistic remark per student per term from the class teacher,
-- and one from the principal — the two free-text boxes on the card.
create table if not exists report_remarks (
  id               uuid primary key default gen_random_uuid(),
  school_id        text not null references schools(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  term_id          uuid not null references terms(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  teacher_remark   text,
  principal_remark text,
  created_at       timestamptz not null default now(),
  unique (student_id, term_id, academic_year_id)
);
create index if not exists report_remarks_school_idx on report_remarks(school_id);

alter table report_remarks enable row level security;

drop policy if exists p_report_remarks_admin_rw on report_remarks;
create policy p_report_remarks_admin_rw on report_remarks for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));

drop policy if exists p_report_remarks_classteacher_rw on report_remarks;
create policy p_report_remarks_classteacher_rw on report_remarks for all to authenticated
  using (exists (
    select 1 from students st join school_classes sc on sc.id = st.class_id
    join teachers t on t.id = sc.class_teacher_id
    where st.id = report_remarks.student_id and t.auth_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from students st join school_classes sc on sc.id = st.class_id
    join teachers t on t.id = sc.class_teacher_id
    where st.id = report_remarks.student_id and t.auth_user_id = auth.uid()
  ));

-- A Principal/Deputy may add their own remark to any student's report,
-- without needing to also be that class's class teacher.
drop policy if exists p_report_remarks_publisher_rw on report_remarks;
create policy p_report_remarks_publisher_rw on report_remarks for all to authenticated
  using (school_id = my_school() and is_publisher())
  with check (school_id = my_school() and is_publisher());

drop policy if exists p_report_remarks_read on report_remarks;
create policy p_report_remarks_read on report_remarks for select to authenticated
  using (school_id = my_school());

-- ---------- 6. GRANTS (idempotent) --------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Verify:
--   select id, school_position from teachers where school_position is not null;
--   select * from learner_ratings limit 20;
