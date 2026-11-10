-- Administrator-only integration checks. Replace the private HTTP helper with
-- a transactional mock: no request can leave the database during these checks.
-- ROLLBACK restores the real helper and all account/study/delivery fixtures.
begin;
set local statement_timeout = '45s';

create temporary table study_email_test_requests (
  id bigint generated always as identity, payload jsonb, idempotency_key text
);
create temporary table study_email_test_response (status integer, content text, fail_network boolean);
insert into study_email_test_response values (200, '{"id":"rollback-only-provider-id"}', false);
create or replace function funnystudy_notifications.send_email_request(
  payload jsonb, api_key text, idempotency_key text
)
returns table (status integer, content text)
language plpgsql security invoker set search_path = '' as $$
begin
  if api_key is null or api_key = '' then raise exception 'Missing mock credential'; end if;
  insert into pg_temp.study_email_test_requests (payload, idempotency_key)
  values (payload, idempotency_key);
  if (select fail_network from pg_temp.study_email_test_response) then
    raise exception 'Mock network timeout';
  end if;
  return query select r.status, r.content from pg_temp.study_email_test_response r;
end;
$$;

do $$
declare
  participant uuid;
  other_participant uuid;
  first_study bigint;
  second_study bigint;
  test_time timestamptz := '2035-01-15 17:00:00+00';
  delivery funnystudy_notifications.email_deliveries;
  original_payload jsonb;
  original_key text;
  checked integer;
