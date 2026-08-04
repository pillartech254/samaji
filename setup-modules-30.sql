-- ============================================================
--  Samaji — MIGRATION 30 : assessment_types ordering, for the
--  Ministry-of-Education-style CBC summative report card (matches
--  the official "First Test / Second Test / Third Test" grid).
--  assets/report-card.js turns whichever assessment types have
--  contributes_to_final=true into ordinal "Test" columns on the
--  printed report, in this sort order.
--  Purely additive. Safe to run multiple times.
--  Run AFTER setup-modules-29.sql.
-- ============================================================

alter table assessment_types add column if not exists sort integer not null default 0;

-- Sensible default order for the seeded demo types so the report card
-- grid isn't scrambled out of the box (no-op for schools that already
-- configured their own types — they can reorder in Settings → CBC
-- Assessment → Assessment Types).
update assessment_types set sort = case name
    when 'CAT 1'          then 1
    when 'Midterm Exam'   then 2
    when 'CAT 2'          then 2
    when 'End Term Exam'  then 3
    when 'Assignment'     then 4
    when 'Project'        then 5
    when 'Practical'      then 6
    when 'Portfolio'      then 7
    when 'Observation'    then 8
    else sort
  end
where school_id = 'SCH-10428' and sort = 0;

-- ---------- GRANTS (idempotent) --------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Verify:
--   select name, sort, weight_percent, contributes_to_final from assessment_types where school_id='SCH-10428' order by sort;
