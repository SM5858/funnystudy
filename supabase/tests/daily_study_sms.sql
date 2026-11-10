-- No real message can leave these checks. All fixtures, Auth data, cron changes,
-- and the temporary HTTP helper replacement are restored by ROLLBACK.
begin;
set local statement_timeout = '45s';
create temporary table study_sms_test_requests (payload jsonb);
create temporary table study_sms_test_response (status integer, content text, fail_network boolean);
insert into study_sms_test_response values (200, '{"data":{"id":"mock-sms-id"}}', false);
create or replace function funnystudy_notifications.send_sms_request(payload jsonb)
returns table(status integer, content text)
language plpgsql security invoker set search_path = '' as $$
begin
  insert into pg_temp.study_sms_test_requests values (payload);
  if (select fail_network from pg_temp.study_sms_test_response) then raise exception 'Mock timeout'; end if;
  return query select r.status,r.content from pg_temp.study_sms_test_response r;
end;
$$;

do $$
declare participant uuid; other_participant uuid; first_study bigint; second_study bigint;
  test_time timestamptz := '2035-01-15 17:00:00+00'; delivery_id bigint; dispatched integer;
begin
  if has_schema_privilege('anon','funnystudy_notifications','usage')
    or has_schema_privilege('authenticated','funnystudy_notifications','usage')
    or has_table_privilege('authenticated','funnystudy_notifications.sms_deliveries','select')
    or has_function_privilege('authenticated','funnystudy_notifications.send_sms_request(jsonb)','execute')
    or has_function_privilege('anon','funnystudy_notifications.queue_daily_sms(timestamptz)','execute')
    or has_function_privilege('authenticated','funnystudy_notifications.send_sms_auth_hook(jsonb)','execute')
    or has_function_privilege('authenticated','funnystudy_notifications.deliver_sms()','execute') then
    raise exception 'SMS ledgers, transports, cron, and Auth hooks must not be available to participants';
  end if;
  if has_table_privilege('supabase_auth_admin','funnystudy_notifications.sms_deliveries','select')
    or not has_table_privilege('supabase_auth_admin','funnystudy_notifications.sms_deliveries','insert')
    or not has_column_privilege('supabase_auth_admin','funnystudy_notifications.sms_config','verification_enabled','select')
    or not has_function_privilege('supabase_auth_admin','pg_catalog.sha256(bytea)','execute')
    or not has_function_privilege('supabase_auth_admin','funnystudy_notifications.send_sms_auth_hook(jsonb)','execute') then
    raise exception 'Auth must be able to queue verification without reading existing messages';
  end if;
  if not funnystudy_notifications.is_noon_eastern('2027-01-15 17:00:00+00')
    or funnystudy_notifications.is_noon_eastern('2027-01-15 16:00:00+00')
    or not funnystudy_notifications.is_noon_eastern('2027-07-15 16:00:00+00')
    or funnystudy_notifications.is_noon_eastern('2027-07-15 17:00:00+00')
    or not funnystudy_notifications.is_noon_eastern('2027-03-14 16:00:00+00')
    or not funnystudy_notifications.is_noon_eastern('2027-11-07 17:00:00+00') then
    raise exception 'SMS noon must respect winter, summer, and DST transitions';
  end if;
  if not exists (select 1 from cron.job where jobname='funnystudy-sms-noon' and schedule='0 16,17 * * *')
    or not exists (select 1 from cron.job where jobname='funnystudy-sms-delivery'
      and schedule='1 second' and command='call funnystudy_notifications.deliver_sms();') then
    raise exception 'The noon and durable-claim worker jobs must be installed';
  end if;
  select id into participant from public.profiles where not is_superadmin order by id limit 1;
  select id into other_participant from public.profiles where not is_superadmin and id<>participant order by id limit 1;
  select id into first_study from public.studies order by id limit 1;
  select id into second_study from public.studies where id<>first_study order by id limit 1;
  if participant is null or other_participant is null or first_study is null or second_study is null then
    raise exception 'Verification requires two participant accounts and two studies';
  end if;
  perform set_config('test.sms_participant',participant::text,true);
  delete from funnystudy_notifications.sms_deliveries;
  update funnystudy_notifications.sms_config set enabled=true, verification_enabled=true,
    sender='+15550009999', messaging_profile_id='00000000-0000-4000-8000-000000000001';
  update public.profiles set notify_new_study_sms=false;
  update auth.users set phone=case when id=participant then '15550000001' else '15550000002' end,
    phone_confirmed_at=test_time where id in (participant,other_participant);
  update public.studies set is_private=true;
  delete from public.study_participations where profile_id in(participant,other_participant)
    and study_id in(first_study,second_study);
  update public.profiles set notify_new_study_email=true, notify_new_study_phone_call=true
    where id in(participant,other_participant);
  if exists(select 1 from funnystudy_notifications.sms_recipients(test_time)) then
    raise exception 'Email and phone-call preferences must not enable SMS'; end if;
  update public.profiles set notify_new_study_sms=true where id in(participant,other_participant);
  if exists(select 1 from funnystudy_notifications.sms_recipients(test_time)) then
    raise exception 'Private studies must not enable reminders'; end if;
  update public.studies set is_private=false,start_datetime_utc=test_time+interval '1 minute',end_datetime_utc=null where id=first_study;
  if exists(select 1 from funnystudy_notifications.sms_recipients(test_time)) then
    raise exception 'Upcoming studies must not enable reminders'; end if;
  update public.studies set start_datetime_utc=null,end_datetime_utc=test_time-interval '1 minute' where id=first_study;
  if exists(select 1 from funnystudy_notifications.sms_recipients(test_time)) then
    raise exception 'Expired studies must not enable reminders'; end if;
  update public.studies set start_datetime_utc=test_time,end_datetime_utc=test_time where id=first_study;
  if (select count(*) from funnystudy_notifications.sms_recipients(test_time))<>2 then
    raise exception 'Both inclusive boundaries must allow reminders'; end if;
  update public.profiles set notify_new_study_sms=null where id=participant;
  if exists(select 1 from funnystudy_notifications.sms_recipients(test_time) where profile_id=participant) then
    raise exception 'NULL SMS preference must not grant consent'; end if;
  update public.profiles set notify_new_study_sms=true where id=participant;
  insert into public.study_participations(profile_id,study_id,started_at,ended_at)
  values(participant,first_study,test_time-interval '1 hour',test_time),
    (other_participant,first_study,test_time-interval '1 hour',null);
  if (select count(*) from funnystudy_notifications.sms_recipients(test_time))<>1 then
    raise exception 'In-progress is eligible, completed is not'; end if;
  update public.studies set is_private=false,start_datetime_utc=null,end_datetime_utc=null where id=second_study;
  if (select count(*) from funnystudy_notifications.sms_recipients(test_time))<>2 then
    raise exception 'Completing one study must not suppress another unfinished study'; end if;
  update auth.users set phone_confirmed_at=null where id=participant;
  if (select count(*) from funnystudy_notifications.sms_recipients(test_time))<>1 then
    raise exception 'Unverified phone numbers must not receive reminders'; end if;
  update auth.users set phone_confirmed_at=test_time,phone='not-a-number' where id=participant;
  if (select count(*) from funnystudy_notifications.sms_recipients(test_time))<>1 then
    raise exception 'Malformed phone numbers must be skipped'; end if;
  update auth.users set phone='+15550000001' where id=participant;
  if (select phone from funnystudy_notifications.sms_recipients(test_time) where profile_id=participant)<>'+15550000001'
    or (select phone from funnystudy_notifications.sms_recipients(test_time) where profile_id=other_participant)<>'+15550000002' then
    raise exception 'Phone numbers with and without a leading plus must be normalized'; end if;
  update funnystudy_notifications.sms_config set enabled=false;
  if funnystudy_notifications.queue_daily_sms(test_time)<>0 then raise exception 'Disabled reminders must not queue'; end if;
  update funnystudy_notifications.sms_config set enabled=true;
  if funnystudy_notifications.queue_daily_sms(test_time-interval '1 hour')<>0
    or funnystudy_notifications.queue_daily_sms(test_time)<>2
    or funnystudy_notifications.queue_daily_sms(test_time+interval '30 seconds')<>0
    or funnystudy_notifications.queue_daily_sms(test_time+interval '1 day')<>2 then
    raise exception 'One SMS per participant per Eastern day must queue only at noon'; end if;
  if exists(select 1 from funnystudy_notifications.sms_deliveries
    where body not like '%/settings%' or body not like '%Reply STOP%') then
    raise exception 'SMS must include study/settings links and opt-out instructions'; end if;
  delete from funnystudy_notifications.sms_deliveries where reminder_date<>'2035-01-15';
  update public.profiles set notify_new_study_sms=false where id=participant;
  if funnystudy_notifications.cancel_ineligible_sms(test_time)<>1 then
    raise exception 'Opt-out after queueing must cancel the pending reminder'; end if;
  select id into delivery_id from funnystudy_notifications.sms_deliveries where profile_id=other_participant;
  update funnystudy_notifications.sms_deliveries set status='sending',attempts=1,requested_at=test_time where id=delivery_id;
  perform funnystudy_notifications.send_claimed_sms(delivery_id,test_time);
  if not exists(select 1 from funnystudy_notifications.sms_deliveries where id=delivery_id and status='sent' and provider_id='mock-sms-id') then
    raise exception 'A valid Telnyx response must record provider acceptance'; end if;
  perform funnystudy_notifications.send_claimed_sms(delivery_id,test_time);
  if (select count(*) from pg_temp.study_sms_test_requests)<>1 then raise exception 'Sent rows must not be resent'; end if;
  for dispatched in 1..4 loop
    update funnystudy_notifications.sms_deliveries set status='sending',attempts=1 where id=delivery_id;
    update pg_temp.study_sms_test_response set
      status=case dispatched when 1 then 429 when 2 then 400 when 3 then 503 else 200 end,
      content=case when dispatched=4 then 'not-json' else '{}' end;
    perform funnystudy_notifications.send_claimed_sms(delivery_id,test_time);
    if not exists(select 1 from funnystudy_notifications.sms_deliveries where id=delivery_id
      and status=case dispatched when 1 then 'queued' when 2 then 'failed' else 'unknown' end) then
      raise exception 'Rate limits retry; permanent rejections fail; uncertain responses must not resend'; end if;
  end loop;
  update pg_temp.study_sms_test_response set fail_network=true;
  update funnystudy_notifications.sms_deliveries set status='sending' where id=delivery_id;
  perform funnystudy_notifications.send_claimed_sms(delivery_id,test_time);
  if not exists(select 1 from funnystudy_notifications.sms_deliveries where id=delivery_id and status='unknown') then
    raise exception 'Network timeouts must not cause a duplicate SMS retry'; end if;
  update pg_temp.study_sms_test_response set fail_network=false,status=200,content='{"data":{"id":"mock-sms-id"}}';
  update auth.users set phone='15550000003' where id=other_participant;
  update funnystudy_notifications.sms_deliveries set status='sending' where id=delivery_id;
  perform funnystudy_notifications.send_claimed_sms(delivery_id,test_time);
  if not exists(select 1 from funnystudy_notifications.sms_deliveries where id=delivery_id and status='cancelled') then
    raise exception 'Phone changes must prevent delivery to the old number'; end if;
  update auth.users set phone='15550000002' where id=other_participant;
  update public.studies set is_private=true where id in(first_study,second_study);
  update funnystudy_notifications.sms_deliveries set status='sending' where id=delivery_id;
  perform funnystudy_notifications.send_claimed_sms(delivery_id,test_time);
  if not exists(select 1 from funnystudy_notifications.sms_deliveries where id=delivery_id and status='cancelled') then
    raise exception 'Privacy must be rechecked before sending'; end if;
  update public.studies set is_private=false,end_datetime_utc=null where id in(first_study,second_study);
  delete from public.study_participations where profile_id=other_participant and study_id in(first_study,second_study);
  insert into public.study_participations(profile_id,study_id,started_at,ended_at)
  values(other_participant,first_study,test_time-interval '1 hour',test_time),
    (other_participant,second_study,test_time-interval '1 hour',test_time);
  update funnystudy_notifications.sms_deliveries set status='sending' where id=delivery_id;
  perform funnystudy_notifications.send_claimed_sms(delivery_id,test_time);
  if not exists(select 1 from funnystudy_notifications.sms_deliveries where id=delivery_id and status='cancelled') then
    raise exception 'Finishing all active public studies must cancel queued SMS'; end if;
  delete from public.study_participations where profile_id=other_participant;
  update funnystudy_notifications.sms_deliveries set status='sending' where id=delivery_id;
  perform funnystudy_notifications.send_claimed_sms(delivery_id,test_time+interval '6 hours');
  if not exists(select 1 from funnystudy_notifications.sms_deliveries where id=delivery_id and status='cancelled') then
    raise exception 'Reminders must expire after six hours'; end if;
