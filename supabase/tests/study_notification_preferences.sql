-- Run as an administrator. Existing account fixtures and all preference writes
-- roll back; no notification delivery or new auth accounts are involved.
begin;
set local statement_timeout = '15s';

do $$
declare participant uuid; other_participant uuid; administrator uuid;
begin
  if (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in (
        'notify_new_study_email', 'notify_new_study_sms', 'notify_new_study_phone_call'
      )
      and data_type = 'boolean' and is_nullable = 'YES' and (column_default is null or column_default = 'NULL::boolean')
  ) <> 3 then
    raise exception 'All notification preferences must be nullable booleans defaulting to NULL';
  end if;

  select id into participant from public.profiles where not is_superadmin order by id limit 1;
  select id into other_participant from public.profiles
    where not is_superadmin and id <> participant order by id limit 1;
  select id into administrator from public.profiles where is_superadmin order by id limit 1;
  if participant is null or other_participant is null or administrator is null then
    raise exception 'Verification requires two participant profiles and a superadmin';
  end if;
  perform set_config('test.participant', participant::text, true);
  perform set_config('test.other_participant', other_participant::text, true);
  perform set_config('test.administrator', administrator::text, true);
  perform set_config('request.jwt.claim.sub', participant::text, true);
end;
$$;

update public.profiles
set notify_new_study_email = false, notify_new_study_sms = false,
  notify_new_study_phone_call = false
where id in (
  current_setting('test.participant')::uuid, current_setting('test.other_participant')::uuid
);

set local role authenticated;
do $$
declare preferences public.profiles; affected integer;
begin
  update public.profiles set first_name = first_name, last_name = last_name
  where id = current_setting('test.participant')::uuid;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Existing own-profile name updates were blocked'; end if;

  update public.profiles set notify_new_study_email = true
  where id = current_setting('test.participant')::uuid returning * into preferences;
  if preferences.id is null or not preferences.notify_new_study_email
    or preferences.notify_new_study_sms or preferences.notify_new_study_phone_call then
    raise exception 'Email opt-in did not save independently';
  end if;

  update public.profiles set notify_new_study_sms = true
  where id = current_setting('test.participant')::uuid returning * into preferences;
  if not preferences.notify_new_study_email or not preferences.notify_new_study_sms
    or preferences.notify_new_study_phone_call then
    raise exception 'SMS opt-in changed another channel';
  end if;

  update public.profiles set notify_new_study_phone_call = true
  where id = current_setting('test.participant')::uuid returning * into preferences;
  if not preferences.notify_new_study_email or not preferences.notify_new_study_sms
    or not preferences.notify_new_study_phone_call then
    raise exception 'Phone call opt-in did not save';
  end if;

  update public.profiles set notify_new_study_email = false, notify_new_study_sms = false
  where id = current_setting('test.participant')::uuid returning * into preferences;
  if preferences.notify_new_study_email or preferences.notify_new_study_sms
    or not preferences.notify_new_study_phone_call then
    raise exception 'Opting out changed an unrelated preference';
  end if;

  update public.profiles set notify_new_study_email = default,
    notify_new_study_sms = default, notify_new_study_phone_call = default
  where id = current_setting('test.participant')::uuid returning * into preferences;
  if preferences.notify_new_study_email is not null or preferences.notify_new_study_sms is not null
    or preferences.notify_new_study_phone_call is not null then
    raise exception 'Unanswered preferences must default to NULL';
  end if;
  update public.profiles set notify_new_study_email = true
  where id = current_setting('test.participant')::uuid returning * into preferences;
  if preferences.notify_new_study_email is distinct from true or preferences.notify_new_study_sms is not null
    or preferences.notify_new_study_phone_call is not null then
    raise exception 'Answering email must preserve unanswered channels';
  end if;
  update public.profiles set notify_new_study_email = null
  where id = current_setting('test.participant')::uuid returning * into preferences;
  if preferences.notify_new_study_email is not null then
    raise exception 'Participant could not restore an unanswered preference';
  end if;

  update public.profiles
  set notify_new_study_email = true, notify_new_study_sms = true,
    notify_new_study_phone_call = true
  where id = current_setting('test.other_participant')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Another participant could change these preferences'; end if;

  begin
    update public.profiles set is_superadmin = true
    where id = current_setting('test.participant')::uuid;
    raise exception 'Participant could grant themselves superadmin access';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Superadmins retain the existing ability to administer another profile.
do $$
declare affected integer;
begin
  perform set_config('request.jwt.claim.sub', current_setting('test.administrator'), true);
  update public.profiles
  set notify_new_study_email = true, notify_new_study_sms = false,
    notify_new_study_phone_call = true
  where id = current_setting('test.other_participant')::uuid;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Superadmin preference updates were blocked'; end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$
declare affected integer;
begin
  begin
    update public.profiles
    set notify_new_study_email = false, notify_new_study_sms = true,
      notify_new_study_phone_call = false
    where id = current_setting('test.other_participant')::uuid;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Anonymous preference update was allowed'; end if;
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
do $$
begin
  if not exists (
    select 1 from public.profiles
    where id = current_setting('test.other_participant')::uuid
      and notify_new_study_email and not notify_new_study_sms and notify_new_study_phone_call
  ) then
    raise exception 'Another user or anonymous session modified protected preferences';
  end if;
end;
$$;
rollback;
select 'PASS: NULL defaults, independent opt-ins/outs/unanswered preferences, and owner/admin permissions' as result;
