# Daily study text reminders

Production reminders use Telnyx and link to `https://www.humorstudy.org`. Each participant with `profiles.notify_new_study_sms = TRUE` and a verified account phone number receives at most one reminder per Eastern day when a public study is active and unfinished. Email and phone-call preferences are independent; all three default to NULL (unanswered). NULL and FALSE never qualify for delivery. Login prompts unanswered channels with Yes, No, and Skip; Skip preserves NULL.

Settings includes a separate phone-number form with an initially unchecked, required verification-text consent box. Both native form validation and the server action reject code requests without an explicit consent value. The signed-in user's JWT calls Supabase `updateUser({ phone })` to request a code and `verifyOtp({ type: "phone_change" })` to confirm it. Verification uses the pending number read from that user's authenticated account, never a submitted identity or destination. A number change retains the previous verified number until the new code is confirmed. Requesting or confirming a code does not change notification preferences. Users can stop reminders by choosing No for Text message or replying STOP; Telnyx enforces its messaging-profile opt-out list.

Public `/privacy` and `/sms-terms` pages describe the operator, actual data use, optional verification/reminder consent, message frequency, rates, STOP/START/HELP, and the support contact. Policy links appear beside phone entry, the Settings text choice, the post-login SMS question, and on login. The proxy allows only the exact public policy paths without an Auth request; similar or nested paths remain protected. Each policy page scrolls internally within the locked viewport.

## Database and delivery

`20261004005400_prepare_daily_study_sms_reminders.sql` adds private SMS configuration, a delivery ledger, scheduling, Telnyx transport, and a Supabase Send SMS hook. Both reminders and verification start disabled. `20261004010000_hash_verification_codes_without_extension_access.sql` uses PostgreSQL's built-in SHA-256 so the Auth hook needs no extension-schema permissions.

- `funnystudy-sms-noon` checks `0 16,17 * * *` UTC/GMT and queues only at noon `America/New_York`, including daylight saving changes. The job stays inactive until activation.
- A unique `(profile_id, reminder_date)` key produces one reminder even when multiple studies qualify or cron repeats. Active study bounds are inclusive and nullable; in-progress participation remains eligible, completion excludes only that study.
- Recipients come from `auth.users.phone` with `phone_confirmed_at`, normalized to E.164. Profile metadata and pending/unverified numbers are never reminder destinations.
- The private Auth hook only queues verification SMS. Supabase owns code generation, verification, and rate limiting. `supabase_auth_admin` can insert verification rows and read the few configuration columns it needs, but cannot read existing messages, access Vault, or call the Telnyx transport. A fixed trigger starts only this application's worker.
- `funnystudy-sms-delivery` runs a top-level PostgreSQL procedure once per second while work exists. It claims one row and **commits that claim before HTTP**. It then rechecks consent, verified number, privacy, date windows, completion, and expiry before submitting to `https://api.telnyx.com/v2/messages`.
- Only a successful response with a provider message ID is recorded as `sent` (provider acceptance, not confirmed handset delivery). A 429 response retries after one minute, at most five attempts. Validation and authorization errors fail the row.
- Telnyx's SMS endpoint does not document send idempotency. Timeouts, malformed success, server failures, and interrupted workers are marked `unknown` and are not automatically resent, preventing duplicate texts at the cost of a potentially missed reminder. The next Eastern day can queue a new reminder.
- Reminder eligibility expires after six hours or at the next Eastern date. Verification messages expire after five minutes and must still match the current Auth token hash; replaced codes are cancelled. Codes are removed from terminal rows and cleaned daily; verification history is deleted after one day.
- The worker stops on an empty queue. Daily cleanup prunes only this application's cron history older than seven days. Browser roles cannot access the schema, delivery ledger, hook, or transport. Runtime uses database ownership and Vault, with no service-role key or public cron endpoint.

## Setup and operations

Use Node 24. Administrative commands need an operator's `SUPABASE_ACCESS_TOKEN`. Store `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`, and `TELNYX_MESSAGING_PROFILE_ID` in the ignored operator environment. The application does not need the provider key at runtime; the database sender reads the encrypted Vault secret `funnystudy_telnyx_api_key`.

```sh
npm run study-sms -- provider-status production
npm run study-sms -- registration-status production
npm run study-sms -- provision production
npm run study-sms -- register-brand production
npm run study-sms -- messaging-responses production
npm run study-sms -- campaign-status production
npm run study-sms -- register-campaign production
npm run study-sms -- migrate production
npm run study-sms -- check production
npm run study-sms -- configure production
npm run study-sms -- test-scheduler production
npm run study-sms -- enable production
npm run study-sms -- status production
npm run study-sms -- disable production
```

