-- Semester isolation and atomic study-plan replacement.
-- Legacy rows are retained; only impossible active states are normalized.
alter table public.semesters
  add column if not exists started_at timestamptz;

update public.semesters
set started_at = created_at
where started_at is null;

alter table public.semesters
  alter column started_at set default now(),
  alter column started_at set not null;

update public.semesters
set setup_payload = coalesce(setup_payload, '{}'::jsonb) || jsonb_build_object(
  'semesterId', id::text,
  'semesterStartedAt', started_at::text
);

-- An inactive semester cannot participate in the current planning context.
update public.study_plans p
set status = 'archived', updated_at = now()
from public.semesters s
where p.semester_id = s.id
  and not s.is_active
  and p.status = 'active';

-- Keep the newest active plan for each user and semester. Sessions and their
-- adaptation links remain attached to the archived plans.
with ranked as (
  select p.id,
    row_number() over (
      partition by p.user_id, p.semester_id
      order by p.generated_at desc nulls last, p.created_at desc, p.id desc
    ) as position
  from public.study_plans p
  join public.semesters s on s.id = p.semester_id
  where p.status = 'active' and s.is_active
)
update public.study_plans p
set status = 'archived', updated_at = now()
from ranked r
where p.id = r.id and r.position > 1;

create unique index if not exists study_plans_one_active_per_user_semester_idx
  on public.study_plans (user_id, semester_id)
  where status = 'active';

create index if not exists study_sessions_plan_semester_idx
  on public.study_sessions (study_plan_id, semester_id, session_date, start_time);

