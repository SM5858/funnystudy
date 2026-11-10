-- Auth has no access to extensions. Use PostgreSQL's built-in SHA-256 rather
-- than granting the Auth role access to unrelated extension functions.
create or replace function funnystudy_notifications.send_sms_auth_hook(event jsonb)
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
    encode(sha256(convert_to(ltrim(phone, '+') || otp, 'utf8')), 'hex'));
  return '{}'::jsonb;
end;
$$;
