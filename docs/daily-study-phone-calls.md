# Daily study phone reminders

Production queues a Telnyx phone reminder at noon `America/New_York` for each participant with `profiles.notify_new_study_phone_call = TRUE`, a verified account phone number, and at least one active public study they have not completed. NULL and FALSE never grant consent. Email and SMS preferences are independent. A study is complete only when that user's participation has both start and end timestamps; starting it does not stop reminders. Completing one study does not suppress another unfinished study.

The call identifies “Humor Study, operated by Sparkling Javascript, Incorporated,” explains that an unfinished public study is available, and directs the participant to www.humorstudy.org. It offers Settings opt-out and speaks the supplied business contact number, +1 310 425 5555, distinct from the automated caller. It speaks once with `Polly.Joanna`, then hangs up. Settings and the post-login prompt explicitly disclose optional artificial/prerecorded-voice calls, daily frequency, and possible phone-plan charges; `/notification-terms` explains withdrawal and operator contact.

`20261004043000_identify_study_phone_reminder_operator.sql` updates the voice notice for the identification/contact requirements in [47 CFR 64.1200(b)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200). Applied and checked in staging and production on October 4, 2026 UTC. It replaces only the private XML generator and updates queued, unclaimed instructions. Delivery configuration is preserved; accepted and uncertain requests retain their original instructions. Apply using the fixed `update-notice` operation and run the existing rollback-only `check`; neither operation places a call.

## Scheduling and privacy

`20261004031500_schedule_daily_study_phone_reminders.sql` adds private `voice_config`, `voice_deliveries`, recipient selection, inline TeXML generation, Telnyx transport, and cron jobs. It depends on the existing notification schema, Eastern-clock helper, HTTP extension, Vault, and pg_cron. Apply repository migrations in order. Only production is enabled; staging remains disabled and has no voice credentials or sending identity.

- `funnystudy-voice-noon` runs `0 16,17 * * *` UTC/GMT. The shared Eastern-clock guard accepts only the noon slot for that date, including both DST changes.
- The ledger's `(profile_id, reminder_date)` uniqueness permits one reminder per participant/Eastern day, even with multiple qualifying studies or repeated cron runs. Every new day can queue another reminder while a study remains unfinished.
- Destinations come from `auth.users.phone` with `phone_confirmed_at`, normalized to E.164. Pending numbers and profile metadata cannot redirect calls.
- `funnystudy-voice-delivery` runs a top-level procedure once per second while work exists. It reserves a row and **commits before HTTP**. Immediately before dialing, it rechecks the preference, verified destination, public visibility, date window, and completion. Calls expire after six hours or at the next Eastern date.
- The transport sends `From`, `To`, and inline `Texml` to `POST https://api.telnyx.com/v2/texml/calls/{connection_id}`. The numeric connection ID is validated; browser input cannot supply an endpoint. XML constructors escape all message text. The shared Telnyx credential stays in encrypted Vault; it never enters managed public HTTP queues.
- A successful flat response containing `call_sid` and matching destinations is recorded as `accepted`. That means Telnyx accepted the dial request, not that the participant answered or heard the message. There is no recording, status webhook, or automatic redial for busy/unanswered calls.
- Rejected 429 requests retry after one minute, at most five attempts. Other client errors fail. Network failures, server errors, malformed success, and interrupted workers become `unknown` and are **not automatically redialed**: this endpoint does not document an idempotency key. A crash after submission may lose the outcome, but the committed reservation prevents a duplicate call.
- The worker stops on an empty queue. Cleanup prunes only this application's cron history older than seven days. Browser roles and Supabase Auth cannot read voice configuration/ledgers, queue reminders, or invoke the provider. Runtime uses database-owner invoker permissions, without a service-role key or application admin key.

The dedicated TeXML application's required default voice URL points to `/api/telnyx/voice/fallback`. Its GET/POST response is static `<Response><Hangup/></Response>`; it cannot place calls, read participant data, or update preferences. Outbound reminders supply their instructions inline and do not depend on this endpoint or application deployment. The fallback should ship with the normal app release for inbound calls to the sending number.

## Setup and operations

Use Node 24 with an operator's `SUPABASE_ACCESS_TOKEN`. Keep `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`, and `TELNYX_VOICE_CONNECTION_ID` in the ignored operator environment. The Next.js app does not need the provider credential. A separate staging configuration also requires `STUDY_VOICE_STAGING_SITE_URL`.

```sh
npm run study-voice -- provider-status production
npm run study-voice -- provision production
npm run study-voice -- migrate production
npm run study-voice -- check production
npm run study-voice -- configure production
npm run study-voice -- test-provider production
npm run study-voice -- test-scheduler production
npm run study-voice -- enable production
npm run study-voice -- status production
npm run study-voice -- disable production
```

`provision` reuses the owned active local sender; it never purchases a number. It creates or reuses the dedicated outbound voice profile and TeXML application, then assigns the number without overwriting another voice connection. Repeated execution reuses those resources. It preserves the number's messaging profile. Save the returned connection ID in `TELNYX_VOICE_CONNECTION_ID`.

`configure` validates number ownership/assignment, active TeXML application, and enabled outbound voice profile before saving the identity and credential in Vault. It starts disabled. `enable` repeats provider checks, validates the cron timezone and secret, then activates production noon scheduling. SMS registration is independent of voice setup. `disable` pauses phone reminders without changing email, SMS, phone verification, or preferences.

The current outbound voice profile permits **US and Canada** destinations. Other countries require explicit changes to Telnyx's destination permissions; the scheduler itself does not impose a country filter. Provider restrictions or rejection are recorded in the ledger.

## Verification and rollout

`supabase/tests/daily_study_voice.sql` replaces the private HTTP sender with a transactional mock and rolls back every fixture. It checks private permissions, invoker functions, noon/DST scheduling, channel independence and NULL consent, verified/malformed numbers, active/private/expired studies, in-progress/completed participation, daily uniqueness, next-day reminders, worker activation, inline XML escaping, response shape, bounded rate-limit retries, unknown outcomes, and last-minute opt-out/number/privacy/completion/expiry changes.

`test-scheduler` runs the actual top-level cron procedure with an empty queue and verifies it succeeds and deactivates itself. It refuses a nonempty pending queue. `test-provider` uses the database sender and Vault key with an **empty required destination**; Telnyx must reject it with HTTP 400/422. It cannot ring a participant or contact. Neither check claims to verify an answered call or spoken audio.

Verified on 2026-10-04 UTC: the migration and mocked database checks pass in staging and production; both real empty cron procedures pass. Telnyx accepted configuration of the owned sender **+1 754 294 8413**, TeXML application `3062936713656534508`, and outbound voice profile `3062936711425164779`. The production database/Vault/HTTP/API validation test returned HTTP 422 for the empty destination. Production phone reminders and the noon job are enabled; staging remains disabled. Production currently has no phone-call opt-ins, verified phone accounts, or voice delivery rows. No participant or contact received a setup call.

The application UI changes still need the normal production release. Settings phone verification remains dependent on the pending Telnyx SMS activation described in [daily-study-sms.md](daily-study-sms.md).

API references: [Telnyx's current TeXML call request/response definition](https://github.com/team-telnyx/telnyx-node/blob/master/src/resources/texml/calls.ts), [Say](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/say), and [Hangup](https://developers.telnyx.com/docs/voice/programmable-voice/texml-verbs/hangup/index).
