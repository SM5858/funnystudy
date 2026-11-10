-- Resuming a study reads the participant's own recorded events: which captions
-- they have already seen, and the timings behind their completion stats. The
-- app already writes these rows with the participant's JWT; these are the
-- matching owner-scoped reads, and nobody else's rows become visible.
--
-- Safe to re-run: each policy is created only when it is missing, so a database
-- that already allows these reads is left untouched.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'study_caption_navigation_events'
      and policyname = 'participants read their own navigation events'
  ) then
    create policy "participants read their own navigation events"
      on public.study_caption_navigation_events
      for select
      to authenticated
      using (profile_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'study_caption_vote_events'
      and policyname = 'participants read their own vote events'
  ) then
    create policy "participants read their own vote events"
      on public.study_caption_vote_events
      for select
      to authenticated
      using (profile_id = auth.uid());
  end if;
end;
$$;

grant select on public.study_caption_navigation_events to authenticated;
grant select on public.study_caption_vote_events to authenticated;
