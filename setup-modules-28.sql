-- ============================================================
--  Samaji — MIGRATION 28 : Fix backup/reset/restore for tables
--  that don't have a direct school_id column.
--
--  admin_backup_table(), admin_reset_table() (setup-modules-11.sql)
--  and admin_restore_backup() (setup-modules-27.sql) all assumed
--  every table in their allow-list has "where school_id = $1" to
--  filter by. Three don't:
--    - fee_items      -> scoped via structure_id -> fee_structures.school_id
--    - class_subjects           -> scoped via class_id -> school_classes.school_id
--    - class_subject_teachers   -> scoped via class_id -> school_classes.school_id
--
--  fee_items is 4th in the backup list, so every single backup has
--  been failing partway through — "column t.school_id does not
--  exist" — before ever reaching attendance/grades/exams/exam_results,
--  which is why no backup has ever actually completed. Same failure
--  mode applies to resetting or restoring fee_items, and to resetting
--  class_subjects/class_subject_teachers (not currently exposed as
--  checkboxes in the Admin Console UI, but reachable by calling the
--  RPC directly, so fixed here too for correctness).
--
--  Safe to run multiple times. Run AFTER setup-modules-27.sql.
-- ============================================================

create or replace function admin_backup_table(p_school_id text, p_table text)
returns jsonb
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
  result jsonb;
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;
  if not (p_table = any(allowed)) then
    raise exception 'Table not allowed: %', p_table;
  end if;

  if p_table = 'fee_items' then
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into result
      from fee_items t
      where t.structure_id in (select id from fee_structures where school_id = p_school_id);
  else
    execute format('select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) from %I t where t.school_id = $1', p_table)
      into result using p_school_id;
  end if;

  return result;
end;
$$;

create or replace function admin_reset_table(p_school_id text, p_table text)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  allowed text[] := array[
    'students','fee_payments','fee_structures','fee_items',
    'attendance','grades','exams','exam_results',
    'announcements','library_books','library_loans',
    'transport_routes','transport_vehicles','transport_assignments',
    'timetable_slots','staff','payroll_runs','payslips',
    'subjects','teachers','class_subjects','class_subject_teachers'
  ];
  cnt integer;
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;
  if not (p_table = any(allowed)) then
    raise exception 'Table not allowed: %', p_table;
  end if;

  if p_table = 'fee_items' then
    delete from fee_items where structure_id in (select id from fee_structures where school_id = p_school_id);
  elsif p_table = 'class_subjects' then
    delete from class_subjects where class_id in (select id from school_classes where school_id = p_school_id);
  elsif p_table = 'class_subject_teachers' then
    delete from class_subject_teachers where class_id in (select id from school_classes where school_id = p_school_id);
  else
    execute format('delete from %I where school_id = $1', p_table) using p_school_id;
  end if;
  get diagnostics cnt = row_count;
  return cnt;
end;
$$;

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

    if v_table = 'fee_items' then
      delete from fee_items where structure_id in (select id from fee_structures where school_id = v_school_id);
    else
      execute format('delete from %I where school_id = $1', v_table) using v_school_id;
    end if;

    v_rows := v_backup_data -> v_table;
    if v_rows is not null and jsonb_typeof(v_rows) = 'array' and jsonb_array_length(v_rows) > 0 then
      execute format('insert into %I select * from jsonb_populate_recordset(null::%I, $1)', v_table, v_table)
        using v_rows;
    end if;
  end loop;
end;
$$;
