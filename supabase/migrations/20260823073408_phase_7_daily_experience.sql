create table if not exists public.session_feedback (
  id uuid primary key default gen_random_uuid(),
  study_session_id uuid not null references public.study_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text check (reason is null or reason in (
    'Tidak cukup waktu',
    'Terlalu lelah',
    'Materinya terasa sulit',
    'Lupa',
    'Ada kegiatan mendadak',
    'Lainnya'
  )),
  understanding smallint check (understanding is null or understanding between 1 and 5),
  recorded_at timestamptz not null default now()
);

create index if not exists session_feedback_user_recorded_idx
  on public.session_feedback (user_id, recorded_at desc);
create index if not exists session_feedback_session_recorded_idx
  on public.session_feedback (study_session_id, recorded_at desc);

alter table public.session_feedback enable row level security;

drop policy if exists "pengguna dapat melihat umpan balik sesi sendiri" on public.session_feedback;
create policy "pengguna dapat melihat umpan balik sesi sendiri" on public.session_feedback
  for select to authenticated
  using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.study_sessions s
      where s.id = study_session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "pengguna dapat menambah umpan balik sesi sendiri" on public.session_feedback;
create policy "pengguna dapat menambah umpan balik sesi sendiri" on public.session_feedback
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.study_sessions s
      where s.id = study_session_id and s.user_id = (select auth.uid())
    )
  );

revoke all on table public.session_feedback from anon;
grant select, insert on table public.session_feedback to authenticated;
