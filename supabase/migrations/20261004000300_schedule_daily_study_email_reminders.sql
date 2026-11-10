-- Database-owned scheduling avoids a service-role key or a public cron endpoint.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create schema funnystudy_notifications;
revoke all on schema funnystudy_notifications from public, anon, authenticated;

create table funnystudy_notifications.email_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  sender text not null,
  site_url text not null check (site_url ~ '^https://[^/[:space:]]+$')
);
insert into funnystudy_notifications.email_config (sender, site_url)
values ('Humor Study <notifications@thehumorproject.org>', 'https://www.humorstudy.org');

create table funnystudy_notifications.email_deliveries (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reminder_date date not null,
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'retry', 'sent', 'cancelled', 'failed')),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  created_at timestamptz not null default statement_timestamp(),
  next_attempt_at timestamptz not null default statement_timestamp(),
  request_id bigint,
  requested_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_status integer,
  last_error text,
  unique (profile_id, reminder_date)
);
create index email_deliveries_pending_idx
  on funnystudy_notifications.email_deliveries (next_attempt_at, id)
  where status in ('queued', 'sending', 'retry');

alter table funnystudy_notifications.email_config enable row level security;
alter table funnystudy_notifications.email_deliveries enable row level security;
revoke all on all tables in schema funnystudy_notifications from public, anon, authenticated;
revoke all on all sequences in schema funnystudy_notifications from public, anon, authenticated;

-- Use the verified account email, rather than a client-editable profile email.
-- Window boundaries are inclusive; null bounds remain open-ended, as on home.
create function funnystudy_notifications.email_recipients(at_time timestamptz)
returns table (profile_id uuid, email text, first_name text)
language sql stable security invoker set search_path = '' as $$
  select p.id, u.email, p.first_name
  from public.profiles p join auth.users u on u.id = p.id
  where p.notify_new_study_email
    and u.email_confirmed_at is not null
    and u.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
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

create function funnystudy_notifications.is_noon_eastern(at_time timestamptz)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select extract(hour from at_time at time zone 'America/New_York') = 12
    and extract(minute from at_time at time zone 'America/New_York') = 0;
$$;

