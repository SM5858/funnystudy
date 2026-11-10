-- Phone reminders are independent of SMS and use inline TeXML: speak, hang up.
-- Only TRUE is consent. Auth owns the verified destination phone number.
create table funnystudy_notifications.voice_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  sender text check (sender ~ '^\+[1-9][0-9]{1,14}$'),
  connection_id text check (connection_id ~ '^[0-9]{1,30}$'),
  site_url text not null check (site_url ~ '^https://[^/[:space:]]+$')
);
insert into funnystudy_notifications.voice_config(site_url) values ('https://www.humorstudy.org');

create table funnystudy_notifications.voice_deliveries (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reminder_date date not null,
  to_phone text not null check (to_phone ~ '^\+[1-9][0-9]{1,14}$'),
  texml text not null,
  status text not null default 'queued'
    check (status in ('queued','sending','accepted','cancelled','failed','unknown')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default statement_timestamp(),
  next_attempt_at timestamptz not null default statement_timestamp(),
  requested_at timestamptz,
  accepted_at timestamptz,
  provider_id text,
  last_error text,
  unique(profile_id, reminder_date)
);
create index voice_deliveries_pending_idx on funnystudy_notifications.voice_deliveries(next_attempt_at,id)
  where status in ('queued','sending');
alter table funnystudy_notifications.voice_config enable row level security;
alter table funnystudy_notifications.voice_deliveries enable row level security;
revoke all on table funnystudy_notifications.voice_config, funnystudy_notifications.voice_deliveries
  from public,anon,authenticated,supabase_auth_admin;
revoke all on sequence funnystudy_notifications.voice_deliveries_id_seq
  from public,anon,authenticated,supabase_auth_admin;

create function funnystudy_notifications.voice_recipients(at_time timestamptz)
returns table(profile_id uuid, phone text)
language sql stable security invoker set search_path = '' as $$
  select p.id, '+' || ltrim(u.phone,'+')
  from public.profiles p join auth.users u on u.id=p.id
  where p.notify_new_study_phone_call is true
    and u.phone_confirmed_at is not null and u.phone ~ '^\+?[1-9][0-9]{1,14}$'
    and exists (
      select 1 from public.studies s where s.is_private=false
        and (s.start_datetime_utc is null or s.start_datetime_utc<=at_time)
        and (s.end_datetime_utc is null or s.end_datetime_utc>=at_time)
        and not exists (
          select 1 from public.study_participations participation
          where participation.profile_id=p.id and participation.study_id=s.id
            and participation.started_at is not null and participation.ended_at is not null
        )
    );
$$;

-- XML constructors escape configuration text instead of interpolating markup.
create function funnystudy_notifications.voice_reminder_texml(site_url text)
returns text language sql immutable security invoker set search_path = '' as $$
  select xmlelement(name "Response",
    xmlelement(name "Say", xmlattributes('Polly.Joanna' as voice, '1' as loop),
      'Hello. This is the Humor Study. An active public study is available for you to finish. Please visit ' ||
      replace(regexp_replace(site_url,'^https://',''),'.',' dot ') ||
      ' to take the study. To stop these daily phone reminders, choose No for Phone call in your Settings. Thank you.'),
    xmlelement(name "Hangup"))::text;
$$;

create function funnystudy_notifications.queue_daily_voice(at_time timestamptz default statement_timestamp())
returns integer language plpgsql security invoker set search_path = '' as $$
declare config funnystudy_notifications.voice_config; queued integer; job_id bigint;
begin
  select * into strict config from funnystudy_notifications.voice_config;
  if not config.enabled or not funnystudy_notifications.is_noon_eastern(at_time) then return 0; end if;
  if config.sender is null or config.connection_id is null then
    raise exception 'Configure the Telnyx caller and TeXML application first';
  end if;
  insert into funnystudy_notifications.voice_deliveries(profile_id,reminder_date,to_phone,texml,created_at,next_attempt_at)
  select r.profile_id,(at_time at time zone 'America/New_York')::date,r.phone,
    funnystudy_notifications.voice_reminder_texml(config.site_url),at_time,at_time
  from funnystudy_notifications.voice_recipients(at_time) r
  on conflict(profile_id,reminder_date) do nothing;
  get diagnostics queued=row_count;
  if queued>0 then
    select jobid into job_id from cron.job where jobname='funnystudy-voice-delivery' and not active;
    if job_id is not null then perform cron.alter_job(job_id:=job_id,active:=true); end if;
  end if;
  return queued;
end;
$$;

create function funnystudy_notifications.voice_is_deliverable(
  delivery funnystudy_notifications.voice_deliveries, at_time timestamptz
)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select enabled from funnystudy_notifications.voice_config)
    and delivery.reminder_date=(at_time at time zone 'America/New_York')::date
    and delivery.created_at+interval '6 hours'>at_time
    and exists(select 1 from funnystudy_notifications.voice_recipients(at_time) r
      where r.profile_id=delivery.profile_id and r.phone=delivery.to_phone);
$$;

-- Only the numeric application ID varies in this otherwise fixed provider URL.
-- Headers/keys never enter managed public pg_net queues or participant tables.
create function funnystudy_notifications.send_voice_request(connection_id text, payload jsonb)
returns table(status integer, content text)
language plpgsql security invoker set search_path = '' as $$
declare api_key text;
begin
  if connection_id is null or connection_id !~ '^[0-9]{1,30}$' then
    raise exception 'Invalid TeXML application ID';
  end if;
  select decrypted_secret into strict api_key from vault.decrypted_secrets
  where name='funnystudy_telnyx_api_key';
  if api_key='' then raise exception 'The Telnyx secret is empty'; end if;
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','5000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','10000');
  return query select response.status,response.content::text from extensions.http((
    'POST','https://api.telnyx.com/v2/texml/calls/' || connection_id,
    array[row('Authorization','Bearer ' || api_key)::extensions.http_header],
    'application/json',payload::text
  )::extensions.http_request) response;
