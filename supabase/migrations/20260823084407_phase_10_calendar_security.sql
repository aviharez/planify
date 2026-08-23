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
