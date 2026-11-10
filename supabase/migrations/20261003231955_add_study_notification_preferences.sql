-- Each channel is an independent opt-in for announcements of new humor studies.
-- Existing profiles and inserts that omit these fields remain opted out.
alter table public.profiles
  add column notify_new_study_email boolean not null default false,
  add column notify_new_study_sms boolean not null default false,
  add column notify_new_study_phone_call boolean not null default false;

comment on column public.profiles.notify_new_study_email is
  'Opt in to email announcements when a new humor study becomes available.';
comment on column public.profiles.notify_new_study_sms is
  'Opt in to text message announcements when a new humor study becomes available.';
comment on column public.profiles.notify_new_study_phone_call is
  'Opt in to phone call announcements when a new humor study becomes available.';

-- Existing permissive UPDATE policies combine with OR, including a policy with
-- USING (true). Enforce ownership with AND so another participant cannot edit
-- someone else's preferences or move their own profile to another user ID.
create policy "Profile updates require owner or superadmin"
  on public.profiles as restrictive for update to authenticated
  using (
    id = (select auth.uid()) or (select public.is_superadmin(auth.uid()))
  )
  with check (
    (id = (select auth.uid()) or (select public.is_superadmin(auth.uid())))
    and (not is_superadmin or (select public.is_superadmin(auth.uid())))
  );
