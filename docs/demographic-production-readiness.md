# Demographic survey production readiness

Verified on 2026-09-20 against staging `c2494db` and the production Supabase project `kglxxmrvmrxiyigarjfh`.

## Database: ready

Production was missing all four demographic tables. These migrations were applied through the Supabase Management API and recorded in production migration history:

- `20260920214511_add_demographic_survey.sql`
- `20260920214519_seed_demographic_survey.sql`
- `20260920214803_support_study_visibility_compatibility.sql`

| Table | Purpose | Seeded rows |
| --- | --- | ---: |
| `demographic_questions` | Question prompts | 5 |
| `demographic_answers` | Answer labels | 131 |
| `demographic_answer_question_mapping` | Question/answer relationships, display order, soft deletion | 132 |
| `demographic_user_responses` | User ID and selected mapping ID | 0 |

The reference data matches staging's graduation year, campus residence, transfer status, school, and major questions, including all 115 major choices. Original reference-data author IDs are preserved; the source author exists in production. No staging participant responses were copied.

All four production tables have RLS enabled. Authenticated participants can read the survey definitions and insert/read their own responses. They cannot edit definitions or read/write other participants' responses. Superadmins can administer the tables. Anonymous access is revoked. Runtime requests continue to use the signed-in user's JWT and the existing public Supabase key; no service-role key or new environment variables are required.

The schema matches the staging application's expected columns, defaults, sequences, and foreign keys. Response lookups and mapping references are indexed.

## Application release

The Amplify production app is `d3pmn72nehhv8d`, using `main`. Before this rollout it was deployed at `2e0feb5`. Its configured site is `https://www.humorstudy.org` and its Supabase endpoint is `https://secure.crackd.ai`; its public key identifies the production project above.

The approved release promotes all of staging, including the survey implementation:

- An OAuth callback check for unanswered questions and a protected `/demographics` route.
- Ordered questions/options and filtering of deleted mappings and already answered questions.
- Immediate advancement after selection, a brief undo window, and background saves.
- Flushing pending answers before the final redirect or skip.
- Per-login skipping, a remaining-question count, and search/internal scrolling for long answer lists.

The study-visibility compatibility migration adds `studies.is_private` to production, copies the existing `is_hidden` values, and synchronizes future writes to either field. This preserves compatibility with other production clients and the previous app build. All 59 studies retain their visibility, including the 16 private studies. `supabase/tests/study_visibility.sql` verifies both write directions and rolls back its test updates.

The release also includes staging's numeric `/study/{studyId}` routes, direct access to private active studies, expired-study handling, and the no-studies empty state.

## Verification

- Both migrations ran successfully on an isolated PostgreSQL 17 instance before production.
- `supabase/tests/demographic_survey.sql` passed locally and in production using the `authenticated` role with a non-superadmin participant context. It checks complete survey reads, own-response insert/read, cross-user isolation, anonymous denial, and protection of question definitions.
- All test responses were rolled back; production response count remained zero immediately after verification.
- The production REST API recognizes all four tables and rejects anonymous access.
- The staging application builds successfully and the demographic source files pass ESLint.

The SQL check is an administrative verification script, not an application endpoint. It selects existing account IDs internally and rolls back every response fixture. Its expected question/answer counts reflect this seed snapshot.

An interactive OAuth/survey check requires a signed-in browser session; the database permission tests do not substitute for that check.
