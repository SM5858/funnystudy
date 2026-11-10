-- Identify the registered operator and give its business contact number in
-- every artificial-voice reminder (47 CFR 64.1200(b)(1)-(2)).
-- This is an informational, explicitly opted-in research reminder.
create or replace function funnystudy_notifications.voice_reminder_texml(site_url text)
returns text language sql immutable security invoker set search_path = '' as $$
  select xmlelement(name "Response",
    xmlelement(name "Say", xmlattributes('Polly.Joanna' as voice, '1' as loop),
      'Hello. This is Humor Study, operated by Sparkling Javascript, Incorporated. ' ||
      'An active public study is available for you to finish. Please visit ' ||
      replace(regexp_replace(site_url,'^https://',''),'.',' dot ') ||
      ' to take the study. To stop these daily phone reminders, choose No for Phone call in your Settings, ' ||
      'or contact Sparkling Javascript at 3 1 0, 4 2 5, 5 5 5 5. Thank you.'),
    xmlelement(name "Hangup"))::text;
$$;

revoke all on function funnystudy_notifications.voice_reminder_texml(text)
  from public, anon, authenticated, supabase_auth_admin;

-- Update instructions that have not been claimed by the worker. Accepted or
-- uncertain calls keep the exact instructions associated with their request.
update funnystudy_notifications.voice_deliveries
set texml = funnystudy_notifications.voice_reminder_texml(
  (select site_url from funnystudy_notifications.voice_config)
)
where status = 'queued';
