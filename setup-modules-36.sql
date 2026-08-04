-- ============================================================
-- setup-modules-36.sql
-- CBC/CBE Phase 2: subject & pathway catalog.
--
-- Purely additive; extends the existing subjects/school_classes
-- tables rather than replacing them, and keeps class_subjects /
-- class_subject_teachers untouched (still the source of truth for
-- "which subjects does THIS class actually take"). This phase adds:
--   1. Richer subject metadata: learning_area, department,
--      is_compulsory/is_optional, total_competencies, and
--      applicable_grades (mirrors assessment_types.applicable_grades
--      — a filter hint for which classes a subject is normally
--      offered to, not an enforcement constraint).
--   2. pathways -- the 3 Senior School (Grade 10-12) pathways
--      (STEM, Social Sciences, Arts & Sports Science), admin-
--      configurable per school rather than hardcoded, since MoE
--      pathway names/count could change.
--   3. senior_school_subjects -- normalized many-to-many between
--      subjects and pathways (a subject like Mathematics can be
--      core in one pathway and absent from another; a subject can
--      belong to more than one pathway, so a single FK column on
--      subjects would not fit).
--   4. school_classes.pathway_id -- optional tag for Senior School
--      classes/streams so the roster and subject-assignment UI know
--      which pathway's subjects to offer.
-- ============================================================

-- ---------- 1. RICHER SUBJECT METADATA --------------------------
alter table subjects add column if not exists learning_area text;
alter table subjects add column if not exists department text;
alter table subjects add column if not exists is_compulsory boolean not null default true;
alter table subjects add column if not exists is_optional boolean not null default false;
alter table subjects add column if not exists total_competencies integer;
alter table subjects add column if not exists applicable_grades text[];

-- ---------- 2. PATHWAYS (Senior School) --------------------------
create table if not exists pathways (
  id          uuid primary key default gen_random_uuid(),
  school_id   text not null references schools(id) on delete cascade,
  name        text not null,
  code        text,
  description text,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);
create index if not exists pathways_school_idx on pathways(school_id);

-- ---------- 3. SUBJECT <-> PATHWAY (normalized many-to-many) ----
create table if not exists senior_school_subjects (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references subjects(id) on delete cascade,
  pathway_id  uuid not null references pathways(id) on delete cascade,
  is_core     boolean not null default false,
  cluster     text,                       -- e.g. "Pure Sciences", "Applied Sciences"
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (subject_id, pathway_id)
);
create index if not exists sss_subject_idx  on senior_school_subjects(subject_id);
create index if not exists sss_pathway_idx  on senior_school_subjects(pathway_id);

-- ---------- 4. TAG A CLASS WITH ITS PATHWAY (optional) -----------
alter table school_classes add column if not exists pathway_id uuid references pathways(id) on delete set null;
create index if not exists school_classes_pathway_idx on school_classes(pathway_id) where pathway_id is not null;

-- ---------- 5. RLS ------------------------------------------------
alter table pathways               enable row level security;
alter table senior_school_subjects enable row level security;

drop policy if exists p_pathways_admin_rw on pathways;
create policy p_pathways_admin_rw on pathways for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));
drop policy if exists p_pathways_read on pathways;
create policy p_pathways_read on pathways for select to authenticated
  using (school_id = my_school());

-- senior_school_subjects has no school_id of its own — scope through its pathway.
drop policy if exists p_sss_admin_rw on senior_school_subjects;
create policy p_sss_admin_rw on senior_school_subjects for all to authenticated
  using (exists (select 1 from pathways p where p.id = pathway_id and (is_super_admin() or (p.school_id = my_school() and is_school_admin()))))
  with check (exists (select 1 from pathways p where p.id = pathway_id and (is_super_admin() or (p.school_id = my_school() and is_school_admin()))));
drop policy if exists p_sss_read on senior_school_subjects;
create policy p_sss_read on senior_school_subjects for select to authenticated
  using (exists (select 1 from pathways p where p.id = pathway_id and p.school_id = my_school()));

-- ---------- 6. GRANTS (idempotent) -------------------------------
grant select, insert, update, delete on pathways               to authenticated;
grant select, insert, update, delete on senior_school_subjects to authenticated;