`provision` creates or reuses the dedicated Humor Study messaging profile and purchases at most one local US number. It reuses an existing matching number or order on subsequent runs. `register-brand` uses `TELNYX_BRAND_LEGAL_NAME`, `EIN`, `STREET`, `CITY`, `STATE`, `POSTAL_CODE`, `WEBSITE`, `CONTACT_NAME`, `EMAIL`, and `PHONE` (each prefixed `TELNYX_BRAND_`) from the ignored environment. Save the registered ID as `TELNYX_BRAND_ID`. Repeated setup retrieves that brand and checks its EIN; without an ID it retrieves matching brand candidates because list responses may omit the EIN. Registration details never belong in committed files.

`provider-status` also reports the account's balance and available credit using Telnyx's read-only balance API. Failed provider queries return a nonzero exit code. Brand and campaign registration incur provider fees and require sufficient available credit; this CLI does not add funds or change billing settings.

`registration-status` retrieves the configured organization's brand and reports its registry status without exposing registration details. For a verified brand it uses Telnyx's read-only qualification endpoint to report current mixed/low-volume campaign fees and sub-usecase requirements. The documented standalone campaign-cost endpoint returned HTTP 404 during setup; qualification succeeded.

`messaging-responses` configures US START/UNSTOP, STOP-family, and HELP/INFO responses on this application's dedicated profile. HELP names the registered support email. START allows text delivery again while still requiring Yes in Settings for daily reminders. This operation does not send a message. `campaign-status` reads this brand's campaign records without exposing registration details.

`register-campaign` submits the user-selected low-volume campaign only after verifying the brand, publicly published policy/login pages, owned sender, matching keyword responses, unchanged $4.50 quarterly qualification, and at least $19.50 available credit including review. Its fixed unique reference `funnystudy-production-study-sms-v1` prevents duplicate paid registrations, including after an uncertain POST response. It retrieves all existing campaign pages, reuses this reference, and refuses to create another campaign when the brand already has one. Submission does not enable reminders, verification, or carrier assignment. The published release must also contain the actual Settings and login consent flows described below.

US local-number messaging requires a registered brand, approved 10DLC campaign, and completed number-to-campaign assignment. The campaign must cover study reminders and verification codes, show the website's opt-in flow, include sample messages and STOP/HELP behavior, and link to the organization's applicable privacy/terms information. Complete campaign review in Telnyx before activation. `configure` validates number ownership and messaging-profile assignment, saves the provider key in Vault, and keeps sending disabled. `enable` also validates carrier assignment, checks the cron timezone and secret, enables the Auth hook with automatic phone confirmation off, and activates noon scheduling. It refuses to overwrite another configured Send SMS hook.

### Prepared campaign details

The brand is **Humor Study**, registered to the user-supplied legal organization. The campaign covers `POLLING_VOTING` (study invitations) and `2FA` (phone verification). The user selected `LOW_VOLUME` and confirmed fewer than 6,000 texts per month, including reminders and codes. The live qualification quote is $1.50/month ($4.50 for the first three months), plus Telnyx's documented $15 manual campaign-review fee. These exclude sending, number, and any additional carrier/assignment fees. The submitted campaign renews for ongoing reminders.

Draft description: “Humor Study sends registered participants daily reminders at noon Eastern when an active public humor study remains unfinished, only after they opt into Text message notifications. It also sends one-time codes requested by participants to verify a phone number. Verification alone does not subscribe a participant to study reminders.”

Sample reminder, matching the database template: `Humor Study: A public study is waiting for you to finish. https://www.humorstudy.org/ Manage reminders: https://www.humorstudy.org/settings. Reply STOP to opt out.`

Sample verification, matching the Auth hook: `Humor Study: Your verification code is 123456. Do not share this code.`

Message-flow description: “Participants sign in at https://www.humorstudy.org/login and explicitly choose Yes for Text message in Settings or the post-login notification prompt; No and Skip do not subscribe them. Frequency, rates, optional consent, STOP/HELP, and policy links appear beside these choices. They separately enter a country-coded phone number in Settings and check an initially unchecked verification-text consent box before requesting a code, then enter that code to verify ownership. The phone form shows rates, STOP/HELP, policy links, and explains that verification does not subscribe them. Only opted-in accounts with verified numbers receive daily study reminders. Participants may choose No in Settings or reply STOP to the sending number. START removes the provider delivery block but reminders still require Yes in Settings.”

Before submitting, publish the implemented consent release and verify `https://www.humorstudy.org/privacy` and `https://www.humorstudy.org/sms-terms` return their public policy content. Do not claim an unpublished flow is live. The profile's US START, STOP, and HELP responses were configured and retrieved successfully. Assign the owned sender only after the campaign is approved, then run activation checks.

