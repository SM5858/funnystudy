-- One durable participation per person and study. Repeated starts/ends retain
-- the original database timestamps; leaving the page does not end a study.
create table public.study_participations (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  study_id bigint not null references public.studies(id) on delete cascade,
  started_at timestamptz not null default statement_timestamp(),
  ended_at timestamptz,
  primary key (profile_id, study_id),
  constraint study_participations_time_order check (ended_at >= started_at)
);

create index study_participations_study_id_idx
  on public.study_participations(study_id);

alter table public.study_participations enable row level security;
revoke all on public.study_participations from public, anon, authenticated;
grant select on public.study_participations to authenticated;
grant insert (profile_id, study_id), update (ended_at)
  on public.study_participations to authenticated;

create policy "Participants can read their study participation"
  on public.study_participations for select to authenticated
  using (profile_id = (select auth.uid()));
create policy "Superadmins can read study participations"
  on public.study_participations for select to authenticated
  using (public.is_superadmin((select auth.uid())));
create policy "Participants can start active studies"
  on public.study_participations for insert to authenticated
  with check (
    profile_id = (select auth.uid()) and exists (
      select 1 from public.studies study
      where study.id = study_id
        and (study.start_datetime_utc is null or study.start_datetime_utc <= statement_timestamp())
        and (study.end_datetime_utc is null or study.end_datetime_utc >= statement_timestamp())
    )
  );
-- A study that expires while someone is participating can still be ended.
create policy "Participants can end their study participation"
  on public.study_participations for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create function public.stamp_study_participation_end()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Treat any update as an end request. Clients cannot clear or forge end times.
  new.ended_at := coalesce(old.ended_at, statement_timestamp());
  return new;
end;
$$;
revoke all on function public.stamp_study_participation_end() from public, anon, authenticated;
create trigger stamp_study_participation_end
  before update on public.study_participations
  for each row execute function public.stamp_study_participation_end();

create function public.start_study(p_study_id bigint)
returns public.study_participations
language plpgsql security invoker set search_path = '' as $$
declare participation public.study_participations;
begin
  insert into public.study_participations (profile_id, study_id)
  values (auth.uid(), p_study_id)
  on conflict (profile_id, study_id) do nothing;

  select * into strict participation from public.study_participations
  where profile_id = auth.uid() and study_id = p_study_id;
  return participation;
end;
$$;

create function public.end_study(p_study_id bigint)
returns public.study_participations
language plpgsql security invoker set search_path = '' as $$
declare participation public.study_participations;
begin
  update public.study_participations set ended_at = statement_timestamp()
  where profile_id = auth.uid() and study_id = p_study_id
  returning * into participation;
  if not found then
    raise exception 'Start this study before ending it';
  end if;
  return participation;
end;
$$;

revoke all on function public.start_study(bigint), public.end_study(bigint)
  from public, anon, authenticated;
grant execute on function public.start_study(bigint), public.end_study(bigint)
  to authenticated;
