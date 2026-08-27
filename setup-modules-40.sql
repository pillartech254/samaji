-- ============================================================
--  Samaji — MIGRATION 40 : a single, atomic "set current term"
--  action — fixes the dashboard (and every other module) showing
--  a stale term.
--
--  Reported directly: the school is in Term 3, but the dashboard
--  (and everywhere else "the current term" is used) still shows
--  Term 2.
--
--  Root cause: "current term" has always been derived the same way
--  everywhere — academics-core.js's loadAcademicContext(), shared by
--  the School Portal, Teacher Portal, and this file's own comment
--  says so explicitly ("the SAME code the Teacher Portal and School
--  (admin) Portal both call") — by finding whichever term has
--  status = 'active'. That part isn't broken. What's broken is how
--  a term GETS marked active: school-plus.js's existing term editor
--  (Settings -> CBC -> Years & Terms) sets status on ONE term at a
--  time with a plain UPDATE, and its own on-screen text already
--  admits the problem — "Only one year and one term should
--  typically be marked active at a time" is a warning, not something
--  enforced. Marking Term 3 active has never automatically un-marked
--  Term 2, so both stayed 'active' simultaneously, and
--  loadAcademicContext()'s .find(status==='active') — running
--  against terms already sorted by `sort` ascending — deterministically
--  picked whichever of the two active terms sorts first: Term 2.
--
--  Fixed with one atomic action instead of two independent edits a
--  person has to remember to do together: set_current_term(school,
--  term) marks the given term (and its academic year) active and
--  simultaneously closes whatever was previously active — for that
--  school only, so this can never affect another school. Nothing
--  currently 'upcoming' is touched; only a term/year that WAS active
--  and is being superseded moves to 'closed', which is what
--  superseding actually means.
--
--  Callable by super_admin (the explicit ask: a control "under
--  superadmin/admin settings") AND by that school's own school_admin
--  (setup-modules-38.sql's admin/index.html PR added an admin-console
--  screen for platform operators; a school's own admin needs the same
--  capability day to day without going through Pillartech every
--  term) — through the exact same function, so there is only one
--  code path that can ever mark a term active, not two that could
--  drift apart. school-plus.js's existing term editor is updated to
--  call this function whenever its own status dropdown is set to
--  'active', closing the same loophole there instead of leaving a
--  second, still-unsafe way to reintroduce this exact bug.
--
--  Safe to run multiple times. Run AFTER setup-modules-39.sql.
-- ============================================================

create or replace function set_current_term(p_school_id text, p_term_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_year_id uuid;
begin
  if not (is_super_admin() or (is_school_admin() and p_school_id = my_school())) then
    raise exception 'Not authorized';
  end if;

  select academic_year_id into v_year_id from terms where id = p_term_id and school_id = p_school_id;
  if v_year_id is null then
    raise exception 'Term not found for this school.';
  end if;

  -- Close whatever was previously active — for this school only, and
  -- only rows that actually WERE active (an 'upcoming' term two years
  -- out is left alone; it isn't superseded by anything yet).
  update terms set status = 'closed'
    where school_id = p_school_id and status = 'active' and id <> p_term_id;
  update academic_years set status = 'closed'
    where school_id = p_school_id and status = 'active' and id <> v_year_id;

  update terms set status = 'active' where id = p_term_id;
  update academic_years set status = 'active' where id = v_year_id;
end;
$$;
grant execute on function set_current_term(text, uuid) to authenticated;
