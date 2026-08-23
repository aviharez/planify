alter table public.study_plans
  add column if not exists source_plan_id uuid references public.study_plans(id) on delete set null,
  add column if not exists adaptation_reason text,
  add column if not exists change_summary jsonb not null default '[]'::jsonb;

alter table public.study_sessions
  add column if not exists source_session_id uuid references public.study_sessions(id) on delete set null,
  add column if not exists change_reason text;

create index if not exists study_plans_source_plan_idx
  on public.study_plans (source_plan_id);
create index if not exists study_sessions_source_session_idx
  on public.study_sessions (source_session_id);

create table if not exists public.weekly_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  week_start date not null,
  perceived_load smallint not null check (perceived_load between 1 and 5),
  realism text not null check (realism in ('Ya', 'Sebagian Besar', 'Tidak')),
  course_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, semester_id, week_start)
);

create index if not exists weekly_evaluations_user_week_idx
  on public.weekly_evaluations (user_id, week_start desc);
create index if not exists weekly_evaluations_semester_idx
  on public.weekly_evaluations (semester_id, week_start desc);

alter table public.weekly_evaluations enable row level security;

drop policy if exists "pengguna dapat mengelola evaluasi mingguan sendiri" on public.weekly_evaluations;
create policy "pengguna dapat mengelola evaluasi mingguan sendiri" on public.weekly_evaluations
  for all to authenticated
  using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.semesters s
      where s.id = semester_id and s.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.semesters s
      where s.id = semester_id and s.user_id = (select auth.uid())
    )
  );

revoke all on table public.weekly_evaluations from anon;
grant select, insert, update, delete on table public.weekly_evaluations to authenticated;

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.user_owns_study_plan(candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.study_plans p
    join public.semesters s on s.id = p.semester_id
    where p.id = candidate_id
      and p.user_id = (select auth.uid())
      and s.user_id = (select auth.uid())
  );
$$;

create or replace function private.user_owns_study_session(candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.study_sessions ss
    join public.study_plans p on p.id = ss.study_plan_id
    join public.semesters s on s.id = p.semester_id
    where ss.id = candidate_id
      and ss.user_id = (select auth.uid())
      and p.user_id = (select auth.uid())
      and s.user_id = (select auth.uid())
  );
$$;

revoke all on function private.user_owns_study_plan(uuid) from public;
revoke all on function private.user_owns_study_session(uuid) from public;
revoke all on function private.user_owns_study_plan(uuid) from anon;
revoke all on function private.user_owns_study_session(uuid) from anon;
grant execute on function private.user_owns_study_plan(uuid) to authenticated;
grant execute on function private.user_owns_study_session(uuid) to authenticated;

drop policy if exists "pengguna dapat mengelola rencana sendiri" on public.study_plans;
create policy "pengguna dapat mengelola rencana sendiri" on public.study_plans
  for all to authenticated
  using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.semesters s
      where s.id = semester_id and s.user_id = (select auth.uid())
    ) and (source_plan_id is null or (select private.user_owns_study_plan(source_plan_id)))
  )
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.semesters s
      where s.id = semester_id and s.user_id = (select auth.uid())
    ) and (source_plan_id is null or (select private.user_owns_study_plan(source_plan_id)))
  );

drop policy if exists "pengguna dapat mengelola sesi sendiri" on public.study_sessions;
create policy "pengguna dapat mengelola sesi sendiri" on public.study_sessions
  for all to authenticated
  using (
    user_id = (select auth.uid()) and exists (
      select 1
      from public.study_plans p
      join public.semesters s on s.id = p.semester_id
      where p.id = study_plan_id
        and p.user_id = (select auth.uid())
        and s.user_id = (select auth.uid())
    ) and (source_session_id is null or (select private.user_owns_study_session(source_session_id)))
  )
  with check (
    user_id = (select auth.uid()) and exists (
      select 1
      from public.study_plans p
      join public.semesters s on s.id = p.semester_id
      where p.id = study_plan_id
        and p.user_id = (select auth.uid())
        and s.user_id = (select auth.uid())
    ) and (source_session_id is null or (select private.user_owns_study_session(source_session_id)))
  );
