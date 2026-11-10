-- SMS shares the email reminder's Eastern clock and study-completion rules.
-- Keep it disabled until an SMS transport and sending identity are configured.
create table funnystudy_notifications.sms_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  verification_enabled boolean not null default false,
  sender text check (sender ~ '^\+[1-9][0-9]{1,14}$'),
  messaging_profile_id uuid,
  site_url text not null check (site_url ~ '^https://[^/[:space:]]+$')
);
insert into funnystudy_notifications.sms_config (site_url)
values ('https://www.humorstudy.org');

create table funnystudy_notifications.sms_deliveries (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'reminder' check (kind in ('reminder', 'verification')),
  reminder_date date,
  to_phone text not null check (to_phone ~ '^\+[1-9][0-9]{1,14}$'),
  body text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'cancelled', 'failed', 'unknown')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default statement_timestamp(),
  next_attempt_at timestamptz not null default statement_timestamp(),
  requested_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  verification_hash text,
  check ((kind = 'reminder' and reminder_date is not null and verification_hash is null)
    or (kind = 'verification' and reminder_date is null and verification_hash is not null)),
  unique (profile_id, reminder_date)
);
create index sms_deliveries_pending_idx
  on funnystudy_notifications.sms_deliveries (kind, next_attempt_at, id)
  where status in ('queued', 'sending');

alter table funnystudy_notifications.sms_config enable row level security;
alter table funnystudy_notifications.sms_deliveries enable row level security;
revoke all on table funnystudy_notifications.sms_config,
  funnystudy_notifications.sms_deliveries from public, anon, authenticated;
revoke all on sequence funnystudy_notifications.sms_deliveries_id_seq
  from public, anon, authenticated;

-- Auth owns phone verification. Neither profile metadata nor an unverified
-- phone change is a valid recipient. Auth may store the number without '+'.
create function funnystudy_notifications.sms_recipients(at_time timestamptz)
returns table (profile_id uuid, phone text)
language sql stable security invoker set search_path = '' as $$
  select p.id, case when left(u.phone, 1) = '+' then u.phone else '+' || u.phone end
  from public.profiles p join auth.users u on u.id = p.id
  where p.notify_new_study_sms
    and u.phone_confirmed_at is not null
    and u.phone ~ '^\+?[1-9][0-9]{1,14}$'
    and exists (
      select 1 from public.studies s
      where s.is_private = false
        and (s.start_datetime_utc is null or s.start_datetime_utc <= at_time)
        and (s.end_datetime_utc is null or s.end_datetime_utc >= at_time)
        and not exists (
          select 1 from public.study_participations participation
          where participation.profile_id = p.id and participation.study_id = s.id
            and participation.started_at is not null and participation.ended_at is not null
        )
    );
$$;