end;
$$;

-- Auth queues the pending phone change. Participants cannot call this hook.
-- Managed Supabase prohibits SET ROLE supabase_auth_admin from postgres.
-- Its narrow grants are checked above; exercise the same hook as the owner.
select funnystudy_notifications.send_sms_auth_hook(jsonb_build_object(
  'user',jsonb_build_object('id',current_setting('test.sms_participant'),'phone','15550000001','new_phone','15550000004'),
  'sms',jsonb_build_object('otp','123456')
));
do $$
declare delivery funnystudy_notifications.sms_deliveries;
begin
  select * into strict delivery from funnystudy_notifications.sms_deliveries where kind='verification';
  if delivery.to_phone<>'+15550000004' then raise exception 'OTP must target the pending new number'; end if;
  update auth.users set phone_change='15550000004',phone_change_token=delivery.verification_hash
  where id=delivery.profile_id;
  update funnystudy_notifications.sms_deliveries set status='sending',attempts=1,requested_at=now() where id=delivery.id;
  perform funnystudy_notifications.send_claimed_sms(delivery.id,now());
  if not exists(select 1 from funnystudy_notifications.sms_deliveries where id=delivery.id
    and status='sent' and body='[verification code removed]') then
    raise exception 'Verification SMS must be sent and the code removed from the ledger'; end if;
  update funnystudy_notifications.sms_deliveries set status='sending' where id=delivery.id;
  update auth.users set phone_change_token='newer-code' where id=delivery.profile_id;
  perform funnystudy_notifications.send_claimed_sms(delivery.id,now());
  if not exists(select 1 from funnystudy_notifications.sms_deliveries where id=delivery.id and status='cancelled') then
    raise exception 'A replaced verification code must not be delivered'; end if;
end;
$$;
select 'SMS checks passed; HTTP mocked, all fixtures roll back' as result;
rollback;
