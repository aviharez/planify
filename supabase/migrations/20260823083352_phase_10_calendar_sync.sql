create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  calendar_id text not null default 'primary',
  account_email text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz,
  granted_scope text not null default 'https://www.googleapis.com/auth/calendar.events',
  status text not null default 'connected' check (status in ('connected', 'error', 'disconnected')),
  last_synced_at timestamptz,
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  study_session_id uuid not null references public.study_sessions(id) on delete cascade,
  google_calendar_id text not null,
  google_event_id text not null,
  session_key text not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, study_session_id),
  unique (connection_id, google_event_id)
);

create index if not exists calendar_connections_user_provider_idx
  on public.calendar_connections (user_id, provider);
create index if not exists calendar_event_links_user_connection_idx
  on public.calendar_event_links (user_id, connection_id);
create index if not exists calendar_event_links_session_idx
  on public.calendar_event_links (study_session_id);

alter table public.calendar_connections enable row level security;
alter table public.calendar_event_links enable row level security;

drop policy if exists "pengguna dapat melihat kalender sendiri" on public.calendar_connections;
create policy "pengguna dapat melihat kalender sendiri" on public.calendar_connections
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "pengguna dapat mengelola kalender sendiri" on public.calendar_connections;
create policy "pengguna dapat mengelola kalender sendiri" on public.calendar_connections
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "pengguna dapat memperbarui kalender sendiri" on public.calendar_connections;
create policy "pengguna dapat memperbarui kalender sendiri" on public.calendar_connections
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "pengguna dapat menghapus kalender sendiri" on public.calendar_connections;
create policy "pengguna dapat menghapus kalender sendiri" on public.calendar_connections
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "pengguna dapat melihat tautan kalender sendiri" on public.calendar_event_links;
create policy "pengguna dapat melihat tautan kalender sendiri" on public.calendar_event_links
  for select to authenticated
  using (
    (select auth.uid()) = user_id and exists (
      select 1 from public.calendar_connections c
      where c.id = connection_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "pengguna dapat mengelola tautan kalender sendiri" on public.calendar_event_links;
create policy "pengguna dapat mengelola tautan kalender sendiri" on public.calendar_event_links
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.calendar_connections c
      where c.id = connection_id and c.user_id = (select auth.uid())
    ) and exists (
      select 1 from public.study_sessions s
      where s.id = study_session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "pengguna dapat memperbarui tautan kalender sendiri" on public.calendar_event_links;
create policy "pengguna dapat memperbarui tautan kalender sendiri" on public.calendar_event_links
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.calendar_connections c
      where c.id = connection_id and c.user_id = (select auth.uid())
    ) and exists (
      select 1 from public.study_sessions s
      where s.id = study_session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "pengguna dapat menghapus tautan kalender sendiri" on public.calendar_event_links;
create policy "pengguna dapat menghapus tautan kalender sendiri" on public.calendar_event_links
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.calendar_connections, public.calendar_event_links from anon;
grant select, insert, update, delete on table public.calendar_connections to authenticated;
grant select, insert, update, delete on table public.calendar_event_links to authenticated;
