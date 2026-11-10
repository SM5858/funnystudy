# Daily study email reminders

The database runs reminders at **12:00 p.m. America/New_York every day**, including weekends and daylight saving time. Each opted-in participant gets at most one email per Eastern calendar day when at least one public study is active and unfinished. Multiple studies produce one reminder linking to the study list.

Eligibility requires `profiles.notify_new_study_email = TRUE`, the confirmed email in `auth.users`, the same inclusive nullable study date windows as the home page, and the participant's `study_participations.started_at` / `ended_at`. Starting a study does not stop reminders; ending all available public studies does. SMS and phone preferences do not enable email. Missing or unconfirmed account emails are skipped. All channels default to NULL (unanswered); neither NULL nor FALSE grants delivery consent. Login prompts unanswered channels with Yes, No, and Skip; Skip keeps NULL until a later answer.

The sender is `Humor Study <notifications@thehumorproject.org>`. Emails link to the configured site's study list and `/settings`, where participants can turn off email reminders.

## Scheduling and delivery

`20261004000300_schedule_daily_study_email_reminders.sql` installs `pg_net` alongside Supabase's `pg_cron` and Vault. The migration creates a private `funnystudy_notifications` schema and starts with email configuration disabled. Browser roles cannot read the ledger, alter configuration, or invoke its functions. Background functions run as the cron job's database owner using invoker permissions; there is no service-role key or public HTTP cron endpoint. Participant settings continue to save with the user's JWT.

`20261004000708_send_study_emails_without_public_http_queue.sql` replaces delivery with the synchronous `http` extension. Managed `pg_net` queues are readable by browser database roles; the final sender never stores its Resend credential there. `20261004001300_support_installed_http_header_types.sql` builds composite headers compatible with Supabase's installed HTTP extension. Each request has a five-second connection limit and ten-second total timeout. Neither transport-table permissions nor other applications' HTTP functions are changed.

- `funnystudy-email-noon` runs at `0 16,17 * * *` in UTC/GMT. Its `America/New_York` guard accepts only local noon, so precisely one of those runs queues reminders throughout the year.
- `email_deliveries` has a unique `(profile_id, reminder_date)` key. Each row retains its exact email payload and Resend idempotency key for retries.
- `funnystudy-email-delivery` runs once per second while a queue exists and submits at most eight requests per tick. It switches itself off once all rows reach a terminal state.
- Consent, current account email, study privacy, date windows, and completion are checked again before each attempt. A reminder that becomes ineligible is cancelled. A change to the account email cancels delivery to its old address.
- The direct HTTP sender marks an email `sent` only after Resend returns a successful status and provider ID. This records provider acceptance; inbox delivery is outside this job's scope.
- Rate limits, server errors, and missing responses retry with exponential backoff, capped at five minutes. Permanent rejection fails the row. Delivery ends after at most 20 attempts or six hours, before Resend's 24-hour idempotency retention expires. Old reminders do not carry into a new day.
- `funnystudy-email-history-cleanup` removes only these jobs' run history older than seven days. It does not change other applications' cron jobs.

## Administrative commands

Use Node 24. Administrative setup requires `SUPABASE_ACCESS_TOKEN`, a Supabase Management API token, in the operator's environment. It is used only by the setup CLI, never by the application or scheduled sender. `RESEND_API_KEY` belongs in ignored `.env.local` for setup; the scheduler reads its encrypted value from Vault under `funnystudy_resend_api_key`. Never add either secret to migrations, public environment variables, or committed files.

The CLI accepts only `production` (`kglxxmrvmrxiyigarjfh`) and `staging` (`qihsgnfjqmkjmoowyfbn`):

```sh
npm run study-email -- status production
npm run study-email -- migrate production
npm run study-email -- check production
npm run study-email -- configure production
npm run study-email -- test-provider production
npm run study-email -- test-scheduler production
npm run study-email -- enable production
```

`migrate` applies the preference migration if needed, then the scheduler and both direct-transport migrations, recording their repository version numbers. Each migration runs in a transaction. `check` runs both the preference-permission checks and `supabase/tests/daily_study_emails.sql`, each in a rollback-only transaction. The reminder checks temporarily replace the private HTTP helper with a mock; rollback restores the real function, and no network request is made. It never emails a participant. `configure` verifies the sender's Resend domain, stores the secret in Vault, and keeps delivery disabled. `test-provider` uses the database HTTP sender and its Vault key to send only to Resend's `delivered@resend.dev` test sink, then checks the provider response. `test-scheduler` requires disabled sending and an empty pending queue; it activates the worker and verifies a successful cron execution and automatic deactivation without a send. `enable` validates the installed transport, secret, and UTC/GMT cron timezone. It resumes an existing daily queue after a pause; fresh reminders wait for the next scheduled noon.

`RESEND_FROM` can override the sender during configuration, but must use a verified sending domain. Production links always use `https://www.humorstudy.org`; staging configuration requires an explicit `STUDY_EMAIL_STAGING_SITE_URL`. Staging should remain disabled for ordinary testing.

To pause reminders or rotate credentials:

```sh
npm run study-email -- disable production
# Update RESEND_API_KEY in the operator's ignored environment.
npm run study-email -- configure production
npm run study-email -- test-provider production
npm run study-email -- enable production
```

`status` prints configuration, opt-in/eligibility counts, delivery status counts, and cron schedules without secrets or participant email addresses. Administrative inspection of individual failures uses the private ledger's `last_status` and `last_error` fields.

## Regression verification

The rollback-only SQL checks cover private/upcoming/expired studies, inclusive and null bounds, individual completion and in-progress states, independent preferences, the Eastern calendar date, winter/summer/DST scheduling, daily uniqueness, next-day reminders, opt-out/privacy/expiry/completion rechecks, stable retry payloads/keys, rate limiting, provider success and rejection, malformed responses, network timeouts, retry bounds, stale cancellation, and browser-role isolation. The private HTTP helper is replaced with a transaction-scoped mock, so the checks never contact Resend. Rollback restores the original helper and all fixtures. The separate `test-provider` command verifies the real HTTP path only against Resend's test recipient.

## Current rollout

Verified on 2026-10-04 UTC: the preference migration and all three reminder migrations are applied in staging and production. Production reminders are enabled; staging delivery remains disabled and has no Resend secret configured. Both databases passed preference-permission and reminder regressions. Production passed a real direct-HTTP test against Resend's test recipient and an actual cron empty-queue execution. No participant was contacted during verification.

Production currently has zero email opt-ins and no delivery rows. Its next scheduled check is 2026-10-04 at noon Eastern. The database scheduler is independent of Amplify deployment. The Settings UI changes still need their normal production application release before participants can opt in or out through the website.
