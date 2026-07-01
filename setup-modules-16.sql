-- ============================================================
--  Samaji — MIGRATION 16 : CBC Assessment Engine, Phase 2
--  Mark sheets + wiring the existing exams/exam_results tables
--  into the Phase 1 config (assessment types, terms, years).
--  Purely additive — the admin's existing "Exams" module keeps
--  working exactly as before (all new columns are nullable).
--  Safe to run multiple times. Run AFTER setup-modules-15.sql.
-- ============================================================

-- ---------- 1. MARK SHEETS -------------------------------------
-- The workflow container for one class+subject+term+year. Each
-- assessment type a teacher records (CAT 1, Project, ...) becomes
-- one `exams` row tagged with this mark sheet's id. Publishing
-- workflow (Phase 3) will drive `status` through
-- draft -> submitted -> verified -> approved -> published.
create table if not exists mark_sheets (
  id               uuid primary key default gen_random_uuid(),
  school_id        text not null references schools(id) on delete cascade,
  class_id         uuid not null references school_classes(id) on delete cascade,
  subject_id       uuid not null references subjects(id) on delete cascade,
  term_id          uuid not null references terms(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  teacher_id       uuid references teachers(id) on delete set null,
  status           text not null default 'draft' check (status in ('draft','submitted','verified','approved','published')),
  created_at       timestamptz not null default now(),
  unique (class_id, subject_id, term_id, academic_year_id)
);
create index if not exists mark_sheets_school_idx on mark_sheets(school_id);
create index if not exists mark_sheets_teacher_idx on mark_sheets(teacher_id);

-- ---------- 2. WIRE `exams` INTO A MARK SHEET + ASSESSMENT TYPE -
alter table exams add column if not exists mark_sheet_id     uuid references mark_sheets(id) on delete cascade;
alter table exams add column if not exists assessment_type_id uuid references assessment_types(id) on delete set null;
alter table exams add column if not exists academic_year_id  uuid references academic_years(id) on delete set null;
alter table exams add column if not exists term_id           uuid references terms(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exams_marksheet_type_uniq') then
    alter table exams add constraint exams_marksheet_type_uniq unique (mark_sheet_id, assessment_type_id);
  end if;
end $$;

-- ---------- 3. COLOR PER GRADING BAND ---------------------------
-- Lets a school customize the badge color per band (defaults to a
-- sensible traffic-light palette on the seeded CBC scheme below).
alter table grading_levels add column if not exists color text;
update grading_levels set color = case competency_code
    when 'EE' then '#067647' when 'ME' then '#4F46E5'
    when 'AE' then '#B54708' when 'BE' then '#B42318'
    else '#475467' end
  where color is null;

-- ---------- 4. RLS -----------------------------------------------
alter table mark_sheets enable row level security;

drop policy if exists p_marksheets_admin_rw on mark_sheets;
create policy p_marksheets_admin_rw on mark_sheets for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));

-- A teacher may create/edit ONLY their own mark sheets, for a
-- class+subject they're actually assigned to teach (class_subject_teachers),
-- and only while still in draft — once it moves past draft, Phase 3's
-- workflow takes over and this policy no longer grants write access.
drop policy if exists p_marksheets_teacher_rw on mark_sheets;
create policy p_marksheets_teacher_rw on mark_sheets for all to authenticated
  using (
    status = 'draft' and teacher_id in (select id from teachers where auth_user_id = auth.uid())
    and exists (select 1 from class_subject_teachers cst
                where cst.class_id = mark_sheets.class_id and cst.subject_id = mark_sheets.subject_id
                  and cst.teacher_id = mark_sheets.teacher_id)
  )
  with check (
    status = 'draft' -- a teacher can only ever write a draft row here; Phase 3 owns every other transition
    and teacher_id in (select id from teachers where auth_user_id = auth.uid())
    and exists (select 1 from class_subject_teachers cst
                where cst.class_id = mark_sheets.class_id and cst.subject_id = mark_sheets.subject_id
                  and cst.teacher_id = mark_sheets.teacher_id)
  );

-- ---------- 5. GRANTS (idempotent) --------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Verify:
--   select * from mark_sheets where school_id='SCH-10428';
--   select id, name, mark_sheet_id, assessment_type_id from exams where mark_sheet_id is not null;
--   select gl.grade_label, gl.competency_code, gl.color from grading_levels gl join grading_schemes s on s.id=gl.scheme_id where s.school_id='SCH-10428';
