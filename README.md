Next.js (App Router) + Tailwind + Supabase auth starter.

## Setup

1) Copy `.env.local.example` to `.env.local` and add your Supabase project values:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
# or NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
# Optional but recommended for OAuth redirects:
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
Ensure Google OAuth is enabled in Supabase and the redirect URL `http://localhost:3000/auth/callback` is added.

2) Install and run:
```
npm install
npm run dev
```

The app redirects unauthenticated users to `/login`, offers “Sign in with Google”, and lands on a protected Hello World page after login. Sessions are maintained via Supabase SSR helpers and the Next.js proxy.

### OAuth redirect behavior
- The `/auth/login` handler sends Supabase a clean callback URL (`/auth/callback`) with no query params so it matches the allowlist exactly. The `next` path is stored in a temporary cookie and read in `/auth/callback` before redirecting to the final page. The callback route uses `NEXT_PUBLIC_SITE_URL` for the post-login redirect origin in deployed environments because Amplify SSR can report an internal localhost origin while handling `/auth/callback`.
- Ensure the Supabase Redirect URLs include the exact callback paths you use (e.g., `http://localhost:3000/auth/callback`, `https://localhost:3000/auth/callback`, plus production callbacks). If you add query params to the allowlist in Supabase, keep them consistent.

## Deploy on AWS

This app is ready for AWS Amplify Hosting through a console-managed GitHub App
connection. Amplify uses the committed root `amplify.yml` build spec.

One-time setup:

1. Install the Amplify GitHub App for `us-east-1` and grant it access to
   `The-Humor-Project/funnystudy`:
   `https://github.com/apps/aws-amplify-us-east-1/installations/new`
2. In the AWS Amplify console, choose **New app** -> **Host web app**.
3. Choose **GitHub** and select `The-Humor-Project/funnystudy`.
4. Create the staging app from the `staging` branch and the production app from
   the `main` branch.
5. Confirm Amplify uses the committed root `amplify.yml` build spec.
6. Add the custom domains for each branch in the Amplify console.

Required Amplify environment variables:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Amplify must rebuild after environment values change. The root `amplify.yml`
writes all `NEXT_PUBLIC_*` Amplify environment variables into `.env.production`
before `next build` so they are available to the Next.js SSR runtime. The build
fails early if the required site/auth variables are missing from the selected
Amplify app or branch. Keep `NEXT_PUBLIC_SITE_URL` set per branch; the OAuth
callback uses it for post-login redirects instead of trusting Amplify SSR
request origins.

Add the deployed `/auth/callback` URLs in Google OAuth and Supabase auth
settings. This app does not use a Supabase service-role key; all Supabase
requests should use the logged-in user's JWT.



## Funny Study Images

Funny Study Images in Staging:

Dog at Bar:
faf811a5-ee67-47e8-80bc-a1e45255f613

https://images.almostcrackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/faf811a5-ee67-47e8-80bc-a1e45255f613.jpeg


Funny Study Images in Production:

Deer:
25a87637-d43b-491a-8387-151dce7c3fc3

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/25a87637-d43b-491a-8387-151dce7c3fc3.jpeg


Bible 2:
57215cb3-912c-4ecb-80e4-4688b3355e1d

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/57215cb3-912c-4ecb-80e4-4688b3355e1d.png


Goat:
7181be02-566a-42d6-8bbd-05a646900f12

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/7181be02-566a-42d6-8bbd-05a646900f12.jpeg


Polite Cat:
8c33557b-47ee-450d-9dbd-1a67f7392b42

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/8c33557b-47ee-450d-9dbd-1a67f7392b42.jpeg


Ben:
b02d1d13-5d2b-431b-a769-fa0c952ff4ad

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/b02d1d13-5d2b-431b-a769-fa0c952ff4ad.png


Llama:
32d8919d-0d2e-4d98-a04c-950a129ba229

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/32d8919d-0d2e-4d98-a04c-950a129ba229.jpeg


Snow Penis:

c61f076b-754c-410c-b6c8-f526b4253ddb

https://images.crackd.ai/09842ed2-d35d-4dbc-b9e0-fc2cefa8fd93/c61f076b-754c-410c-b6c8-f526b4253ddb.jpeg


Jae:

6e248baf-1e36-4a30-9277-42a949fe325d

https://images.crackd.ai/2877cb7c-4ef9-4fcc-921c-8ca87d6ed47f/6e248baf-1e36-4a30-9277-42a949fe325d.jpeg
