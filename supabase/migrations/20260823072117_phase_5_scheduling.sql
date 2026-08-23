create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  priority_snapshot jsonb not null,
  capacity_policy jsonb not null,
  weekly_capacity_minutes integer not null check (weekly_capacity_minutes >= 0),
  planning_period_start date not null,
  planning_period_end date not null check (planning_period_end >= planning_period_start),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  study_plan_id uuid not null references public.study_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  course_key text not null,
  course_code text not null,
  course_name text not null,
  session_key text not null,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  duration_minutes smallint not null check (duration_minutes between 15 and 180),
  status text not null default 'planned' check (status in ('planned', 'completed', 'partial', 'missed')),
  priority_snapshot jsonb not null,
  study_method text,
  study_goal text,
  explanation text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (study_plan_id, session_key),
  check (start_time < end_time)
);

create index if not exists study_plans_user_semester_generated_idx
  on public.study_plans (user_id, semester_id, generated_at desc);
create index if not exists study_sessions_user_date_status_idx
  on public.study_sessions (user_id, session_date, status);
create index if not exists study_sessions_plan_date_start_idx
  on public.study_sessions (study_plan_id, session_date, start_time);
create index if not exists study_sessions_course_key_idx
  on public.study_sessions (user_id, course_key, session_date);

alter table public.study_plans enable row level security;
alter table public.study_sessions enable row level security;

drop policy if exists "pengguna dapat mengelola rencana sendiri" on public.study_plans;
create policy "pengguna dapat mengelola rencana sendiri" on public.study_plans
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
    )
  )
  with check (
    user_id = (select auth.uid()) and exists (
      select 1
      from public.study_plans p
      join public.semesters s on s.id = p.semester_id
      where p.id = study_plan_id
        and p.user_id = (select auth.uid())
        and s.user_id = (select auth.uid())
    )
  );

revoke all on table public.study_plans, public.study_sessions from anon;
grant select, insert, update, delete on table public.study_plans, public.study_sessions to authenticated;
