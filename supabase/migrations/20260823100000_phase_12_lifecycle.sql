alter table public.study_plans
  add column if not exists preview_acknowledged_at timestamptz;

-- Existing plans are already in normal use; only newly generated plans stay pending.
update public.study_plans
set preview_acknowledged_at = coalesce(preview_acknowledged_at, generated_at)
where preview_acknowledged_at is null;

-- Keep the newest active semester when legacy data contains duplicates before adding the guard.
with ranked as (
  select id, row_number() over (partition by user_id order by updated_at desc, created_at desc, id desc) as position
  from public.semesters
  where is_active
)
update public.semesters
set is_active = false, updated_at = now()
where id in (select id from ranked where position > 1);

create unique index if not exists semesters_one_active_per_user_idx
  on public.semesters (user_id)
  where is_active;

create index if not exists study_plans_active_semester_idx
  on public.study_plans (user_id, semester_id, generated_at desc)
  where status = 'active';

-- Switching semesters must archive the old row and create the new active row together.
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
  new_semester_id uuid;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'semester name required';
  end if;

  update public.semesters
  set is_active = false, updated_at = now()
  where user_id = current_user_id and is_active;

  insert into public.semesters (user_id, name, is_active, onboarding_step, setup_payload)
  values (current_user_id, trim(p_name), true, 0, coalesce(p_setup_payload, '{}'::jsonb))
  returning id into new_semester_id;

  return new_semester_id;
end;
$$;

revoke all on function public.start_new_semester(text, jsonb) from public, anon;
grant execute on function public.start_new_semester(text, jsonb) to authenticated;