References: [Telnyx campaign submission fields](https://developers.telnyx.com/api-reference/campaign/submit-campaign), [use-case qualification](https://developers.telnyx.com/api-reference/campaign/qualify-by-usecase), [campaign registration guide](https://developers.telnyx.com/docs/messaging/10dlc/campaign-registration/index), [registration fees](https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges), and [policy-link requirements](https://support.telnyx.com/en/articles/8159875-10dlc-privacy-policy-terms-and-conditions-best-practices).

`disable` pauses study reminders while preserving phone verification. To rotate the key, disable reminders, update the ignored environment, configure again, then enable after provider readiness checks. Staging has a separate disabled configuration; configuring it requires `STUDY_SMS_STAGING_SITE_URL`.

## Verification and rollout

`npm run test:settings` covers phone-number normalization, authenticated requests, verification against the account's pending number, invalid codes and numbers, reloads, provider failures, and independent preferences. The controlled `npm run preview:settings` flow accepts `123456` as its mock verification code and never contacts a provider.

`supabase/tests/daily_study_sms.sql` replaces the private HTTP helper with a transactional mock and rolls back all Auth/profile/study/ledger/cron fixtures. It covers channel independence, verified/invalid numbers, active windows and privacy, participation, DST/noon, daily uniqueness, next-day reminders, opt-out and number changes, completion/expiry rechecks, provider acceptance/rejection, rate limits, uncertain outcomes, hook grants, pending-number targeting, replaced codes, and code removal. The empty-queue scheduler check exercises the real procedure's transaction control without sending any message. It requires an empty queue.

Verified on 2026-10-04 UTC: both SMS migrations are applied to staging and production, and rollback-only database regressions pass in both. The application build and 30 Settings checks pass, including public-route authorization, consent validation, policy links, and notification independence. All 29 demographic/study and six image regressions also pass; lint has no errors and one existing caption-image warning. Browser checks covered public desktop/mobile policy pages, native rejection of missing verification consent, and successful mock verification without preference writes. Telnyx local number **+1 754 294 8413** is provisioned on the dedicated Humor Study profile. The production key is encrypted in Vault. Reminders, verification, and the noon job remain disabled pending campaign approval and number assignment.

**Brand verified; low-volume campaign submitted:** After account verification, registration initially returned HTTP 402 / code 20100, `Insufficient Funds`, with USD 3.01 available. The user then added $25. On 2026-10-04 UTC Telnyx successfully registered brand `4b2001a1-0480-f670-cdc7-42d716a88fe4`, registry ID `B9XNVZI`, and confirmed `status = OK`, `identityStatus = VERIFIED`, with no failure reasons. The one-time charge was $4.50, leaving USD 23.51 available. A repeat `register-brand` check reused the verified brand without another charge. The user selected low volume and requested new public policies; US keyword responses are configured.

Notification/policy commit `07a96ba` was pushed to staging and released on production main as `adc8e57`. An isolated checkout containing only this release built successfully; separate local auth-cookie edits were excluded. Amplify production app `d3pmn72nehhv8d`, main job **12**, completed BUILD/DEPLOY/VERIFY successfully. Its configured site and Supabase endpoint were verified as `https://www.humorstudy.org` and `https://secure.crackd.ai`. Both public policy URLs returned HTTP 200 and were checked in an anonymous production browser, including mobile terms and login policy links. Settings still redirects anonymous visitors to login.

After publication, submitted Telnyx campaign **`4b3001a1-049b-91b6-93e5-fa74c2cbbf61`**, use case `LOW_VOLUME`, sub-usecases `POLLING_VOTING` and `2FA`, reference `funnystudy-production-study-sms-v1`. Read-back status is `submissionStatus = PENDING`, `campaignStatus = TCR_PENDING`, with no failure reasons and no assigned number; a registry campaign ID is not issued yet. Repeating registration reused this campaign instead of creating another paid submission. The balance read immediately afterward remained USD 23.51; registration/review billing is asynchronous, so this is not a statement that campaign fees are waived.

Production SMS reminders, phone verification, and the noon job remain disabled while registration and carrier review are pending. Production email and phone-call scheduling remain enabled; all three preferences are nullable and default to NULL. No participant or contact received a text during setup or verification. Once Telnyx confirms campaign provisioning, assign the owned number to this campaign, verify `assignmentStatus = ASSIGNED`, then run `enable production` and the status/scheduler checks. [Telnyx's status guide](https://developers.telnyx.com/docs/messaging/10dlc/event-notifications/index) identifies `MNO_PROVISIONED` as successful carrier provisioning; `TCR_PENDING` does not grant sending readiness.

**Latest read-back, October 4, 2026 UTC:** campaign `4b3001a1-049b-91b6-93e5-fa74c2cbbf61` now has `status = ACTIVE`, `submissionStatus = CREATED`, `campaignStatus = TCR_ACCEPTED`, and registry ID `CSW596S`, with no failure reasons. The owned number still has no number-to-campaign assignment. Registration acceptance alone does not establish carrier provisioning or sending readiness. The API now returns a provider-generated `referenceId` rather than the original client reference; a repeat submission still refuses to create another campaign when any campaign already exists for the brand. Sending and verification remain disabled. Review the related SMS/voice revocation behavior identified in [the site policy audit](site-policy-review.md) before activation.
