-- All provider requests are mocked. Existing Auth/profile/study data, ledgers,
-- function definitions, and scheduler changes roll back; no real call is made.
begin;
set local statement_timeout='45s';
create temporary table study_voice_test_requests(application_id text,payload jsonb);
create temporary table study_voice_test_response(status integer,content text,fail_network boolean);
insert into study_voice_test_response values(200,null,false);
create or replace function funnystudy_notifications.send_voice_request(connection_id text,payload jsonb)
returns table(status integer,content text)
language plpgsql security invoker set search_path='' as $$
begin
  insert into pg_temp.study_voice_test_requests values(connection_id,payload);
  if (select fail_network from pg_temp.study_voice_test_response) then raise exception 'Mock timeout'; end if;
  return query select r.status,coalesce(r.content,jsonb_build_object(
    'call_sid','mock-call-id','from',payload->>'From','to',payload->>'To','status','queued')::text)
    from pg_temp.study_voice_test_response r;
end;
$$;

do $$
declare participant uuid; other_participant uuid; first_study bigint; second_study bigint;
  test_time timestamptz:='2035-01-15 17:00:00+00'; delivery_id bigint; dispatched integer;
  delivery funnystudy_notifications.voice_deliveries; http_status integer; response_text text;
begin
  if has_schema_privilege('anon','funnystudy_notifications','usage')
    or has_schema_privilege('authenticated','funnystudy_notifications','usage') then
    raise exception 'Participant roles must not access the notification schema'; end if;
  if has_table_privilege('authenticated','funnystudy_notifications.voice_config','update')
    or has_table_privilege('authenticated','funnystudy_notifications.voice_deliveries','select')
    or has_table_privilege('supabase_auth_admin','funnystudy_notifications.voice_deliveries','insert')
    or has_function_privilege('authenticated','funnystudy_notifications.queue_daily_voice(timestamptz)','execute')
    or has_function_privilege('anon','funnystudy_notifications.send_voice_request(text,jsonb)','execute')
    or has_function_privilege('supabase_auth_admin','funnystudy_notifications.deliver_voice()','execute') then
    raise exception 'Only the owner may configure, queue, or dial reminders'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='funnystudy_notifications' and p.proname in
      ('voice_recipients','voice_reminder_texml','queue_daily_voice','voice_is_deliverable',
       'send_voice_request','send_claimed_voice','deliver_voice') and p.prosecdef) then
    raise exception 'Voice work must use invoker privileges'; end if;
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='funnystudy_notifications' and p.proname='deliver_voice'
      and p.prokind='p' and p.proconfig is null) then
    raise exception 'The durable claim requires a procedure without a SET clause'; end if;
  if not exists(select 1 from cron.job where jobname='funnystudy-voice-noon' and schedule='0 16,17 * * *')
    or not exists(select 1 from cron.job where jobname='funnystudy-voice-delivery'
      and schedule='1 second' and command='call funnystudy_notifications.deliver_voice();') then
    raise exception 'Voice noon and delivery jobs must be installed'; end if;
  if not funnystudy_notifications.is_noon_eastern('2027-01-15 17:00:00+00')
    or funnystudy_notifications.is_noon_eastern('2027-01-15 16:00:00+00')
    or not funnystudy_notifications.is_noon_eastern('2027-07-15 16:00:00+00')
    or funnystudy_notifications.is_noon_eastern('2027-07-15 17:00:00+00')
    or not funnystudy_notifications.is_noon_eastern('2027-03-14 16:00:00+00')
    or not funnystudy_notifications.is_noon_eastern('2027-11-07 17:00:00+00') then
    raise exception 'Noon Eastern must follow winter/summer and both DST transitions'; end if;
  response_text:=funnystudy_notifications.voice_reminder_texml('https://example.test?x=<&y=');
  if not xml_is_well_formed_document(response_text)
    or response_text not like '%&lt;&amp;%'
    or response_text not like '%<Hangup/>%'
    or response_text not like '%choose No for Phone call%' then
    raise exception 'Spoken reminders must escape XML, explain opt-out, and hang up'; end if;

  select id into participant from public.profiles where not is_superadmin order by id limit 1;
  select id into other_participant from public.profiles where not is_superadmin and id<>participant order by id limit 1;
  select id into first_study from public.studies order by id limit 1;
  select id into second_study from public.studies where id<>first_study order by id limit 1;
  if participant is null or other_participant is null or first_study is null or second_study is null then
    raise exception 'Voice checks need two participant accounts and two studies'; end if;
  delete from funnystudy_notifications.voice_deliveries;
  update funnystudy_notifications.voice_config set enabled=true,sender='+15550009999',connection_id='1234567890';
  update public.profiles set notify_new_study_phone_call=false;
  update auth.users set phone=case when id=participant then '15550000001' else '+15550000002' end,
    phone_confirmed_at=test_time where id in(participant,other_participant);
  update public.studies set is_private=true;
  delete from public.study_participations where profile_id in(participant,other_participant)
    and study_id in(first_study,second_study);
  update public.studies set is_private=false,start_datetime_utc=null,end_datetime_utc=null where id=first_study;
  update public.profiles set notify_new_study_email=true,notify_new_study_sms=true,
    notify_new_study_phone_call=null where id in(participant,other_participant);
  if exists(select 1 from funnystudy_notifications.voice_recipients(test_time)) then
    raise exception 'NULL and other channel opt-ins must never grant call consent'; end if;
  update public.profiles set notify_new_study_phone_call=true where id in(participant,other_participant);
  update public.studies set is_private=true where id=first_study;
  if exists(select 1 from funnystudy_notifications.voice_recipients(test_time)) then
    raise exception 'Private studies must not produce calls'; end if;
  update public.studies set is_private=false,start_datetime_utc=test_time+interval '1 microsecond',
    end_datetime_utc=null where id=first_study;
  if exists(select 1 from funnystudy_notifications.voice_recipients(test_time)) then
    raise exception 'Upcoming studies must not produce calls'; end if;
  update public.studies set start_datetime_utc=null,end_datetime_utc=test_time-interval '1 microsecond' where id=first_study;
  if exists(select 1 from funnystudy_notifications.voice_recipients(test_time)) then
    raise exception 'Expired studies must not produce calls'; end if;
  update public.studies set start_datetime_utc=test_time,end_datetime_utc=test_time where id=first_study;
  if (select count(*) from funnystudy_notifications.voice_recipients(test_time))<>2 then
    raise exception 'Inclusive active boundaries must qualify both verified accounts'; end if;
  if not exists(select 1 from funnystudy_notifications.voice_recipients(test_time)
    where profile_id=participant and phone='+15550000001') then
    raise exception 'Auth phone numbers must normalize to E.164'; end if;
  insert into public.study_participations(profile_id,study_id,started_at,ended_at)
    values(participant,first_study,test_time-interval '1 hour',test_time),
      (other_participant,first_study,test_time-interval '1 hour',null);
  if (select count(*) from funnystudy_notifications.voice_recipients(test_time))<>1 then
    raise exception 'In-progress remains eligible; completed participation is excluded'; end if;
  update public.studies set is_private=false,start_datetime_utc=null,end_datetime_utc=null where id=second_study;
  if (select count(*) from funnystudy_notifications.voice_recipients(test_time))<>2 then
    raise exception 'Another unfinished public study must remain eligible'; end if;
  update auth.users set phone_confirmed_at=null where id=participant;
  if exists(select 1 from funnystudy_notifications.voice_recipients(test_time) where profile_id=participant) then
    raise exception 'Unverified phones must not receive calls'; end if;
  update auth.users set phone_confirmed_at=test_time,phone='bad-phone' where id=participant;
  if exists(select 1 from funnystudy_notifications.voice_recipients(test_time) where profile_id=participant) then
    raise exception 'Malformed verified numbers must not receive calls'; end if;
  update auth.users set phone='15550000001' where id=participant;
  update funnystudy_notifications.voice_config set enabled=false;
  if funnystudy_notifications.queue_daily_voice(test_time)<>0 then raise exception 'Disabled configuration queued calls'; end if;
  update funnystudy_notifications.voice_config set enabled=true;
  if funnystudy_notifications.queue_daily_voice(test_time-interval '1 hour')<>0 then raise exception 'Wrong UTC slot queued calls'; end if;
  if funnystudy_notifications.queue_daily_voice(test_time)<>2
    or funnystudy_notifications.queue_daily_voice(test_time)<>0 then
    raise exception 'Repeated noon runs must queue only one call per user/day'; end if;
  if not exists(select 1 from cron.job where jobname='funnystudy-voice-delivery' and active) then
    raise exception 'A nonempty queue must start the worker'; end if;
  if funnystudy_notifications.queue_daily_voice(test_time+interval '1 day')<>2 then
    raise exception 'An unfinished study must produce a new reminder on the next day'; end if;
  if exists(select 1 from funnystudy_notifications.voice_deliveries
    where texml not like '%Sparkling Javascript, Incorporated%'
      or texml not like '%3 1 0, 4 2 5, 5 5 5 5%') then
    raise exception 'Artificial-voice calls must identify the legal operator and its contact number'; end if;

  select id into delivery_id from funnystudy_notifications.voice_deliveries
    where profile_id=other_participant and reminder_date=(test_time at time zone 'America/New_York')::date;
  update funnystudy_notifications.voice_deliveries set status='sending',attempts=1,requested_at=test_time where id=delivery_id;
  perform funnystudy_notifications.send_claimed_voice(delivery_id,test_time);
  select * into delivery from funnystudy_notifications.voice_deliveries where id=delivery_id;
  if delivery.status<>'accepted' or delivery.provider_id<>'mock-call-id' or delivery.accepted_at<>test_time then
    raise exception 'Only a successful flat call_sid response may be accepted'; end if;
  if not exists(select 1 from pg_temp.study_voice_test_requests where application_id='1234567890'
    and payload->>'From'='+15550009999' and payload->>'To'='+15550000002'
    and payload->>'Texml'=delivery.texml and not(payload ? 'Url')) then
    raise exception 'Use the documented case-sensitive inline TeXML request'; end if;
  select count(*) into dispatched from pg_temp.study_voice_test_requests;
  perform funnystudy_notifications.send_claimed_voice(delivery_id,test_time);
  if (select count(*) from pg_temp.study_voice_test_requests)<>dispatched then
    raise exception 'Already accepted calls must not be redialed'; end if;

  foreach http_status in array array[400,401,403,429,503,200] loop
    update pg_temp.study_voice_test_response set status=http_status,
      content=case when http_status=200 then '{"data":{"id":"wrong-sms-shape"}}' else 'not-json' end;
    update funnystudy_notifications.voice_deliveries set status='sending',attempts=1 where id=delivery_id;
    perform funnystudy_notifications.send_claimed_voice(delivery_id,test_time);
    select * into delivery from funnystudy_notifications.voice_deliveries where id=delivery_id;
    if delivery.status<>(case when http_status=429 then 'queued' when http_status in(400,401,403) then 'failed' else 'unknown' end) then
      raise exception 'Incorrect provider classification for HTTP %',http_status; end if;
    if http_status=429 and delivery.next_attempt_at<>test_time+interval '1 minute' then
      raise exception 'Only rejected rate-limited requests may retry after one minute'; end if;
  end loop;
  update pg_temp.study_voice_test_response set status=429;
  update funnystudy_notifications.voice_deliveries set status='sending',attempts=5 where id=delivery_id;
  perform funnystudy_notifications.send_claimed_voice(delivery_id,test_time);
  if not exists(select 1 from funnystudy_notifications.voice_deliveries where id=delivery_id and status='failed') then
    raise exception 'Rate-limit retries must be bounded'; end if;
  update pg_temp.study_voice_test_response set fail_network=true;
  update funnystudy_notifications.voice_deliveries set status='sending',attempts=1 where id=delivery_id;
  perform funnystudy_notifications.send_claimed_voice(delivery_id,test_time);
  if not exists(select 1 from funnystudy_notifications.voice_deliveries where id=delivery_id and status='unknown') then
    raise exception 'Uncertain requests must never automatically redial'; end if;
  update pg_temp.study_voice_test_response set fail_network=false,status=200,content=null;

  select count(*) into dispatched from pg_temp.study_voice_test_requests;
  update public.profiles set notify_new_study_phone_call=false where id=other_participant;
  update funnystudy_notifications.voice_deliveries set status='sending' where id=delivery_id;
  perform funnystudy_notifications.send_claimed_voice(delivery_id,test_time);
  if not exists(select 1 from funnystudy_notifications.voice_deliveries where id=delivery_id and status='cancelled') then
    raise exception 'An opt-out after noon must cancel dialing'; end if;
  update public.profiles set notify_new_study_phone_call=true where id=other_participant;
  update auth.users set phone='+15550000004' where id=other_participant;
  update funnystudy_notifications.voice_deliveries set status='sending' where id=delivery_id;
  perform funnystudy_notifications.send_claimed_voice(delivery_id,test_time);
  if not exists(select 1 from funnystudy_notifications.voice_deliveries where id=delivery_id and status='cancelled') then
    raise exception 'Changing the verified destination must cancel the old call'; end if;
  update auth.users set phone='+15550000002' where id=other_participant;
  update public.studies set is_private=true where id in(first_study,second_study);
  update funnystudy_notifications.voice_deliveries set status='sending' where id=delivery_id;
  perform funnystudy_notifications.send_claimed_voice(delivery_id,test_time);
  if not exists(select 1 from funnystudy_notifications.voice_deliveries where id=delivery_id and status='cancelled') then
    raise exception 'Newly private studies must cancel queued calls'; end if;
  update public.studies set is_private=false,end_datetime_utc=null where id in(first_study,second_study);
  delete from public.study_participations where profile_id=other_participant and study_id in(first_study,second_study);
  insert into public.study_participations(profile_id,study_id,started_at,ended_at)
    values(other_participant,first_study,test_time-interval '1 hour',test_time),
      (other_participant,second_study,test_time-interval '1 hour',test_time);
  update funnystudy_notifications.voice_deliveries set status='sending' where id=delivery_id;
  perform funnystudy_notifications.send_claimed_voice(delivery_id,test_time);
  if not exists(select 1 from funnystudy_notifications.voice_deliveries where id=delivery_id and status='cancelled') then
    raise exception 'Finishing all studies after noon must cancel calls'; end if;
  delete from public.study_participations where profile_id=other_participant and study_id in(first_study,second_study);
  update funnystudy_notifications.voice_deliveries set status='sending' where id=delivery_id;
  perform funnystudy_notifications.send_claimed_voice(delivery_id,test_time+interval '6 hours');
  if not exists(select 1 from funnystudy_notifications.voice_deliveries where id=delivery_id and status='cancelled') then
    raise exception 'Stale calls must expire after six hours'; end if;
  select * into delivery from funnystudy_notifications.voice_deliveries where id=delivery_id;
  delivery.reminder_date:=delivery.reminder_date-1;
  if funnystudy_notifications.voice_is_deliverable(delivery,test_time) then
    raise exception 'An earlier Eastern date must never be dialed'; end if;
  if (select count(*) from pg_temp.study_voice_test_requests)<>dispatched then
    raise exception 'Ineligible requests must be cancelled before HTTP'; end if;
end;
$$;
select 'Voice checks passed; HTTP mocked, all fixtures roll back' as result;
rollback;
