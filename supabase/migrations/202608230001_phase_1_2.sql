create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Jakarta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  onboarding_step smallint not null default 0 check (onboarding_step between 0 and 5),
  setup_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.krs_documents (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  extraction_status text not null default 'manual' check (extraction_status in ('manual', 'mock', 'pending', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  credits smallint not null check (credits between 1 and 12),
  created_at timestamptz not null default now(),
  unique (user_id, code)
);

create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  semester_number smallint check (semester_number between 1 and 20),
  status text not null default 'active',
  unique (semester_id, course_id)
);

create table if not exists public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.course_enrollments(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (starts_at < ends_at)
);

create table if not exists public.learning_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  focus_periods text[] not null default '{}',
  focus_duration smallint not null default 45 check (focus_duration between 15 and 180),
  activity_density text not null default 'Seimbang',
  procrastination text not null default 'Kadang-kadang',
  updated_at timestamptz not null default now()
);

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (starts_at < ends_at)
);

create table if not exists public.course_learning_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  understanding smallint not null check (understanding between 1 and 5),
  difficulty smallint not null check (difficulty between 1 and 5),
  unique (user_id, course_id)
);

create table if not exists public.academic_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  event_type text not null,
  title text not null,
  event_date date not null,
  importance smallint not null default 3 check (importance between 1 and 5),
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.semesters enable row level security;
alter table public.krs_documents enable row level security;
alter table public.courses enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.class_schedules enable row level security;
alter table public.learning_profiles enable row level security;
alter table public.availability_slots enable row level security;
alter table public.course_learning_profiles enable row level security;
alter table public.academic_events enable row level security;

drop policy if exists "pengguna dapat mengelola profil sendiri" on public.profiles;
create policy "pengguna dapat mengelola profil sendiri" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare
  table_name text;
begin
  foreach table_name in array['semesters','krs_documents','courses','learning_profiles','availability_slots','course_learning_profiles','academic_events'] loop
    execute format('drop policy if exists "pengguna dapat mengelola data sendiri" on public.%I', table_name);
    execute format('create policy "pengguna dapat mengelola data sendiri" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', table_name);
  end loop;
end $$;

drop policy if exists "pengguna dapat mengelola pendaftaran sendiri" on public.course_enrollments;
create policy "pengguna dapat mengelola pendaftaran sendiri" on public.course_enrollments for all
  using (exists (select 1 from public.semesters s where s.id = semester_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.semesters s where s.id = semester_id and s.user_id = auth.uid()));

drop policy if exists "pengguna dapat mengelola jadwal kuliah sendiri" on public.class_schedules;
create policy "pengguna dapat mengelola jadwal kuliah sendiri" on public.class_schedules for all
  using (exists (select 1 from public.course_enrollments e join public.semesters s on s.id = e.semester_id where e.id = enrollment_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.course_enrollments e join public.semesters s on s.id = e.semester_id where e.id = enrollment_id and s.user_id = auth.uid()));

insert into storage.buckets (id, name, public) values ('krs', 'krs', false) on conflict (id) do update set public = false;
drop policy if exists "pengguna dapat mengelola berkas KRS sendiri" on storage.objects;
create policy "pengguna dapat mengelola berkas KRS sendiri" on storage.objects for all to authenticated
  using (bucket_id = 'krs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'krs' and (storage.foldername(name))[1] = auth.uid()::text);
