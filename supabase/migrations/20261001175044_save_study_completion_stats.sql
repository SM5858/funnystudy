-- Freeze the client run's stats in the same write as its end timestamp.
alter table public.study_participations add column completion_stats jsonb;

create function public.valid_study_completion_stats(p_stats jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare field text; value jsonb; numeric_value numeric;
begin
  if p_stats is null or jsonb_typeof(p_stats) <> 'object'
    or not (p_stats ?& array['likedCount', 'viewedCount', 'medianVoteTimeMs', 'medianNavigationTimeMs']) then
    return false;
  end if;
  foreach field in array array['likedCount', 'viewedCount', 'medianVoteTimeMs', 'medianNavigationTimeMs'] loop
    value := p_stats -> field;
    if field in ('medianVoteTimeMs', 'medianNavigationTimeMs') and value = 'null'::jsonb then
      continue;
    end if;
    if jsonb_typeof(value) <> 'number' then return false; end if;
    numeric_value := value::text::numeric;
    if numeric_value < 0 or numeric_value > 9007199254740991 or numeric_value <> trunc(numeric_value) then
      return false;
    end if;
  end loop;
  return (p_stats ->> 'likedCount')::numeric <= (p_stats ->> 'viewedCount')::numeric;
end;
$$;
revoke all on function public.valid_study_completion_stats(jsonb) from public, anon;
grant execute on function public.valid_study_completion_stats(jsonb) to authenticated;

alter table public.study_participations add constraint study_participations_valid_stats
  check (completion_stats is null or (
    ended_at is not null and public.valid_study_completion_stats(completion_stats)
  ));
grant update (completion_stats) on public.study_participations to authenticated;

create or replace function public.stamp_study_participation_end()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.ended_at := coalesce(old.ended_at, statement_timestamp());
  if old.ended_at is not null then
    -- Retries and later visits cannot replace the original completed run.
    new.completion_stats := old.completion_stats;
  end if;
  return new;
end;
$$;

-- Keep the one-argument function for older clients during rollout.
create function public.end_study(p_study_id bigint, p_completion_stats jsonb)
returns public.study_participations
language plpgsql security invoker set search_path = '' as $$
declare participation public.study_participations;
begin
  if not public.valid_study_completion_stats(p_completion_stats) then
    raise exception 'Invalid study stats' using errcode = '22023';
  end if;
  update public.study_participations
  set ended_at = statement_timestamp(), completion_stats = p_completion_stats
  where profile_id = auth.uid() and study_id = p_study_id
  returning * into participation;
  if not found then
    raise exception 'Start this study before ending it';
  end if;
  return participation;
end;
$$;
revoke all on function public.end_study(bigint, jsonb) from public, anon;
grant execute on function public.end_study(bigint, jsonb) to authenticated;