begin
  if not funnystudy_notifications.is_noon_eastern('2027-01-15 17:00:00+00')
    or funnystudy_notifications.is_noon_eastern('2027-01-15 16:00:00+00')
    or not funnystudy_notifications.is_noon_eastern('2027-07-15 16:00:00+00')
    or funnystudy_notifications.is_noon_eastern('2027-07-15 17:00:00+00')
    or not funnystudy_notifications.is_noon_eastern('2027-03-14 16:00:00+00')
    or not funnystudy_notifications.is_noon_eastern('2027-11-07 17:00:00+00')
    or funnystudy_notifications.is_noon_eastern('2027-07-15 16:01:00+00') then
    raise exception 'Noon Eastern must respect winter, summer, and DST transition dates';
  end if;
  if not exists (select 1 from cron.job where jobname = 'funnystudy-email-noon'
      and schedule = '0 16,17 * * *' and active)
    or not exists (select 1 from cron.job where jobname = 'funnystudy-email-delivery'
      and schedule = '1 second') then
    raise exception 'The noon and bounded delivery jobs must be installed';
  end if;
  if has_schema_privilege('anon', 'funnystudy_notifications', 'usage')
    or has_schema_privilege('authenticated', 'funnystudy_notifications', 'usage')
    or has_table_privilege('authenticated', 'funnystudy_notifications.email_deliveries', 'select')
    or has_function_privilege('authenticated', 'funnystudy_notifications.deliver_emails(timestamptz)', 'execute')
    or has_function_privilege('anon', 'funnystudy_notifications.queue_daily_emails(timestamptz)', 'execute') then
    raise exception 'Participants must not read the delivery ledger or invoke background jobs';
  end if;
  if has_function_privilege('authenticated', 'funnystudy_notifications.send_email_request(jsonb,text,text)', 'execute')
    or has_function_privilege('anon', 'funnystudy_notifications.send_email_request(jsonb,text,text)', 'execute') then
    raise exception 'The credential-bearing direct HTTP helper must remain private';
  end if;

  select p.id into participant from public.profiles p join auth.users u on u.id = p.id
  where not p.is_superadmin and u.email_confirmed_at is not null and u.email is not null
  order by p.id limit 1;
  select p.id into other_participant from public.profiles p join auth.users u on u.id = p.id
  where not p.is_superadmin and p.id <> participant and u.email_confirmed_at is not null and u.email is not null
  order by p.id limit 1;
  select id into first_study from public.studies order by id limit 1;
  select id into second_study from public.studies where id <> first_study order by id limit 1;
  if participant is null or other_participant is null or first_study is null or second_study is null then
    raise exception 'Verification needs two confirmed participant accounts and two studies';
  end if;

  -- Isolate eligibility without creating or delivering to any real account.
  delete from funnystudy_notifications.email_deliveries;
  update funnystudy_notifications.email_config set enabled = true;
  if not exists (select 1 from vault.secrets where name = 'funnystudy_resend_api_key') then
    perform vault.create_secret('rollback-only-study-email-test-key', 'funnystudy_resend_api_key');
  end if;
  update public.profiles set notify_new_study_email = false;
  update public.studies set is_private = true;
  delete from public.study_participations
  where profile_id in (participant, other_participant) and study_id in (first_study, second_study);
  update public.profiles set notify_new_study_sms = true, notify_new_study_phone_call = true
  where id in (participant, other_participant);
  if exists (select 1 from funnystudy_notifications.email_recipients(test_time)) then
    raise exception 'SMS and phone preferences must not opt a user into email';
  end if;
  update public.profiles set notify_new_study_email = true
  where id in (participant, other_participant);
  if exists (select 1 from funnystudy_notifications.email_recipients(test_time)) then
    raise exception 'Private studies must not generate reminders';
  end if;
  update public.studies set is_private = false,
    start_datetime_utc = test_time + interval '1 minute', end_datetime_utc = null
  where id = first_study;
  if exists (select 1 from funnystudy_notifications.email_recipients(test_time)) then
    raise exception 'Upcoming studies must not generate reminders';
  end if;
  update public.studies set start_datetime_utc = null, end_datetime_utc = test_time - interval '1 microsecond'
  where id = first_study;
  if exists (select 1 from funnystudy_notifications.email_recipients(test_time)) then
    raise exception 'Expired studies must not generate reminders';
  end if;
  update public.studies set start_datetime_utc = test_time, end_datetime_utc = test_time
  where id = first_study;
  if (select count(*) from funnystudy_notifications.email_recipients(test_time)) <> 2 then
    raise exception 'Active window boundaries must be inclusive';
  end if;
  update public.profiles set notify_new_study_email = null where id = participant;
  if exists(select 1 from funnystudy_notifications.email_recipients(test_time) where profile_id = participant) then
    raise exception 'NULL email preference must not grant consent';
  end if;
  update public.profiles set notify_new_study_email = true where id = participant;
  update public.studies set start_datetime_utc = null, end_datetime_utc = null where id = first_study;
  insert into public.study_participations (profile_id, study_id, started_at, ended_at)
  values (participant, first_study, test_time - interval '1 hour', test_time),
    (other_participant, first_study, test_time - interval '1 hour', null);
  if (select count(*) from funnystudy_notifications.email_recipients(test_time)) <> 1 then
    raise exception 'Completion must exclude only the completing user; in-progress studies remain eligible';
  end if;
  update public.studies set is_private = false, start_datetime_utc = null, end_datetime_utc = null
  where id = second_study;
  if (select count(*) from funnystudy_notifications.email_recipients(test_time)) <> 2 then
    raise exception 'Completing one study must not suppress another unfinished study';
  end if;

  update funnystudy_notifications.email_config set enabled = false;
  if funnystudy_notifications.queue_daily_emails(test_time) <> 0 then
    raise exception 'Disabled email configuration must not queue reminders';
  end if;
  update funnystudy_notifications.email_config set enabled = true;
  if funnystudy_notifications.queue_daily_emails(test_time - interval '1 hour') <> 0 then
    raise exception 'Reminders must not queue before noon';
  end if;
  if funnystudy_notifications.queue_daily_emails(test_time) <> 2 then
    raise exception 'Noon must queue one reminder per eligible user';
  end if;
  if funnystudy_notifications.queue_daily_emails(test_time + interval '30 seconds') <> 0 then
    raise exception 'Repeated noon runs must not queue duplicate reminders';
  end if;
  if (select count(*) from funnystudy_notifications.email_deliveries) <> 2
    or exists (select 1 from funnystudy_notifications.email_deliveries
      where reminder_date <> '2035-01-15' or payload->>'text' not like '%/settings%'
        or payload->>'text' not like '%https://%') then
    raise exception 'Emails must use the Eastern calendar date and contain study/settings links';
  end if;
  if funnystudy_notifications.queue_daily_emails(test_time + interval '1 day') <> 2 then
    raise exception 'An unfinished study must generate a fresh reminder on the next day';
  end if;
  delete from funnystudy_notifications.email_deliveries where reminder_date <> '2035-01-15';

  update public.profiles set notify_new_study_email = false where id = participant;
  update pg_temp.study_email_test_response set status = 429, content = '{"name":"rate_limit_exceeded"}';
  checked := funnystudy_notifications.deliver_emails(test_time);
  if checked <> 1 or not exists (select 1 from funnystudy_notifications.email_deliveries
      where profile_id = participant and status = 'cancelled') then
    raise exception 'Opt-out after queuing must cancel the reminder before delivery';
  end if;
  select * into strict delivery from funnystudy_notifications.email_deliveries
  where profile_id = other_participant;
  original_payload := delivery.payload;
  select idempotency_key into original_key from pg_temp.study_email_test_requests order by id desc limit 1;
  if delivery.status <> 'retry' or delivery.attempts <> 1
    or delivery.payload->'to'->>0 <> (select email from auth.users where id = other_participant)
    or original_key not like 'funnystudy-daily/%'
    or not exists (select 1 from pg_temp.study_email_test_requests where payload = original_payload) then
    raise exception 'Delivery must use the frozen payload and a stable idempotency key';
  end if;
  checked := funnystudy_notifications.deliver_emails(test_time + interval '1 second');
  if checked <> 0
    or not exists (select 1 from funnystudy_notifications.email_deliveries
      where id = delivery.id and status = 'retry' and attempts = 1) then
    raise exception 'Rate limiting must retry with backoff (dispatched %, status %, attempts %)',
      checked, (select status from funnystudy_notifications.email_deliveries where id = delivery.id),
      (select attempts from funnystudy_notifications.email_deliveries where id = delivery.id);
  end if;
  update pg_temp.study_email_test_response set status = 200, content = '{"id":"rollback-only-provider-id"}';
  if funnystudy_notifications.deliver_emails(test_time + interval '3 seconds') <> 1 then
    raise exception 'The retry must resume when the backoff expires';
  end if;
  select * into strict delivery from funnystudy_notifications.email_deliveries where id = delivery.id;
  if delivery.payload <> original_payload
    or (select count(*) from pg_temp.study_email_test_requests where idempotency_key = original_key and payload = original_payload) <> 2 then
    raise exception 'Retry must retain the exact payload and idempotency key';
  end if;
  if not exists (select 1 from funnystudy_notifications.email_deliveries
      where id = delivery.id and status = 'sent' and provider_id = 'rollback-only-provider-id')
    or exists (select 1 from cron.job where jobname = 'funnystudy-email-delivery' and active) then
    raise exception 'Only a successful provider response may mark sent; an empty worker must stop';
  end if;

  -- Simulate permanent, temporary, malformed, and network responses.
  update funnystudy_notifications.email_deliveries set status = 'queued',
    next_attempt_at = test_time, attempts = 0 where id = delivery.id;
  update pg_temp.study_email_test_response set status = 400, content = '{"name":"validation_error"}';
  perform funnystudy_notifications.deliver_emails(test_time + interval '5 seconds');
  if not exists (select 1 from funnystudy_notifications.email_deliveries where id = delivery.id and status = 'failed') then
    raise exception 'Permanent provider rejection must not loop or be reported as sent';
  end if;
  update funnystudy_notifications.email_deliveries set status = 'queued',
    next_attempt_at = test_time, attempts = 0 where id = delivery.id;
  update pg_temp.study_email_test_response set status = 503, content = '{}';
  perform funnystudy_notifications.deliver_emails(test_time + interval '6 seconds');
  if not exists (select 1 from funnystudy_notifications.email_deliveries where id = delivery.id and status = 'retry') then
    raise exception 'Temporary provider failure must be retriable';
  end if;
  update funnystudy_notifications.email_deliveries set status = 'queued',
    next_attempt_at = test_time, attempts = 0 where id = delivery.id;
  update pg_temp.study_email_test_response set status = 200, content = 'not-json';
  perform funnystudy_notifications.deliver_emails(test_time + interval '7 seconds');
  if not exists (select 1 from funnystudy_notifications.email_deliveries where id = delivery.id and status = 'retry') then
    raise exception 'Malformed success responses must not report delivery';
  end if;
  update funnystudy_notifications.email_deliveries set status = 'queued',
    next_attempt_at = test_time, attempts = 19 where id = delivery.id;
  update pg_temp.study_email_test_response set fail_network = true;
  perform funnystudy_notifications.deliver_emails(test_time + interval '3 minutes');
  if not exists (select 1 from funnystudy_notifications.email_deliveries where id = delivery.id and status = 'failed') then
    raise exception 'Network errors must stop at the bounded retry limit';
  end if;

  update funnystudy_notifications.email_deliveries set status = 'queued', attempts = 0,
    next_attempt_at = test_time where id = delivery.id;
  update public.studies set is_private = true where id in (first_study, second_study);
  perform funnystudy_notifications.deliver_emails(test_time + interval '10 minutes');
  if not exists (select 1 from funnystudy_notifications.email_deliveries where id = delivery.id and status = 'cancelled') then
    raise exception 'A study becoming private must cancel pending delivery';
  end if;
  update public.studies set is_private = false, end_datetime_utc = test_time
  where id in (first_study, second_study);
  update funnystudy_notifications.email_deliveries set status = 'queued' where id = delivery.id;
  perform funnystudy_notifications.deliver_emails(test_time + interval '10 minutes');
  if not exists (select 1 from funnystudy_notifications.email_deliveries where id = delivery.id and status = 'cancelled') then
    raise exception 'Expired studies must be rechecked before sending';
  end if;
  update public.studies set end_datetime_utc = null where id in (first_study, second_study);
  delete from public.study_participations where profile_id = other_participant
    and study_id in (first_study, second_study);
  insert into public.study_participations (profile_id, study_id, started_at, ended_at)
  values (other_participant, first_study, test_time - interval '1 hour', test_time),
    (other_participant, second_study, test_time - interval '1 hour', test_time);
  update funnystudy_notifications.email_deliveries set status = 'queued' where id = delivery.id;
  perform funnystudy_notifications.deliver_emails(test_time + interval '10 minutes');
  if not exists (select 1 from funnystudy_notifications.email_deliveries where id = delivery.id and status = 'cancelled') then
    raise exception 'Completing all public studies must cancel pending delivery';
  end if;
  delete from public.study_participations where profile_id = other_participant;
  update funnystudy_notifications.email_deliveries set status = 'queued' where id = delivery.id;
  perform funnystudy_notifications.deliver_emails(test_time + interval '6 hours');
  if not exists (select 1 from funnystudy_notifications.email_deliveries where id = delivery.id and status = 'cancelled') then
    raise exception 'Stale reminders must expire within the idempotency retention window';
  end if;
  update funnystudy_notifications.email_deliveries set status = 'queued',
    payload = jsonb_set(payload, '{to}', '["previous-address@example.invalid"]')
  where id = delivery.id;
  perform funnystudy_notifications.deliver_emails(test_time + interval '10 minutes');
  if not exists (select 1 from funnystudy_notifications.email_deliveries where id = delivery.id and status = 'cancelled') then
    raise exception 'Account email changes must prevent delivery to the old address';
  end if;
