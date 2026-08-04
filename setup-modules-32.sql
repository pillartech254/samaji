-- ============================================================
--  Samaji — MIGRATION 32 : hard cap of 3 summative tests per
--  mark sheet, enforced in the database (not just the UI).
--
--  The KICD summative report card has exactly three fixed test
--  columns (First/Second/Third Test) — assets/academics-core.js and
--  assets/school-academics.js already cap contributing assessment
--  types at 3 per subject when rendering/announcing, but that's
--  app-level only. This adds the same rule as a trigger on `exams`,
--  so it holds even against a direct insert (e.g. the admin API,
--  a future integration, or a bug elsewhere in the app).
--
--  Formative assessment types (contributes_to_final = false) are
--  NOT counted — they never appear as a report-card test column, so
--  a school can record as many of those as it wants.
--
--  Safe to run multiple times. Run AFTER setup-modules-31.sql.
-- ============================================================

create or replace function enforce_max_three_summative_tests()
returns trigger language plpgsql as $$
declare
  contributes boolean;
  existing_count integer;
begin
  select at2.contributes_to_final into contributes
    from assessment_types at2 where at2.id = new.assessment_type_id;

  -- No assessment type, or a formative (non-contributing) one: unrestricted.
  if contributes is distinct from true then
    return new;
  end if;

  select count(*) into existing_count
    from exams e
    join assessment_types at2 on at2.id = e.assessment_type_id
    where e.mark_sheet_id = new.mark_sheet_id
      and at2.contributes_to_final = true
      and e.id <> new.id;

  if existing_count >= 3 then
    raise exception 'A mark sheet can have at most 3 summative tests (contributing assessment types) — this matches the report card''s First/Second/Third Test columns. Use a formative (non-contributing) assessment type instead, or remove one first.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_exams_max_three_tests on exams;
create trigger trg_exams_max_three_tests
  before insert or update on exams
  for each row execute function enforce_max_three_summative_tests();

-- ---------- GRANTS (idempotent) --------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Verify (as admin, a mark sheet that already has 3 contributing exams):
--   insert into exams (mark_sheet_id, assessment_type_id, ...) values (...)
--   -> should raise "A mark sheet can have at most 3 summative tests..."
--   select e.name, at2.contributes_to_final from exams e
--     join assessment_types at2 on at2.id = e.assessment_type_id
--     where e.mark_sheet_id = '<id>' order by at2.sort;