create function funnystudy_notifications.queue_daily_sms(
  at_time timestamptz default statement_timestamp()
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare config funnystudy_notifications.sms_config; queued integer;
begin
  select * into strict config from funnystudy_notifications.sms_config;
  if not config.enabled or not funnystudy_notifications.is_noon_eastern(at_time) then
    return 0;
  end if;
  if config.sender is null or config.messaging_profile_id is null then
    raise exception 'Configure the Telnyx sending number and messaging profile first';
  end if;

  insert into funnystudy_notifications.sms_deliveries
    (profile_id, reminder_date, to_phone, body, created_at, next_attempt_at)
  select recipient.profile_id, (at_time at time zone 'America/New_York')::date,
    recipient.phone,
    'Humor Study: A public study is waiting for you to finish. ' || config.site_url ||
      '/ Manage reminders: ' || config.site_url || '/settings. Reply STOP to opt out.',
    at_time, at_time
  from funnystudy_notifications.sms_recipients(at_time) recipient
  on conflict (profile_id, reminder_date) do nothing;
  get diagnostics queued = row_count;
  return queued;
end;
$$;

-- A future transport calls this immediately before submitting a message.
-- Consent, the verified number, study availability, and completion can all
-- change between noon and delivery. Never carry a reminder into the next day.
create function funnystudy_notifications.cancel_ineligible_sms(
  at_time timestamptz default statement_timestamp()
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare cancelled integer;
begin
  update funnystudy_notifications.sms_deliveries d
  set status = 'cancelled', last_error = 'No longer eligible or delivery window ended'
  where d.status = 'queued' and d.kind = 'reminder' and (
    not (select enabled from funnystudy_notifications.sms_config)
    or d.reminder_date <> (at_time at time zone 'America/New_York')::date
    or d.created_at + interval '6 hours' <= at_time
    or not exists (
      select 1 from funnystudy_notifications.sms_recipients(at_time) recipient
      where recipient.profile_id = d.profile_id and recipient.phone = d.to_phone
    )
  );
  get diagnostics cancelled = row_count;
  return cancelled;
end;
$$;

revoke all on function funnystudy_notifications.sms_recipients(timestamptz),
  funnystudy_notifications.queue_daily_sms(timestamptz),
  funnystudy_notifications.cancel_ineligible_sms(timestamptz)
  from public, anon, authenticated;

select cron.schedule('funnystudy-sms-noon', '0 16,17 * * *',
  $$select funnystudy_notifications.queue_daily_sms();$$);
-- No automatic SMS work runs before a real transport is available.
select cron.alter_job(job_id := (
  select jobid from cron.job where jobname = 'funnystudy-sms-noon'
), active := false);

-- Activate only this application's worker when either Auth or noon queues SMS.
-- Auth cannot access cron, Vault, the HTTP helper, or existing ledger rows.
create function funnystudy_notifications.start_sms_worker()
returns trigger language plpgsql security definer set search_path = '' as $$
declare job_id bigint;
begin
  select jobid into job_id from cron.job
  where jobname = 'funnystudy-sms-delivery' and not active;
  if job_id is not null then perform cron.alter_job(job_id := job_id, active := true); end if;
  return new;
end;
$$;
revoke all on function funnystudy_notifications.start_sms_worker() from public, anon, authenticated;
create trigger sms_deliveries_start_worker after insert on funnystudy_notifications.sms_deliveries
  for each statement execute function funnystudy_notifications.start_sms_worker();

grant usage on schema funnystudy_notifications to supabase_auth_admin;
grant select (verification_enabled, sender, messaging_profile_id)
  on funnystudy_notifications.sms_config to supabase_auth_admin;
create policy sms_config_auth_read on funnystudy_notifications.sms_config
  for select to supabase_auth_admin using (true);
grant insert on funnystudy_notifications.sms_deliveries to supabase_auth_admin;
grant usage on sequence funnystudy_notifications.sms_deliveries_id_seq to supabase_auth_admin;
create policy sms_auth_verification_insert on funnystudy_notifications.sms_deliveries
  for insert to supabase_auth_admin with check (kind = 'verification');

-- Supabase Auth creates/rate-limits/checks the OTP. The hook queues it without
-- HTTP or secret access, so it stays inside Auth's short Postgres-hook timeout.
create function funnystudy_notifications.send_sms_auth_hook(event jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare phone text; otp text;
begin
  if not (select verification_enabled and sender is not null and messaging_profile_id is not null
    from funnystudy_notifications.sms_config) then
    raise exception 'Phone verification is not configured';
  end if;
  phone := coalesce(nullif(event->'sms'->>'phone', ''),
    nullif(event->'user'->>'new_phone', ''), event->'user'->>'phone');
  phone := '+' || ltrim(phone, '+');
  otp := event->'sms'->>'otp';
  if phone is null or phone !~ '^\+[1-9][0-9]{1,14}$' or otp is null or otp !~ '^[0-9]{6}$' then
    raise exception 'Invalid phone verification request';
  end if;
  insert into funnystudy_notifications.sms_deliveries
    (profile_id, kind, to_phone, body, verification_hash)
  values ((event->'user'->>'id')::uuid, 'verification', phone,
    'Humor Study: Your verification code is ' || otp || '. Do not share this code.',
    encode(extensions.digest(ltrim(phone, '+') || otp, 'sha256'), 'hex'));
  return '{}'::jsonb;
end;
$$;
revoke all on function funnystudy_notifications.send_sms_auth_hook(jsonb) from public, anon, authenticated;
grant execute on function funnystudy_notifications.send_sms_auth_hook(jsonb) to supabase_auth_admin;

create function funnystudy_notifications.send_sms_request(payload jsonb)
returns table (status integer, content text)
language plpgsql security invoker set search_path = '' as $$
declare api_key text;
begin
  select decrypted_secret into strict api_key from vault.decrypted_secrets
  where name = 'funnystudy_telnyx_api_key';
  if api_key = '' then raise exception 'The Telnyx secret is empty'; end if;
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '5000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '10000');
  return query select response.status, response.content::text
  from extensions.http((
    'POST', 'https://api.telnyx.com/v2/messages',
    array[row('Authorization', 'Bearer ' || api_key)::extensions.http_header],
    'application/json', payload::text
  )::extensions.http_request) response;
end;
$$;

create function funnystudy_notifications.sms_is_deliverable(
  delivery funnystudy_notifications.sms_deliveries, at_time timestamptz
)
returns boolean language sql stable security invoker set search_path = '' as $$
  select case when delivery.kind = 'reminder' then
    (select enabled from funnystudy_notifications.sms_config)
    and delivery.reminder_date = (at_time at time zone 'America/New_York')::date
    and delivery.created_at + interval '6 hours' > at_time
    and exists (select 1 from funnystudy_notifications.sms_recipients(at_time) r
      where r.profile_id = delivery.profile_id and r.phone = delivery.to_phone)
  else
    (select verification_enabled from funnystudy_notifications.sms_config)
    and delivery.created_at + interval '5 minutes' > at_time
    and exists (select 1 from auth.users u where u.id = delivery.profile_id
      and ((u.phone_change = ltrim(delivery.to_phone, '+')
          and u.phone_change_token = delivery.verification_hash)
        or (u.phone = ltrim(delivery.to_phone, '+')
          and (u.confirmation_token = delivery.verification_hash
            or u.reauthentication_token = delivery.verification_hash))))
  end;
$$;

-- This helper only sends a durably claimed row. The procedure below commits
-- the claim FIRST. A worker crash or uncertain HTTP result cannot resend it.
create function funnystudy_notifications.send_claimed_sms(
  delivery_id bigint, at_time timestamptz default clock_timestamp()
)
returns void language plpgsql security invoker set search_path = '' as $$
declare delivery funnystudy_notifications.sms_deliveries; config funnystudy_notifications.sms_config;
  response record; response_body jsonb; response_status integer; accepted_provider_id text;
begin
  select * into delivery from funnystudy_notifications.sms_deliveries
  where id = delivery_id and status = 'sending' for update;
  if not found then return; end if;
  if not funnystudy_notifications.sms_is_deliverable(delivery, at_time) then
    update funnystudy_notifications.sms_deliveries
    set status = 'cancelled', last_error = 'No longer eligible or delivery window ended',
      body = case when kind = 'verification' then '[verification code removed]' else body end
    where id = delivery.id;
    return;
  end if;
  select * into strict config from funnystudy_notifications.sms_config;
  begin
    select * into response from funnystudy_notifications.send_sms_request(jsonb_build_object(
      'from', config.sender, 'messaging_profile_id', config.messaging_profile_id,
      'to', delivery.to_phone, 'text', delivery.body, 'type', 'SMS'
    ));
    response_status := response.status;
    response_body := response.content::jsonb;
    accepted_provider_id := nullif(response_body->'data'->>'id', '');
  exception when others then response_status := null;
  end;
  update funnystudy_notifications.sms_deliveries set
    status = case
      when response_status between 200 and 299 and accepted_provider_id is not null then 'sent'
      when response_status = 429 and delivery.attempts < 5 then 'queued'
      when response_status between 400 and 499 then 'failed'
      else 'unknown' end,
    sent_at = case when response_status between 200 and 299 and accepted_provider_id is not null then at_time end,
    provider_id = accepted_provider_id,
    next_attempt_at = at_time + interval '1 minute',
    last_error = case
      when response_status between 200 and 299 and accepted_provider_id is not null then null
      when response_status is null then 'Telnyx request outcome unknown; not retried'
      else 'Telnyx HTTP ' || response_status::text end,
    body = case when kind = 'verification' and response_status is distinct from 429
      then '[verification code removed]' else body end
  where id = delivery.id;
end;
$$;

-- Transaction control requires a top-level CALL and no SET clause here.
-- Every object is schema-qualified; the procedure accepts no caller input.
create procedure funnystudy_notifications.deliver_sms()
language plpgsql security invoker as $$
declare delivery_id bigint; job_id bigint;
begin
  update funnystudy_notifications.sms_deliveries d
  set status = 'cancelled', last_error = 'No longer eligible or delivery window ended',
    body = case when kind = 'verification' then '[verification code removed]' else body end
  where status = 'queued' and not funnystudy_notifications.sms_is_deliverable(d, clock_timestamp());
  update funnystudy_notifications.sms_deliveries set status = 'unknown',
    last_error = 'Interrupted worker; not retried',
    body = case when kind = 'verification' then '[verification code removed]' else body end
  where status = 'sending' and requested_at < clock_timestamp() - interval '2 minutes';

  update funnystudy_notifications.sms_deliveries set status = 'sending',
    attempts = attempts + 1, requested_at = clock_timestamp()
  where id = (select id from funnystudy_notifications.sms_deliveries
    where status = 'queued' and next_attempt_at <= clock_timestamp()
    order by (kind = 'verification') desc, id limit 1 for update skip locked)
  returning id into delivery_id;
  commit;
  if delivery_id is not null then perform funnystudy_notifications.send_claimed_sms(delivery_id); end if;
  if not exists (select 1 from funnystudy_notifications.sms_deliveries where status in ('queued', 'sending')) then
    select jobid into job_id from cron.job where jobname = 'funnystudy-sms-delivery' and active;
    if job_id is not null then perform cron.alter_job(job_id := job_id, active := false); end if;
  end if;
end;
$$;

revoke all on function funnystudy_notifications.send_sms_request(jsonb),
  funnystudy_notifications.sms_is_deliverable(funnystudy_notifications.sms_deliveries, timestamptz),
  funnystudy_notifications.send_claimed_sms(bigint,timestamptz) from public, anon, authenticated;
revoke all on procedure funnystudy_notifications.deliver_sms() from public, anon, authenticated;
select cron.schedule('funnystudy-sms-delivery', '1 second', $$call funnystudy_notifications.deliver_sms();$$);
select cron.alter_job(job_id := (
  select jobid from cron.job where jobname = 'funnystudy-sms-delivery'
), active := false);
select cron.schedule('funnystudy-sms-cleanup', '0 6 * * *', $$
  update funnystudy_notifications.sms_deliveries set body = '[verification code removed]'
  where kind = 'verification' and created_at < now() - interval '5 minutes';
  delete from funnystudy_notifications.sms_deliveries
  where kind = 'verification' and created_at < now() - interval '1 day';
  delete from cron.job_run_details where jobid in (select jobid from cron.job
    where jobname in ('funnystudy-sms-noon', 'funnystudy-sms-delivery', 'funnystudy-sms-cleanup'))
    and end_time < now() - interval '7 days';
$$);

comment on table funnystudy_notifications.sms_deliveries is
  'Private SMS ledger: one daily reminder per profile/Eastern date; temporary Auth verification codes. No browser access.';
