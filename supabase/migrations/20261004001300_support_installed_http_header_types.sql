-- Supabase's installed http version uses composite headers; the variadic
-- http_headers convenience function is available only in newer versions.
create or replace function funnystudy_notifications.send_email_request(
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
    array[
      ('Authorization', 'Bearer ' || api_key)::extensions.http_header,
      ('Idempotency-Key', idempotency_key)::extensions.http_header
    ],
    'application/json', payload::text
  )::extensions.http_request) response;
end;
$$;
revoke all on function funnystudy_notifications.send_email_request(jsonb, text, text)
  from public, anon, authenticated;
