-- ============================================================
-- setup-modules-37.sql
-- CBC/CBE Phase 3: report card enrichment (UPI, promotion status,
-- attendance passthrough, verification QR code) — additive to the
-- existing frozen report_cards/report_remarks tables. Does NOT touch
-- the printed layout itself (that's assets/report-card.js, kept as
-- close as possible to the current Ministry-format grid per explicit
-- instruction to retain it) — only the data feeding it.
-- ============================================================

-- ---------- 1. STUDENT UPI (NEMIS Unique Personal Identifier) --
alter table students add column if not exists upi text;

-- ---------- 2. PROMOTION STATUS ---------------------------------
-- Lives alongside teacher_remark/principal_remark: editable per
-- student+term+year while marks are still live, then frozen into
-- report_cards at generation time exactly like the remarks are.
alter table report_remarks add column if not exists promotion_status text;
alter table report_cards   add column if not exists promotion_status text;

-- ---------- 3. VERIFICATION CODE (frozen report cards only) -----
-- A short, effectively-unguessable code printed (as text + QR) on
-- every generated report card, letting anyone holding the physical
-- copy confirm it's genuine via verify_report_card() below — without
-- exposing marks, remarks, or any other student's data.
alter table report_cards add column if not exists verification_code text
  default upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 10));
create unique index if not exists report_cards_verification_code_idx on report_cards(verification_code) where verification_code is not null;

-- Backfill any rows created before this column existed.
update report_cards set verification_code = upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 10))
  where verification_code is null;

-- ---------- 4. PUBLIC VERIFICATION LOOKUP ------------------------
-- Deliberately narrow: only the fields needed to confirm a report
-- card is genuine, keyed by the unguessable code (never by student
-- id or name), callable by anon so a QR scan needs no login.
create or replace function verify_report_card(p_code text)
returns table(
  student_name     text,
  class_label      text,
  term_name        text,
  academic_year    int,
  school_name      text,
  overall_average  numeric,
  promotion_status text,
  published_at     timestamptz
)
language sql stable security definer
set search_path = public as $$
  select st.first_name || ' ' || st.last_name,
         rc.class_label,
         t.name,
         ay.year,
         sc.name,
         rc.overall_average,
         rc.promotion_status,
         rc.published_at
  from report_cards rc
  join students st        on st.id = rc.student_id
  join terms t             on t.id = rc.term_id
  join academic_years ay  on ay.id = rc.academic_year_id
  join schools sc          on sc.id = rc.school_id
  where rc.verification_code = p_code;
$$;
grant execute on function verify_report_card(text) to anon, authenticated;

-- ---------- 5. STORAGE BUCKET FOR STUDENT PHOTOS -----------------
-- Same pattern as school-logos (setup-modules-29.sql): public read (a
-- report card viewed by a parent isn't authenticated to Storage),
-- write restricted to that school's own admin, scoped by the first
-- path segment (<school_id>/students/<student_id>.<ext>).
insert into storage.buckets (id, name, public)
values ('student-photos', 'student-photos', true)
on conflict (id) do update set public = true;

drop policy if exists student_photos_read on storage.objects;
create policy student_photos_read on storage.objects for select
  to public
  using (bucket_id = 'student-photos');

drop policy if exists student_photos_write on storage.objects;
create policy student_photos_write on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.my_school()
    and public.is_school_admin()
  );

drop policy if exists student_photos_update on storage.objects;
create policy student_photos_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.my_school()
    and public.is_school_admin()
  );

drop policy if exists student_photos_delete on storage.objects;
create policy student_photos_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = public.my_school()
    and public.is_school_admin()
  );