end;
$$;

create function funnystudy_notifications.send_claimed_voice(delivery_id bigint, at_time timestamptz default clock_timestamp())
returns void language plpgsql security invoker set search_path = '' as $$
declare delivery funnystudy_notifications.voice_deliveries; config funnystudy_notifications.voice_config;
  response record; response_body jsonb; response_status integer; accepted_provider_id text;
begin
  select * into delivery from funnystudy_notifications.voice_deliveries
  where id=delivery_id and status='sending' for update;
  if not found then return; end if;
  if not funnystudy_notifications.voice_is_deliverable(delivery,at_time) then
    update funnystudy_notifications.voice_deliveries set status='cancelled',
      last_error='No longer eligible or delivery window ended' where id=delivery.id;
    return;
  end if;
  select * into strict config from funnystudy_notifications.voice_config;
  begin
    select * into response from funnystudy_notifications.send_voice_request(config.connection_id,jsonb_build_object(
      'From',config.sender,'To',delivery.to_phone,'Texml',delivery.texml
    ));
    response_status:=response.status;
    begin response_body:=response.content::jsonb;
    exception when others then response_body:=null; end;
    -- TeXML returns a FLAT object with call_sid, unlike SMS's data.id wrapper.
    if jsonb_typeof(response_body->'call_sid')='string'
      and response_body->>'to'=delivery.to_phone and response_body->>'from'=config.sender then
      accepted_provider_id:=nullif(btrim(response_body->>'call_sid'),'');
    end if;
  exception when others then response_status:=null;
  end;
  update funnystudy_notifications.voice_deliveries set
    status=case when response_status between 200 and 299 and accepted_provider_id is not null then 'accepted'
      when response_status=429 and delivery.attempts<5 then 'queued'
      when response_status between 400 and 499 then 'failed' else 'unknown' end,
    accepted_at=case when response_status between 200 and 299 and accepted_provider_id is not null then at_time end,
    provider_id=accepted_provider_id,
    next_attempt_at=at_time+interval '1 minute',
    last_error=case when response_status between 200 and 299 and accepted_provider_id is not null then null
      when response_status is null then 'Telnyx request outcome unknown; not redialed'
      else 'Telnyx HTTP ' || response_status::text end
  where id=delivery.id;
end;
$$;

-- A top-level CALL commits each reservation BEFORE dialing. A crash or timeout
-- must not ring a participant again when the first request may have succeeded.
-- Transaction control requires no SET clause, so qualify every object below.
create procedure funnystudy_notifications.deliver_voice()
language plpgsql security invoker as $$
declare delivery_id bigint; job_id bigint;
begin
  update funnystudy_notifications.voice_deliveries d set status='cancelled',
    last_error='No longer eligible or delivery window ended'
  where status='queued' and not funnystudy_notifications.voice_is_deliverable(d,clock_timestamp());
  update funnystudy_notifications.voice_deliveries set status='unknown',last_error='Interrupted worker; not redialed'
  where status='sending' and requested_at<clock_timestamp()-interval '2 minutes';
  update funnystudy_notifications.voice_deliveries set status='sending',attempts=attempts+1,requested_at=clock_timestamp()
  where id=(select id from funnystudy_notifications.voice_deliveries
    where status='queued' and next_attempt_at<=clock_timestamp() order by id limit 1 for update skip locked)
  returning id into delivery_id;
  commit;
  if delivery_id is not null then perform funnystudy_notifications.send_claimed_voice(delivery_id); end if;
  if not exists(select 1 from funnystudy_notifications.voice_deliveries where status in ('queued','sending')) then
    select jobid into job_id from cron.job where jobname='funnystudy-voice-delivery' and active;
    if job_id is not null then perform cron.alter_job(job_id:=job_id,active:=false); end if;
  end if;
end;
$$;

revoke all on function funnystudy_notifications.voice_recipients(timestamptz),
  funnystudy_notifications.voice_reminder_texml(text), funnystudy_notifications.queue_daily_voice(timestamptz),
  funnystudy_notifications.voice_is_deliverable(funnystudy_notifications.voice_deliveries,timestamptz),
  funnystudy_notifications.send_voice_request(text,jsonb), funnystudy_notifications.send_claimed_voice(bigint,timestamptz)
  from public,anon,authenticated,supabase_auth_admin;
revoke all on procedure funnystudy_notifications.deliver_voice() from public,anon,authenticated,supabase_auth_admin;

select cron.schedule('funnystudy-voice-noon','0 16,17 * * *',$$select funnystudy_notifications.queue_daily_voice();$$);
select cron.schedule('funnystudy-voice-delivery','1 second',$$call funnystudy_notifications.deliver_voice();$$);
select cron.alter_job(job_id:=(select jobid from cron.job where jobname='funnystudy-voice-noon'),active:=false);
select cron.alter_job(job_id:=(select jobid from cron.job where jobname='funnystudy-voice-delivery'),active:=false);
select cron.schedule('funnystudy-voice-cleanup','0 6 * * *',$$
  delete from cron.job_run_details where jobid in(select jobid from cron.job
    where jobname in('funnystudy-voice-noon','funnystudy-voice-delivery','funnystudy-voice-cleanup'))
    and end_time<now()-interval '7 days';
$$);

comment on table funnystudy_notifications.voice_deliveries is
  'Private daily call ledger. Accepted means Telnyx accepted the call; it does not prove the participant answered. Unknown outcomes are never automatically redialed.';
