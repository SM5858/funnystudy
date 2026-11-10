-- Run as an administrator. All fixtures (including study date edits) roll back.
begin;
set local statement_timeout = '15s';
do $$
declare participant uuid; other_participant uuid;
begin
  select id into participant from public.profiles where not is_superadmin order by id limit 1;
  select id into other_participant from public.profiles where not is_superadmin and id <> participant order by id limit 1;
  if participant is null or other_participant is null then
    raise exception 'Verification requires two participant profiles';
  end if;
  perform set_config('test.participant', participant::text, true);
  perform set_config('test.other_participant', other_participant::text, true);
  perform set_config('request.jwt.claim.sub', participant::text, true);
end;
$$;

insert into public.studies (id, is_private, start_datetime_utc, end_datetime_utc)
overriding system value values
  (-91001, true, null, null),
  (-91002, false, null, now() - interval '1 day'),
  (-91003, false, now() + interval '1 day', null);

set local role authenticated;
do $$
declare first_start public.study_participations; retry public.study_participations;
  first_end public.study_participations; affected integer;
  stats jsonb := '{"likedCount":1,"viewedCount":3,"medianVoteTimeMs":1200,"medianNavigationTimeMs":2000}';
begin
  begin
    perform public.end_study(-91001);
    raise exception 'End without start unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'Start this study before ending it' then raise; end if;
  end;

  first_start := public.start_study(-91001);
  retry := public.start_study(-91001);
  if first_start.started_at is null or first_start.ended_at is not null
    or retry.started_at is distinct from first_start.started_at then
    raise exception 'Start or repeated start timestamps incorrect';
  end if;

  begin
    perform public.start_study(-91002);
    raise exception 'Expired start unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.start_study(-91003);
    raise exception 'Upcoming start unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.study_participations(profile_id, study_id)
    values (current_setting('test.other_participant')::uuid, -91001);
    raise exception 'Cross-user start unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.study_participations set started_at = now() - interval '1 day';
    raise exception 'Start timestamp edit unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.study_participations;
    raise exception 'Participation deletion unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.end_study(-91001, '{"likedCount":5,"viewedCount":3,"medianVoteTimeMs":null,"medianNavigationTimeMs":null}'::jsonb);
    raise exception 'Invalid stats unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;
  if exists (select 1 from public.study_participations where study_id = -91001 and ended_at is not null) then
    raise exception 'Failed stats save marked the study completed';
  end if;
  first_end := public.end_study(-91001, stats);
  retry := public.end_study(-91001, jsonb_set(stats, '{likedCount}', '0'));
  if first_end.completion_stats is distinct from stats or retry.completion_stats is distinct from stats then
    raise exception 'Completion stats were not saved or were overwritten on retry';
  end if;
  if first_end.ended_at is null or first_end.ended_at < first_end.started_at
    or retry.ended_at is distinct from first_end.ended_at then
    raise exception 'End or repeated end timestamps incorrect';
  end if;
  update public.study_participations set ended_at = null
  where study_id = -91001 returning * into retry;
  if retry.ended_at is distinct from first_end.ended_at then
    raise exception 'Completion was cleared';
  end if;
  update public.study_participations set completion_stats = null
  where study_id = -91001 returning * into retry;
  if retry.completion_stats is distinct from stats then
    raise exception 'Completion stats were cleared';
  end if;
  retry := public.start_study(-91001);
  if retry.started_at is distinct from first_start.started_at
    or retry.ended_at is distinct from first_end.ended_at then
    raise exception 'Restart overwrote participation';
  end if;

  perform set_config('request.jwt.claim.sub', current_setting('test.other_participant'), true);
  if exists (select 1 from public.study_participations where study_id = -91001) then
    raise exception 'Another participant could read this participation';
  end if;
  update public.study_participations set ended_at = now() where study_id = -91001;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-user update allowed'; end if;
  retry := public.start_study(-91001);
  if retry.profile_id <> current_setting('test.other_participant')::uuid then
    raise exception 'Study participation is not user scoped';
  end if;
end;
$$;

reset role;
update public.studies set end_datetime_utc = now() - interval '1 day' where id = -91001;
set local role authenticated;
do $$
declare ended public.study_participations;
begin
  ended := public.end_study(-91001);
  if ended.ended_at is null then raise exception 'Could not end after study expired'; end if;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform public.start_study(-91001);
    raise exception 'Anonymous start allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.end_study(-91001);
    raise exception 'Anonymous end allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.end_study(-91001, '{"likedCount":0,"viewedCount":0,"medianVoteTimeMs":null,"medianNavigationTimeMs":null}'::jsonb);
    raise exception 'Anonymous stats write allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.study_participations;
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
select 'PASS: participation timestamps, retries, active windows, and participant isolation' as result;