end;
$$;

-- Verify dispatch remains bounded even when many participants are eligible.
do $$
declare test_time timestamptz := '2035-01-16 17:00:00+00'; study bigint; recipients uuid[]; checked integer;
begin
  select array_agg(id) into recipients from (
    select p.id from public.profiles p join auth.users u on u.id = p.id
    where not p.is_superadmin and u.email_confirmed_at is not null
      and u.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    order by p.id limit 10
  ) accounts;
  if cardinality(recipients) <> 10 then raise exception 'Rate checks need ten confirmed accounts'; end if;
  select id into study from public.studies order by id limit 1;
  update pg_temp.study_email_test_response set status = 200,
    content = '{"id":"rollback-only-batch-id"}', fail_network = false;
  delete from funnystudy_notifications.email_deliveries;
  update public.profiles set notify_new_study_email = (id = any(recipients));
  update public.studies set is_private = (id <> study), start_datetime_utc = null, end_datetime_utc = null;
  delete from public.study_participations where profile_id = any(recipients) and study_id = study;
  checked := funnystudy_notifications.queue_daily_emails(test_time);
  if checked <> 10 then raise exception 'Expected ten eligible daily reminders, got %', checked; end if;
  checked := funnystudy_notifications.deliver_emails(test_time);
  if checked <> 8 or (select count(*) from funnystudy_notifications.email_deliveries where status = 'queued') <> 2 then
    raise exception 'A worker tick must dispatch at most eight emails';
  end if;
  checked := funnystudy_notifications.deliver_emails(test_time + interval '1 second');
  if checked <> 2 then raise exception 'The next worker tick must drain the remaining queue'; end if;
end;
$$;

select 'Daily study email checks passed; HTTP was mocked and all fixtures roll back' as result;
rollback;
