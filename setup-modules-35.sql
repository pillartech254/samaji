-- ============================================================
--  Samaji — MIGRATION 35 : Let a super_admin edit a user's name
--  from User Management, and have it show up everywhere that
--  name is actually used — not just in this one table.
--
--  The reason this isn't a one-column UPDATE: there is no single
--  "name" column shared across roles. Each role's display name
--  lives in a different place, and for teachers it lives in TWO
--  places that don't sync with each other:
--
--    school_admin / super_admin  ->  auth.users.raw_user_meta_data
--                                    ->>'full_name' (only place it's
--                                    stored; nothing else reads it —
--                                    neither portal currently shows
--                                    an admin's own name anywhere)
--
--    teacher   ->  teachers.name        (source of truth for the
--                  Teacher Portal header, the gradebook, class-
--                  teacher assignment, subject-teacher lists, and
--                  the live/unpublished report card view — all of
--                  these already read teachers.name directly, so
--                  updating that one column is enough for every one
--                  of them, no separate propagation needed)
--
--              AND staff.full_name  (payroll — a SEPARATE, manually
--                  typed field for payslips, linked via
--                  staff.teacher_id but never kept in sync with
--                  teachers.name; setup-modules-14.sql added the
--                  link column but nothing ever wrote through it).
--                  Left alone, a name edit here would fix every
--                  screen except the one that prints payslips —
--                  updated too, for every staff row linked to this
--                  teacher (a teacher can only sensibly have one
--                  payroll record, but the loop handles more than
--                  one defensively rather than assuming).
--
--    parent    ->  parent_accounts.full_name (the Parent Portal
--                  header/welcome message). NOT students.guardian_name
--                  — that's a separate, independently-typed field a
--                  school admin enters per student when registering
--                  them, not structurally the same field as a
--                  parent's own login name, and there can be more
--                  than one guardian per student with only one
--                  holding the portal login. Left untouched
--                  deliberately; see the note in the UI.
--
--  One deliberate non-propagation: report_cards.class_teacher_name
--  is a frozen snapshot column (setup-modules-18.sql — "so a later
--  mark edit never silently changes an already-published card").
--  A name correction here does NOT rewrite already-published report
--  cards, on purpose, the same way correcting a typo shouldn't
--  retroactively alter a document that already went out. Only
--  reports published after the correction pick up the new name.
--
--  Safe to run multiple times. Run AFTER setup-modules-34.sql.
-- ============================================================

-- ---------- Fix: admin_list_users never looked at teachers.name ----------
-- The blank "Name" column for both teacher rows in the screenshot that
-- prompted this migration is this bug: full_name was computed as
-- coalesce(parent_accounts.full_name, raw_user_meta_data->>'full_name', '')
-- — nothing in that chain ever reads teachers.name, which is where a
-- teacher's actual name lives (set via the School Portal's Settings ->
-- Teachers, or now via admin_update_user_name above). A teacher who
-- self-signs-up at /teacher/ with just email+password has an empty
-- raw_user_meta_data, so the old fallback chain always landed on "".
-- Added a left join to teachers so an already-correct name shows up
-- immediately, without needing to be re-entered through the new edit
-- feature first.
create or replace function admin_list_users(p_school_id text default null)
returns jsonb
language plpgsql security definer
set search_path = public, auth
as $$
declare
  result jsonb;
  has_pa boolean;
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;

  select exists(
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'parent_accounts'
  ) into has_pa;

  if has_pa then
    select coalesce(jsonb_agg(row_order), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'role', p.role,
        'school_id', p.school_id,
        'phone', coalesce(pa.phone, u.raw_user_meta_data->>'phone', ''),
        'full_name', coalesce(pa.full_name, t.name, u.raw_user_meta_data->>'full_name', ''),
        'created_at', u.created_at,
        'must_change_pw', coalesce(pa.must_change_password, false)
      ) as row_order
      from auth.users u
      join public.profiles p on p.id = u.id
      left join public.parent_accounts pa on pa.id = u.id
      left join public.teachers t on t.auth_user_id = u.id
      where (p_school_id is null or p.school_id = p_school_id)
      order by
        case p.role
          when 'super_admin' then 0
          when 'school_admin' then 1
          when 'teacher' then 2
          when 'parent' then 3
          else 4
        end,
        u.created_at desc
    ) sub;
  else
    select coalesce(jsonb_agg(row_order), '[]'::jsonb) into result
    from (
      select jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'role', p.role,
        'school_id', p.school_id,
        'phone', coalesce(u.raw_user_meta_data->>'phone', ''),
        'full_name', coalesce(t.name, u.raw_user_meta_data->>'full_name', ''),
        'created_at', u.created_at,
        'must_change_pw', false
      ) as row_order
      from auth.users u
      join public.profiles p on p.id = u.id
      left join public.teachers t on t.auth_user_id = u.id
      where (p_school_id is null or p.school_id = p_school_id)
      order by
        case p.role
          when 'super_admin' then 0
          when 'school_admin' then 1
          when 'teacher' then 2
          when 'parent' then 3
          else 4
        end,
        u.created_at desc
    ) sub;
  end if;

  return result;
end;
$$;
create or replace function admin_update_user_name(p_user_id uuid, p_full_name text)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_name text := trim(p_full_name);
begin
  if not is_super_admin() then
    raise exception 'Not authorized';
  end if;
  if v_name = '' then
    raise exception 'Name cannot be empty.';
  end if;

  select role into v_role from profiles where id = p_user_id;
  if v_role is null then
    raise exception 'User not found.';
  end if;

  -- Keeps admin_list_users' fallback (for roles with no dedicated
  -- name table) showing the corrected name immediately either way.
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_name)
  where id = p_user_id;

  if v_role = 'parent' then
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='parent_accounts') then
      update parent_accounts set full_name = v_name where id = p_user_id;
    end if;

  elsif v_role = 'teacher' then
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='teachers') then
      update teachers set name = v_name where auth_user_id = p_user_id;
    end if;
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='staff') then
      update staff set full_name = v_name
      where teacher_id in (select id from teachers where auth_user_id = p_user_id);
    end if;
  end if;
  -- school_admin / super_admin: raw_user_meta_data above is the only
  -- place their name lives, already handled.
end;
$$;
