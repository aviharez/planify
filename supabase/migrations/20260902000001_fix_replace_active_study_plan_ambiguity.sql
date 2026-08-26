-- Keep the replacement RPC executable when the optional source plan is used.
-- The previous local variable conflicted with study_plans.source_plan_id.
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
  v_source_plan_id uuid;
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

  v_source_plan_id := p_source_plan_id;
  if v_source_plan_id is not null and not exists (
    select 1 from public.study_plans p
    where p.id = v_source_plan_id
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
    v_source_plan_id,
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
