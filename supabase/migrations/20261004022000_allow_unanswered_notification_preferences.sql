-- NULL means the participant has not answered; only TRUE grants consent.
-- Preserve existing choices. Account-specific testing resets are separate.
alter table public.profiles
  alter column notify_new_study_email drop not null,
  alter column notify_new_study_email set default null,
  alter column notify_new_study_sms drop not null,
  alter column notify_new_study_sms set default null,
  alter column notify_new_study_phone_call drop not null,
  alter column notify_new_study_phone_call set default null;

comment on column public.profiles.notify_new_study_email is
  'New study email preference: true = opted in, false = opted out, null = unanswered.';
comment on column public.profiles.notify_new_study_sms is
  'New study text message preference: true = opted in, false = opted out, null = unanswered.';
comment on column public.profiles.notify_new_study_phone_call is
  'New study phone call preference: true = opted in, false = opted out, null = unanswered.';