create function funnystudy_notifications.set_delivery_job_active(is_active boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare job_id bigint;
begin
  select jobid into job_id from cron.job
  where jobname = 'funnystudy-email-delivery' and active <> is_active;
  if job_id is not null then
    perform cron.alter_job(job_id := job_id, active := is_active);
  end if;
end;
$$;

create function funnystudy_notifications.queue_daily_emails(
  at_time timestamptz default statement_timestamp()
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare config funnystudy_notifications.email_config; queued integer;
begin
  select * into strict config from funnystudy_notifications.email_config;
  if not config.enabled or not funnystudy_notifications.is_noon_eastern(at_time) then
    return 0;
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'funnystudy_resend_api_key' and decrypted_secret <> ''
  ) then
    raise exception 'The study email Resend secret has not been configured';
  end if;

  insert into funnystudy_notifications.email_deliveries
    (profile_id, reminder_date, payload, created_at, next_attempt_at)
  select recipient.profile_id, (at_time at time zone 'America/New_York')::date,
    jsonb_build_object(
      'from', config.sender,
      'to', jsonb_build_array(recipient.email),
      'subject', 'A humor study is waiting for you',
      'text', concat(
        case when nullif(btrim(recipient.first_name), '') is null then 'Hello!'
          else 'Hi ' || btrim(recipient.first_name) || '!' end,
        E'\n\nThere is an active public humor study you haven''t completed yet. ',
        E'Like the captions you find funny, then finish the study to see your humor stats.\n\n',
        'View available studies: ', config.site_url, E'/\n\n',
        E'You received this daily reminder because you chose email study notifications.\n',
        'Manage your preferences or turn off email reminders: ', config.site_url, '/settings'
      )
    ), at_time, at_time
  from funnystudy_notifications.email_recipients(at_time) recipient
  on conflict (profile_id, reminder_date) do nothing;
  get diagnostics queued = row_count;
  if exists (
    select 1 from funnystudy_notifications.email_deliveries
    where status in ('queued', 'retry', 'sending')
  ) then
    perform funnystudy_notifications.set_delivery_job_active(true);
  end if;
  return queued;
end;
$$;

-- Keep the exact payload and idempotency key on retry. Resend retains keys for
-- 24 hours; this queue expires after six hours, well within that window.
create function funnystudy_notifications.deliver_emails(
  at_time timestamptz default statement_timestamp()
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  delivery funnystudy_notifications.email_deliveries;
  response net._http_response;
  response_body jsonb;
  api_key text;
  config_enabled boolean;
  dispatched integer := 0;
  request bigint;
begin
  if not pg_try_advisory_xact_lock(61004000300) then return 0; end if;
  select enabled into strict config_enabled from funnystudy_notifications.email_config;

  for delivery in
    select * from funnystudy_notifications.email_deliveries
    where status = 'sending' order by id for update
  loop
    select * into response from net._http_response where id = delivery.request_id;
    if not found and delivery.requested_at > at_time - interval '2 minutes' then
      continue;
    end if;
    response_body := null;
    begin
      response_body := response.content::jsonb;
    exception when invalid_text_representation then null;
    end;
    if response.status_code between 200 and 299
      and nullif(response_body->>'id', '') is not null then
      update funnystudy_notifications.email_deliveries
      set status = 'sent', sent_at = at_time, provider_id = response_body->>'id',
        last_status = response.status_code, last_error = null
      where id = delivery.id;
    else
      update funnystudy_notifications.email_deliveries
      set status = case
          when delivery.attempts >= 20 or response.status_code in (400, 401, 403, 404, 422)
            or response_body->>'name' = 'invalid_idempotent_request' then 'failed'
          else 'retry' end,
        last_status = response.status_code,
        last_error = case when response.status_code is not null
          then 'Resend HTTP ' || response.status_code::text
          else 'Resend response timed out or was unavailable' end,
        next_attempt_at = at_time + make_interval(
          secs := least(300, power(2, delivery.attempts)::integer)
        )
      where id = delivery.id;
    end if;
  end loop;

  -- Recheck consent, account email, privacy, active windows, and completion
  -- before every attempt. Do not carry a missed day's reminders into tomorrow.
  update funnystudy_notifications.email_deliveries d
  set status = 'cancelled', last_error = 'No longer eligible or delivery window ended'
  where d.status in ('queued', 'retry') and (
    not config_enabled
    or d.reminder_date <> (at_time at time zone 'America/New_York')::date
    or d.created_at + interval '6 hours' <= at_time
    or not exists (
      select 1 from funnystudy_notifications.email_recipients(at_time) recipient
      where recipient.profile_id = d.profile_id and recipient.email = d.payload->'to'->>0
    )
  );

  if config_enabled and exists (
    select 1 from funnystudy_notifications.email_deliveries
    where status in ('queued', 'retry') and next_attempt_at <= at_time
  ) then
    select decrypted_secret into strict api_key from vault.decrypted_secrets
    where name = 'funnystudy_resend_api_key';
    if api_key = '' then raise exception 'The study email Resend secret is empty'; end if;

    -- At most eight calls per second, below Resend's ten-call team limit.
    -- The worker sleeps by deactivating itself once the day's queue is drained.
    for delivery in
      select * from funnystudy_notifications.email_deliveries
      where status in ('queued', 'retry') and next_attempt_at <= at_time
      order by next_attempt_at, id limit 8 for update skip locked
    loop
      request := net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || api_key,
          'Content-Type', 'application/json',
          'Idempotency-Key', 'funnystudy-daily/' || md5(delivery.payload::text) || '/' ||
            delivery.profile_id::text || '/' || delivery.reminder_date::text
        ),
        body := delivery.payload,
        timeout_milliseconds := 10000
      );
      update funnystudy_notifications.email_deliveries
      set status = 'sending', attempts = attempts + 1, request_id = request,
        requested_at = at_time
      where id = delivery.id;
      dispatched := dispatched + 1;
    end loop;
  end if;

  if not exists (
    select 1 from funnystudy_notifications.email_deliveries
    where status in ('queued', 'sending', 'retry')
  ) then
    perform funnystudy_notifications.set_delivery_job_active(false);
  end if;
  return dispatched;
end;
$$;

revoke all on all functions in schema funnystudy_notifications from public, anon, authenticated;

-- pg_cron is UTC/GMT on Supabase. Try both possible noon UTC hours and let the
-- America/New_York guard select exactly one, including the DST transition days.
select cron.schedule('funnystudy-email-noon', '0 16,17 * * *',
  $$select funnystudy_notifications.queue_daily_emails();$$);
select cron.schedule('funnystudy-email-delivery', '1 second',
  $$select funnystudy_notifications.deliver_emails();$$);
select funnystudy_notifications.set_delivery_job_active(false);

-- Bound this worker's run history without touching other applications' jobs.
select cron.schedule('funnystudy-email-history-cleanup', '0 6 * * *', $$
  delete from cron.job_run_details
  where jobid in (select jobid from cron.job where jobname in
    ('funnystudy-email-noon', 'funnystudy-email-delivery', 'funnystudy-email-history-cleanup'))
    and end_time < now() - interval '7 days';
$$);

comment on table funnystudy_notifications.email_deliveries is
  'Private daily email ledger: one reminder per opted-in profile and Eastern date. No browser access.';
comment on function funnystudy_notifications.queue_daily_emails(timestamptz) is
  'Cron-only noon Eastern queue. Configuration stays disabled until Vault and the verified sender are ready.';