-- Switching is one transaction: the old semester and its active plans are
-- changed before the new row is committed, or none of the changes remain.
create or replace function public.start_new_semester(
  p_name text,
  p_setup_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  previous_semester_id uuid;
  new_semester_id uuid;
  new_started_at timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'semester name required';
  end if;

  select s.id into previous_semester_id
  from public.semesters s
  where s.user_id = current_user_id and s.is_active
  order by s.updated_at desc, s.id desc
  limit 1
  for update;

  if previous_semester_id is not null then
    update public.study_plans
    set status = 'archived', updated_at = now()
    where user_id = current_user_id
      and semester_id = previous_semester_id
      and status = 'active';

    update public.semesters
    set is_active = false, updated_at = now()
    where id = previous_semester_id and user_id = current_user_id;
  end if;

  insert into public.semesters (
    user_id, name, is_active, onboarding_step, setup_payload, started_at
  )
  values (
    current_user_id, trim(p_name), true, 0, coalesce(p_setup_payload, '{}'::jsonb), new_started_at
  )
  returning id into new_semester_id;

  -- Keep the stable database identity and activation instant with the setup
  -- payload consumed by the client while the row remains the source of truth.
  update public.semesters
  set setup_payload = coalesce(setup_payload, '{}'::jsonb) || jsonb_build_object(
    'semesterId', new_semester_id::text,
    'semesterStartedAt', new_started_at::text
  )
  where id = new_semester_id;

  return new_semester_id;
end;
$$;

revoke all on function public.start_new_semester(text, jsonb) from public, anon;
grant execute on function public.start_new_semester(text, jsonb) to authenticated;

-- Writes a replacement plan and all sessions as a single transaction. The
-- draft is archived while its rows are inserted so the partial unique index
-- never permits two active plans. Only after all rows succeed is the draft
-- promoted and the prior active plan archived.
create or replace function public.replace_active_study_plan(
  p_semester_id uuid,
  p_plan jsonb,
  p_setup_payload jsonb,
  p_source_plan_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  semester_payload jsonb;
  semester_started_at timestamptz;
  semester_start_date date;
  new_plan_id uuid;
  source_plan_id uuid;
  invalid_course boolean;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if p_semester_id is null or p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'plan payload required';
  end if;
  if p_setup_payload is null or jsonb_typeof(p_setup_payload) <> 'object' then
    raise exception 'setup payload required';
  end if;

  select s.started_at into semester_started_at
  from public.semesters s
  where s.id = p_semester_id
    and s.user_id = current_user_id
    and s.is_active
  for update;
  if not found then
    raise exception 'active semester not found';
  end if;
  if nullif(p_setup_payload->>'semesterId', '') is not null
    and p_setup_payload->>'semesterId' <> p_semester_id::text then
    raise exception 'setup payload does not belong to active semester';
  end if;

  -- Identity and activation time come only from the locked semester row.
  semester_payload := p_setup_payload || jsonb_build_object(
    'semesterId', p_semester_id::text,
    'semesterStartedAt', semester_started_at::text
  );
  if coalesce(jsonb_typeof(semester_payload->'courses'), '') <> 'array' then
    raise exception 'courses payload required';
  end if;
  if nullif(semester_payload->>'timezone', '') is null or not exists (
    select 1 from pg_timezone_names where name = semester_payload->>'timezone'
  ) then
    raise exception 'valid setup timezone required';
  end if;
  semester_start_date := (semester_started_at at time zone (semester_payload->>'timezone'))::date;

  if coalesce(jsonb_typeof(p_plan->'sessions'), '') <> 'array' then
    raise exception 'sessions payload required';
  end if;
  if coalesce(jsonb_typeof(p_plan->'prioritySnapshot'->'courseFactors'), '') <> 'array' then
    raise exception 'course factors payload required';
  end if;
  if (p_plan->'planningPeriod'->>'start')::date < semester_start_date then
    raise exception 'planning period starts before active semester';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_plan->'sessions') as item(value)
    where (item.value->>'date')::date < semester_start_date
  ) then
    raise exception 'study session starts before active semester';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(p_plan->'sessions') as item(value)
    where nullif(item.value->>'courseId', '') is null or not exists (
      select 1
      from jsonb_array_elements(semester_payload->'courses') as course(value)
      where course.value->>'id' = item.value->>'courseId'
    )
  ) into invalid_course;
  if invalid_course then
    raise exception 'study session course does not belong to active semester';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(p_plan->'prioritySnapshot'->'courseFactors') as item(value)
    where nullif(item.value->>'courseId', '') is null or not exists (
      select 1
      from jsonb_array_elements(semester_payload->'courses') as course(value)
      where course.value->>'id' = item.value->>'courseId'
    )
  ) into invalid_course;
  if invalid_course then
    raise exception 'planning factor course does not belong to active semester';
  end if;

  source_plan_id := p_source_plan_id;
  if source_plan_id is not null and not exists (
    select 1 from public.study_plans p
    where p.id = source_plan_id
      and p.user_id = current_user_id
      and p.semester_id = p_semester_id
      and p.status = 'active'
  ) then
    raise exception 'source plan is not the active plan for this semester';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_plan->'sessions') as item(value)
    where nullif(item.value->>'sourceSessionId', '') is not null
      and not exists (
        select 1 from public.study_sessions s
        where s.id = (item.value->>'sourceSessionId')::uuid
          and s.user_id = current_user_id
          and s.semester_id = p_semester_id
      )
  ) then
    raise exception 'source session does not belong to this semester';
  end if;

  insert into public.study_plans (
    user_id, semester_id, status, source_plan_id, adaptation_reason,
    change_summary, priority_snapshot, capacity_policy,
    weekly_capacity_minutes, planning_period_start, planning_period_end,
    generated_at, preview_acknowledged_at
  )
  values (
    current_user_id,
    p_semester_id,
    'archived',
    source_plan_id,
    nullif(p_plan->>'adaptationReason', ''),
    coalesce(p_plan->'changeSummary', '[]'::jsonb),
    p_plan->'prioritySnapshot',
    p_plan->'capacityPolicy',
    (p_plan->>'weeklyCapacityMinutes')::integer,
    (p_plan->'planningPeriod'->>'start')::date,
    (p_plan->'planningPeriod'->>'end')::date,
    (p_plan->>'generatedAt')::timestamptz,
    null
  )
  returning id into new_plan_id;

  insert into public.study_sessions (
    study_plan_id, user_id, semester_id, course_key, course_code,
    course_name, session_key, session_date, start_time, end_time,
    duration_minutes, status, priority_snapshot, study_method, study_goal,
    explanation, completed_at, source_session_id, change_reason
  )
  select
    new_plan_id,
    current_user_id,
    p_semester_id,
    item.value->>'courseId',
    coalesce(
      (
        select nullif(course.value->>'code', '')
        from jsonb_array_elements(semester_payload->'courses') as course(value)
        where course.value->>'id' = item.value->>'courseId'
        limit 1
      ),
      item.value->>'courseId'
    ),
    item.value->>'courseName',
    item.value->>'sessionKey',
    (item.value->>'date')::date,
    (item.value->>'startTime')::time,
    (item.value->>'endTime')::time,
    (item.value->>'duration')::smallint,
    item.value->>'status',
    item.value->'prioritySnapshot',
    nullif(item.value->>'studyMethod', ''),
    nullif(item.value->>'studyGoal', ''),
    nullif(item.value->>'explanation', ''),
    nullif(item.value->>'completedAt', '')::timestamptz,
    nullif(item.value->>'sourceSessionId', '')::uuid,
    nullif(item.value->>'changeReason', '')
  from jsonb_array_elements(p_plan->'sessions') as item(value);

  update public.study_plans
  set status = 'archived', updated_at = now()
  where user_id = current_user_id
    and semester_id = p_semester_id
    and status = 'active';

  update public.study_plans
  set status = 'active', updated_at = now()
  where id = new_plan_id and user_id = current_user_id;

  -- Store exactly the setup used for validation with server-bound identity and
  -- the new remote plan identity. Any later failure rolls this back too.
  semester_payload := semester_payload || jsonb_build_object(
    'planActive', true,
    'planningSnapshot', p_plan->'prioritySnapshot',
    'studyPlan', p_plan || jsonb_build_object('remoteId', new_plan_id::text)
  );
  update public.semesters
  set setup_payload = semester_payload,
      onboarding_step = (semester_payload->>'step')::smallint,
      updated_at = now()
  where id = p_semester_id
    and user_id = current_user_id
    and is_active;
  if not found then
    raise exception 'active semester changed during plan replacement';
  end if;

  return new_plan_id;
end;
$$;

revoke all on function public.replace_active_study_plan(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.replace_active_study_plan(uuid, jsonb, jsonb, uuid) to authenticated;
