-- Managed pg_net transport tables are readable by PUBLIC and owned by
-- supabase_admin. Use synchronous HTTP so credentials never enter that queue.
create extension if not exists http with schema extensions;

create function funnystudy_notifications.send_email_request(
  payload jsonb, api_key text, idempotency_key text
)
returns table (status integer, content text)
language plpgsql security invoker set search_path = '' as $$
begin
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '5000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '10000');
  return query select response.status, response.content::text
  from extensions.http((
    'POST', 'https://api.resend.com/emails',
    extensions.http_headers('Authorization', 'Bearer ' || api_key,
      'Idempotency-Key', idempotency_key),
    'application/json', payload::text
  )::extensions.http_request) response;
end;
$$;
revoke all on function funnystudy_notifications.send_email_request(jsonb, text, text)
  from public, anon, authenticated;

create or replace function funnystudy_notifications.deliver_emails(
  at_time timestamptz default statement_timestamp()
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  delivery funnystudy_notifications.email_deliveries;
  response record;
  response_body jsonb;
  response_status integer;
  api_key text;
  config_enabled boolean;
  dispatched integer := 0;
  eligibility_time timestamptz;
begin
  if not pg_try_advisory_xact_lock(61004000300) then return 0; end if;
  select enabled into strict config_enabled from funnystudy_notifications.email_config;

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

    for delivery in
      select * from funnystudy_notifications.email_deliveries
      where status in ('queued', 'retry') and next_attempt_at <= at_time
      order by next_attempt_at, id limit 8 for update skip locked
    loop
      -- A preceding HTTP call can take time; use fresh time/data for each user.
      eligibility_time := greatest(at_time, clock_timestamp());
      if delivery.created_at + interval '6 hours' <= eligibility_time
        or delivery.reminder_date <> (eligibility_time at time zone 'America/New_York')::date
        or not exists (
          select 1 from funnystudy_notifications.email_recipients(eligibility_time) recipient
          where recipient.profile_id = delivery.profile_id and recipient.email = delivery.payload->'to'->>0
        ) then
        update funnystudy_notifications.email_deliveries
        set status = 'cancelled', last_error = 'No longer eligible or delivery window ended'
        where id = delivery.id;
        continue;
      end if;
      response_body := null;
      response_status := null;
      begin
        select * into response from funnystudy_notifications.send_email_request(
          delivery.payload, api_key,
          'funnystudy-daily/' || md5(delivery.payload::text) || '/' ||
            delivery.profile_id::text || '/' || delivery.reminder_date::text
        );
        response_status := response.status;
        begin
          response_body := response.content::jsonb;
        exception when invalid_text_representation then null;
        end;
      exception when others then
        -- Do not record HTTP headers, credentials, or raw provider errors.
        response_status := null;
      end;
      if response_status between 200 and 299
        and nullif(response_body->>'id', '') is not null then
        update funnystudy_notifications.email_deliveries
        set status = 'sent', attempts = attempts + 1, sent_at = eligibility_time,
          requested_at = eligibility_time, provider_id = response_body->>'id',
          last_status = response_status, last_error = null
        where id = delivery.id;
      else
        update funnystudy_notifications.email_deliveries
        set status = case
            when delivery.attempts + 1 >= 20 or response_status in (400, 401, 403, 404, 422)
              or response_body->>'name' = 'invalid_idempotent_request' then 'failed'
            else 'retry' end,
          attempts = attempts + 1, requested_at = eligibility_time,
          last_status = response_status,
          last_error = case when response_status is not null
            then 'Resend HTTP ' || response_status::text else 'Resend request failed or timed out' end,
          next_attempt_at = greatest(at_time, clock_timestamp()) + make_interval(
            secs := least(300, power(2, delivery.attempts + 1)::integer)
          )
        where id = delivery.id;
      end if;
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
revoke all on function funnystudy_notifications.deliver_emails(timestamptz)
  from public, anon, authenticated;

-- No production reminders existed during rollout. Preserve safety on upgrades
-- that have an outstanding legacy request by retrying its frozen payload/key.
update funnystudy_notifications.email_deliveries
set status = 'retry', request_id = null, next_attempt_at = statement_timestamp()
where status = 'sending';
