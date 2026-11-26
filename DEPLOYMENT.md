# Launch guide

## Run the preview

Use Node 22.12+ or Node 24 and npm. Extract the source ZIP, enter the directory containing package.json and run:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. With both Supabase variables empty, an empty catalog and a browser-local profile are available. To build static files, run npm run build and npm run preview. Set VITE_SITE_ORIGIN to the full frontend origin when building a release to generate its sitemap and absolute sharing URLs.

## Accounts for launching Netfly

| Account or service | What to set up |
| --- | --- |
| Supabase | Create one project for the database, viewer accounts and staff authentication. [Supabase dashboard](https://supabase.com/dashboard) |
| Vercel | Create or select the Netfly Vite project for the website, previews and optional frontend domain. [Vercel dashboard](https://vercel.com/dashboard) |
| Cloudflare | Use one account for Workers (playback authorization) and R2 (private video storage). R2 activation requires a payment method and usage above its free allowance can incur charges. [Cloudflare dashboard](https://dash.cloudflare.com/) · [R2 setup](https://developers.cloudflare.com/r2/get-started/) |
| Transactional email provider | Use an SMTP provider such as Resend for verification and password-reset email. Verify your sender domain and enter the provider's SMTP credentials in Supabase Auth. [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp) |
| Domain and DNS | Use a domain you control for the sender address and the playback hostname in this configuration. An existing registrar account works. |
| GitHub (optional) | Use a repository for automatic tests and deployments. Manual deployment from the ZIP is supported. [GitHub](https://github.com/) |
| Google Cloud (optional) | Set up OAuth credentials only if you enable “Sign in with Google.” [Google provider setup](https://supabase.com/docs/guides/auth/social-login/auth-google) |

The private demo runs without these production accounts.

## Inventory for a connected launch

| Owner supplies | Destination |
| --- | --- |
| A Supabase project, its URL, publishable key, service-role key and database access | URL and publishable key in the Vite build environment, service-role key only in Worker secrets |
| Sender domain and transactional SMTP credentials | Supabase Auth email settings |
| Optional Google OAuth client and callback registration | Supabase Auth provider settings |
| Cloudflare account, approved R2 subscription, private bucket and least-privilege upload key | Worker R2 binding and local ingestion environment |
| Cloudflare account ID and scoped deployment token | GitHub production environment or local Wrangler login |
| Frontend domain, playback domain and a licensed media inventory | Vercel, Worker routes and administration |
| First verified operator account and authenticator | Supabase SQL bootstrap and Profile |
| GitHub repository and deployment environment | Push the supplied source to your chosen repository. Automated checks run there. |

Review FREE_TIER_LIMITS.md and current provider terms before provisioning. R2 activation requires a payment method and can bill overages. Obtain explicit approval before enabling it. All live-provider steps below are operator launch actions for the named account.

## 1. Configure Supabase

1. Create a project on the approved plan and record its region and backups policy. In a local shell with the current Supabase CLI, run supabase login, then supabase link --project-ref YOUR_PROJECT_REF. Review migration history with supabase migration list. Use supabase db push --dry-run to preview changes, then supabase db push. Never reset a live database.
2. Confirm that public is an exposed Data API schema and private and auth are excluded. Inspect table grants, RLS, advisor warnings and function privileges. The migration contains sample genres and site settings. supabase/seed.sql is optional and creates only draft demonstration metadata.
3. Set the Auth Site URL to the exact HTTPS frontend origin and allow /profile and /account/reset as redirect targets. Enable email confirmation and TOTP enrollment and verification. Configure SMTP, sender authentication, email limits and template links. Test recovery from a fresh browser session. Enable Google OAuth only if its client and redirect are configured. The Vite flag VITE_GOOGLE_SIGN_IN controls the sign-in button.
4. Register and verify the operator. In the trusted SQL editor assign the initial role by the exact verified user UUID:

```sql
update public.roles
set role = 'super_administrator'
where user_id = 'REPLACE_WITH_VERIFIED_OPERATOR_UUID'::uuid
returning user_id, role;
```

Verify one returned row. Sign in, enroll TOTP under Profile and verify the code. Open /admin. Recheck the role and second factor when adding additional staff.

## 2. Configure the gateway

1. After cost approval, create the private R2 bucket and disable public URL access. Configure its existing name in worker/wrangler.toml. Keep media in R2 and static artwork on Vercel or an approved public image host.
2. Configure a dedicated Worker custom domain or route. In worker/wrangler.toml add a Cloudflare route appropriate for your zone, or add a custom domain in the dashboard after creating the Worker. The supplied config disables workers.dev and preview URLs. Set APP_ORIGIN to the exact frontend origin with no trailing slash and SUPABASE_URL to the project URL. Keep the two rate-limit bindings and the hourly maintenance trigger enabled.
3. For an existing approved Worker set the service-role secret with npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config worker/wrangler.toml. Use the provider prompt to enter it. Deploy with npx wrangler deploy --config worker/wrangler.toml --keep-vars --var "APP_ORIGIN:$VITE_SITE_ORIGIN" --var "SUPABASE_URL:$VITE_SUPABASE_URL". Check the route's TLS certificate, trigger schedule and exact origin. Disable URL logging, caching rules and media analytics that capture request paths.
4. Keep bucket-scoped S3 keys in the local encoding process. The Worker uses its binding and needs no R2 S3 credentials. Follow VIDEO_PROCESSING.md for planning, encoding, dry-run validation, upload and registration.

## 3. Deploy the frontend on Vercel

1. Start from the directory containing package.json and vercel.json. Import the repository into your Vercel team, or run `npx vercel login` followed by `npx vercel link` and select the intended Netfly project. Use the Vite preset, Node.js 24, install command `npm ci`, build command `npm run build` and output directory `dist`. A Git connection is optional.
2. For the bundled demo, leave the Supabase and playback variables empty. A preview uses the deployment URL for generated metadata when Vercel exposes system environment variables. Confirm Vercel Authentication is enabled for previews before sharing a restricted screening.
3. For production, set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_PLAYBACK_ORIGIN and VITE_SITE_ORIGIN in Vercel Project Settings → Environment Variables for the Production environment. Use your stable HTTPS Vercel production hostname or a verified custom domain for VITE_SITE_ORIGIN. Keep the service-role key in Worker secrets and R2 upload credentials on the encoding workstation. Rebuild after changing Vite variables or published catalog metadata.
4. Set the same stable frontend origin as the Supabase Auth Site URL and Worker APP_ORIGIN. Allow the exact /profile and /account/reset redirects. Use a separate staging gateway, Supabase project and stable staging origin if testing connected previews. Keep rotating preview domains out of the production CORS and Auth allowlists.
5. Run lint, gateway and database tests, the production build and browser suite locally. With Git connected, branches get previews and the designated production branch gets releases. For a manual preview run `npx vercel deploy` from the linked project, then use `npx vercel deploy --prod` when ready for the intended production audience and plan. Review access controls before launch.
6. Smoke-test a deep film link, a direct /watch route, the manifest, an HLS segment, security headers and auth redirects. Run `node scripts/smoke.mjs https://YOUR_FRONTEND https://YOUR_PLAYBACK` against the approved production endpoints. The GitHub deploy workflow updates the Cloudflare Worker independently.

## Local integration services

With Docker and the Supabase CLI installed, supabase start launches local Auth, PostgREST, Postgres and the test mailbox. Use supabase status to obtain the local URL and keys privately. Copy the public values to .env.local and use the local service key only in worker/.dev.vars, together with APP_ORIGIN and SUPABASE_URL. Use npx wrangler dev --local --config worker/wrangler.toml for local R2 emulation. Load encoded fixture objects under the registered prefix with wrangler r2 object put BUCKET/UUID/PATH --file FILE --local --config worker/wrangler.toml. Keep production credentials out of this environment.

The separate npm run test:connected harness creates temporary loopback Docker services, a test mailbox and an isolated PostgreSQL database for end-to-end checks. It generates disposable credentials and removes its own containers.

