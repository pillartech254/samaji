-- ============================================================
--  Samaji — MIGRATION 18 : CBC Assessment Engine — report card
--  snapshot. Freezes a student's report card at the moment a
--  Principal/Deputy generates it, so a later mark edit never
--  silently changes an already-issued report if reprinted.
--  Safe to run multiple times. Run AFTER setup-modules-17.sql.
-- ============================================================

create table if not exists report_cards (
  id                 uuid primary key default gen_random_uuid(),
  school_id          text not null references schools(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  class_id           uuid not null references school_classes(id) on delete cascade,
  term_id            uuid not null references terms(id) on delete cascade,
  academic_year_id   uuid not null references academic_years(id) on delete cascade,
  class_label        text,
  class_teacher_name text,
  subject_rows       jsonb not null default '[]'::jsonb,   -- frozen: same shape as the live report card's subjectRows
  attendance         jsonb,                                -- frozen: {daysOpen,daysPresent,daysAbsent}
  ratings            jsonb,                                -- frozen: {competency:{},value:{},psychomotor:{}}
  overall_average    numeric,
  teacher_remark     text,
  principal_remark   text,
  published_at       timestamptz not null default now(),
  published_by       uuid references teachers(id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (student_id, term_id, academic_year_id)
);
create index if not exists report_cards_school_idx on report_cards(school_id);
create index if not exists report_cards_class_idx on report_cards(class_id, term_id, academic_year_id);

alter table report_cards enable row level security;

drop policy if exists p_report_cards_admin_rw on report_cards;
create policy p_report_cards_admin_rw on report_cards for all to authenticated
  using (is_super_admin() or (school_id = my_school() and is_school_admin()))
  with check (is_super_admin() or (school_id = my_school() and is_school_admin()));

-- Only a Principal/Deputy Principal may generate (write) the frozen
-- snapshot — matches "Only Principal or Headteacher can Publish."
drop policy if exists p_report_cards_publisher_rw on report_cards;
create policy p_report_cards_publisher_rw on report_cards for all to authenticated
  using (school_id = my_school() and is_publisher())
  with check (school_id = my_school() and is_publisher());

drop policy if exists p_report_cards_read on report_cards;
create policy p_report_cards_read on report_cards for select to authenticated
  using (school_id = my_school());

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Verify:
--   select student_id, overall_average, published_at from report_cards order by published_at desc limit 20;
