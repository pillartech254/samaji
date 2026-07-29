-- ============================================================
--  Samaji — MIGRATION 27 : Atomic backup restore.
--
--  The Admin Console's "Restore" button previously wiped and
--  reinserted each backed-up table one at a time from client-side
--  JS — a closed tab or dropped connection partway through could
--  leave a school with some tables restored and others not, at
--  exactly the moment (disaster recovery) you can least afford
--  that. This wraps the whole restore in one function call, which
--  Postgres runs as a single transaction: if anything in it fails,
--  none of it applies.
--
--  Safe to run multiple times. Run AFTER setup-modules-26.sql.
-- ============================================================

create or replace function admin_restore_backup(p_backup_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  allowed text[] := array[
    'students','fee_payments','fee_structures','fee_items',
    'attendance','grades','exams','exam_results',
    'announcements','library_books','library_loans',
    'transport_routes','transport_vehicles','transport_assignments'
  ];
  v_school_id text;
  v_tables text[];
  v_backup_data jsonb;
  v_table text;
  v_rows jsonb;
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

  select school_id, tables_included, backup_data
    into v_school_id, v_tables, v_backup_data
    from school_backups where id = p_backup_id;

  if v_school_id is null then
    raise exception 'Backup not found';
  end if;

  foreach v_table in array v_tables loop
    if not (v_table = any(allowed)) then
      raise exception 'Table not allowed: %', v_table;
    end if;

    execute format('delete from %I where school_id = $1', v_table) using v_school_id;

    v_rows := v_backup_data -> v_table;
    if v_rows is not null and jsonb_typeof(v_rows) = 'array' and jsonb_array_length(v_rows) > 0 then
      execute format('insert into %I select * from jsonb_populate_recordset(null::%I, $1)', v_table, v_table)
        using v_rows;
    end if;
  end loop;
end;
$$;
grant execute on function admin_restore_backup(uuid) to authenticated;
