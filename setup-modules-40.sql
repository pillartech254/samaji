-- ============================================================
-- setup-modules-40.sql
-- Composite indexes for the School Portal Dashboard's real-time
-- widgets (Attention Required, School Pulse) — these queries run on
-- EVERY dashboard load (the highest-traffic screen, since it's the
-- first thing shown after login), not just on an occasional admin
-- screen visit, so the exact filter combinations they use deserve
-- their own indexes even at modest per-school row counts.
--
-- Each existing single-column index (school_id alone, status alone,
-- etc. — see setup-modules-2/11/38/39.sql) stays; these are additive
-- composites matching the exact WHERE clauses school-dashboard.js
-- actually runs. Safe to run multiple times.
-- ============================================================

-- Overdue library books: eq(school_id) + eq(status='active') + lt(due_date)
create index if not exists library_loans_school_status_due_idx
  on library_loans(school_id, status, due_date);

-- Unpaid lost-book charges: eq(school_id) + eq(status='unpaid')
create index if not exists library_charges_school_status_idx
  on library_charges(school_id, status);

-- Stuck M-Pesa transactions: eq(school_id) + eq(status='pending') + lt(created_at)
create index if not exists mpesa_tx_school_status_created_idx
  on mpesa_transactions(school_id, status, created_at);

-- Stuck KCB transactions: same shape as above
create index if not exists kcb_tx_school_status_created_idx
  on kcb_transactions(school_id, status, created_at);

-- Verify:
--   explain analyze select id from library_loans where school_id='SCH-10428' and status='active' and due_date < current_date;
--   (should show an Index Scan on library_loans_school_status_due_idx once the table has enough rows to make the planner prefer it)
