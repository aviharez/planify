alter table public.krs_documents
  drop constraint if exists krs_documents_extraction_status_check;

update public.krs_documents
set extraction_status = 'pending'
where extraction_status = 'mock';

alter table public.krs_documents
  add constraint krs_documents_extraction_status_check
  check (extraction_status in ('manual', 'pending', 'processing', 'completed', 'failed'));

alter table public.krs_documents
  add column if not exists extraction_source text check (extraction_source in ('pdf-text', 'ocr', 'manual', 'demo')),
  add column if not exists extraction_confidence numeric check (extraction_confidence between 0 and 1),
  add column if not exists ocr_confidence numeric check (ocr_confidence between 0 and 1),
  add column if not exists needs_verification boolean not null default false,
  add column if not exists academic_period text,
  add column if not exists total_courses integer check (total_courses is null or total_courses >= 0),
  add column if not exists total_credits numeric check (total_credits is null or total_credits >= 0),
  add column if not exists page_count integer check (page_count is null or page_count > 0),
  add column if not exists extraction_error text,
  add column if not exists extracted_at timestamptz;

create table if not exists public.planning_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  semester_id uuid not null references public.semesters(id) on delete cascade,
  reason text not null default 'initial' check (reason in ('initial', 'adaptation')),
  priority_weights jsonb not null,
  course_factors jsonb not null,
  availability_snapshot jsonb not null default '[]'::jsonb,
  planning_period_start date not null,
  planning_period_end date not null check (planning_period_end >= planning_period_start),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists planning_snapshots_user_semester_generated_idx
  on public.planning_snapshots (user_id, semester_id, generated_at desc);

create index if not exists planning_snapshots_semester_id_idx
  on public.planning_snapshots (semester_id);

alter table public.planning_snapshots enable row level security;

drop policy if exists "pengguna dapat mengelola snapshot sendiri" on public.planning_snapshots;
create policy "pengguna dapat mengelola snapshot sendiri" on public.planning_snapshots for all to authenticated
  using (
    user_id = (select auth.uid()) and exists (
      select 1
      from public.semesters s
      where s.id = semester_id and s.user_id = (select auth.uid())
    )
  ) with check (
    user_id = (select auth.uid()) and exists (
      select 1
      from public.semesters s
      where s.id = semester_id and s.user_id = (select auth.uid())
    )
  );
