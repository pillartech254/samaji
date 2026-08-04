-- ============================================================
-- setup-modules-35.sql
-- CBC/CBE Phase 1: assessment engine core.
--
-- Purely additive. Does not touch mark_sheets/exams/exam_results
-- or any currently-working marks-entry/report-card runtime path.
-- This phase only extends the *configuration* layer:
--   1. assessment_type_subjects  -- normalized "applicable subjects"
--      for an assessment type (replaces nothing; the existing
--      applicable_grades text[] column stays as-is for grade scoping,
--      which is a small fixed set and doesn't warrant a join table).
--   2. assessment_types.show_on_report_card -- distinct from
--      contributes_to_final: an assessment can count toward the
--      weighted score without being one of the printed test columns
--      (e.g. a portfolio review that feeds the overall grade but
--      isn't itself printed), and vice versa.
--   3. competency_levels -- a school-wide, reusable catalog of
--      competency levels (EE/ME/AE/BE today, but schools/MoE may
--      change labels), decoupled from any one grading scheme's
--      percentage bands. Groundwork for future direct/scoreless
--      competency assignment (PP1-G3 "no ranking" requirement);
--      not wired into scoring yet.
--   4. grading_levels.competency_level_id -- optional FK linking a
--      score band to a catalog entry, fully backward compatible
--      with the existing denormalized competency_code/label columns.
-- ============================================================

-- ---------- 1. ASSESSMENT TYPE <-> SUBJECT (normalized) --------
create table if not exists assessment_type_subjects (
  id                 uuid primary key default gen_random_uuid(),
  assessment_type_id uuid not null references assessment_types(id) on delete cascade,
  subject_id         uuid not null references subjects(id) on delete cascade,
  created_at         timestamptz not null default now(),
  unique (assessment_type_id, subject_id)
);
create index if not exists ats_type_idx    on assessment_type_subjects(assessment_type_id);
create index if not exists ats_subject_idx on assessment_type_subjects(subject_id);

-- ---------- 2. SHOW ON REPORT CARD ------------------------------
alter table assessment_types add column if not exists show_on_report_card boolean not null default true;

-- ---------- 3. COMPETENCY LEVELS CATALOG ------------------------
create table if not exists competency_levels (
  id          uuid primary key default gen_random_uuid(),
  school_id   text not null references schools(id) on delete cascade,
  code        text not null,
  label       text not null,
  description text,
  color       text,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (school_id, code)
);
create index if not exists competency_levels_school_idx on competency_levels(school_id);

-- ---------- 4. LINK GRADING BANDS TO CATALOG (optional) --------
alter table grading_levels add column if not exists competency_level_id uuid references competency_levels(id) on delete set null;
create index if not exists grading_levels_competency_idx on grading_levels(competency_level_id) where competency_level_id is not null;

-- ---------- 5. RLS ------------------------------------------------
alter table assessment_type_subjects enable row level security;
alter table competency_levels        enable row level security;

-- assessment_type_subjects has no school_id of its own — scope through assessment_types.
drop policy if exists p_ats_admin_rw on assessment_type_subjects;
create policy p_ats_admin_rw on assessment_type_subjects for all to authenticated
  using (exists (select 1 from assessment_types t where t.id = assessment_type_id and (is_super_admin() or (t.school_id = my_school() and is_school_admin()))))
  with check (exists (select 1 from assessment_types t where t.id = assessment_type_id and (is_super_admin() or (t.school_id = my_school() and is_school_admin()))));
drop policy if exists p_ats_read on assessment_type_subjects;
create policy p_ats_read on assessment_type_subjects for select to authenticated
  using (exists (select 1 from assessment_types t where t.id = assessment_type_id and t.school_id = my_school()));

-- competency_levels: same admin-write / school-read pattern as assessment_types/grading_schemes.
drop policy if exists p_competency_levels_admin_rw on competency_levels;
create policy p_competency_levels_admin_rw on competency_levels for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_competency_levels_read on competency_levels;
create policy p_competency_levels_read on competency_levels for select to authenticated
  using (school_id = my_school());

-- ---------- 6. GRANTS (idempotent) -------------------------------
grant select, insert, update, delete on assessment_type_subjects to authenticated;
grant select, insert, update, delete on competency_levels        to authenticated;
