-- ============================================================
--  Samaji — MIGRATION 13 : Teacher portal support
--  Adds teacher_id to profiles so auth accounts can be linked
--  to a teacher record, enabling teacher login.
--  Also adds a grading_scale table and expands exam_results
--  with grade/remarks columns.
--  Safe to run multiple times.
-- ============================================================

-- 1. Add teacher_id to profiles (nullable — only set for teacher accounts)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='teacher_id') then
    alter table profiles add column teacher_id uuid references teachers(id) on delete set null;
  end if;
end $$;

-- 2. Add grade and remarks to exam_results
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='exam_results' and column_name='grade') then
    alter table exam_results add column grade text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='exam_results' and column_name='remarks') then
    alter table exam_results add column remarks text;
  end if;
end $$;

-- 3. Add subject_id to exams (links exam to a specific subject record)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='exams' and column_name='subject_id') then
    alter table exams add column subject_id uuid references subjects(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='exams' and column_name='class_id') then
    alter table exams add column class_id uuid references school_classes(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='exams' and column_name='teacher_id') then
    alter table exams add column teacher_id uuid references teachers(id) on delete set null;
  end if;
end $$;

-- 4. Add recorded_by to attendance (so we know which teacher took it)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='attendance' and column_name='recorded_by') then
    alter table attendance add column recorded_by uuid references teachers(id) on delete set null;
  end if;
end $$;

-- 5. Teacher payroll table
create table if not exists teacher_payroll (
  id          uuid primary key default gen_random_uuid(),
  school_id   text not null references schools(id) on delete cascade,
  teacher_id  uuid not null references teachers(id) on delete cascade,
  month       text not null,
  year        integer not null,
  basic_salary numeric not null default 0,
  allowances   numeric not null default 0,
  deductions   numeric not null default 0,
  net_salary   numeric not null default 0,
  status       text not null default 'pending',
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (teacher_id, month, year)
);
create index if not exists teacher_payroll_school_idx on teacher_payroll(school_id);

alter table teacher_payroll enable row level security;
drop policy if exists p_payroll_rw on teacher_payroll;
create policy p_payroll_rw on teacher_payroll for all to authenticated
  using (is_super_admin() or school_id = my_school())
  with check (is_super_admin() or school_id = my_school());

-- 6. Function to create a teacher user account
create or replace function create_teacher_account(
  p_email text,
  p_password text,
  p_school_id text,
  p_teacher_id uuid,
  p_full_name text default null
) returns uuid
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  if not (is_super_admin() or my_school() = p_school_id) then
    raise exception 'Not authorized';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, reauthentication_token,
    email_change, email_change_token_new, email_change_token_current,
    email_change_confirm_status,
    phone, phone_change, phone_change_token,
    is_sso_user, is_super_admin,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    '', '', '',
    '', '', '',
    0,
    null, '', '',
    false, false,
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', coalesce(p_full_name, ''))
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), new_id,
    jsonb_build_object('sub', new_id::text, 'email', p_email),
    'email', new_id::text,
    now(), now(), now()
  );

  insert into profiles (id, role, school_id, teacher_id)
  values (new_id, 'teacher', p_school_id, p_teacher_id)
  on conflict (id) do update set role = 'teacher', school_id = p_school_id, teacher_id = p_teacher_id;

  return new_id;
end;
$$;

-- 7. Helper: get teacher_id for current auth user
create or replace function my_teacher_id()
returns uuid language sql stable security definer
set search_path = public as $$
  select teacher_id from profiles where id = auth.uid();
$$;
grant execute on function my_teacher_id() to authenticated;

-- 8. Grants
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
