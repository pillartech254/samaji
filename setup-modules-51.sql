-- ============================================================
--  Samaji — MIGRATION 51 : extend staff module coverage to the
--  Library module (library_books, library_loans)
--
--  Reported directly, with a screenshot: a Librarian trying to issue
--  a book got "new row violates row-level security policy for table
--  library_loans." Confirmed directly against the actual policies,
--  not assumed: both library_books and library_loans only ever had
--  policies for is_super_admin()/is_school_admin() — no staff_has_
--  module() coverage was ever added for module.library, unlike
--  students/finance/report_cards in setup-modules-49.sql. This is
--  exactly the "further, separate work" that migration's own header
--  said explicitly was not yet done — now hit in practice by the
--  actual Librarian role this whole feature was built for.
--
--  Full read/write, not read-only — a Librarian needs to add books,
--  issue them, and record returns, not just look at the catalogue.
--
--  Run AFTER setup-modules-50.sql. Safe to run multiple times.
-- ============================================================

drop policy if exists p_library_books_staff on library_books;
create policy p_library_books_staff on library_books for all to authenticated
  using (staff_has_module(school_id, 'module.library'))
  with check (staff_has_module(school_id, 'module.library'));

drop policy if exists p_library_loans_staff on library_loans;
create policy p_library_loans_staff on library_loans for all to authenticated
  using (staff_has_module(school_id, 'module.library'))
  with check (staff_has_module(school_id, 'module.library'));
