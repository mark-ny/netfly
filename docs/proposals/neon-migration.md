# Proposal: moving Netfly from Supabase to Neon (approval required, nothing applied)

Status: planning document only. No code, schema, environment variable or provider setting was changed. Neon details were checked against Neon's public documentation on 2026-11-26; items marked **VERIFY** could not be confirmed from the documentation I could read and must be checked in the Neon console or with Neon support before committing.

## 1. What the app uses Supabase for today

| Use | Where | What Neon must replace it with |
|---|---|---|
| Email/password sign-up, verification, recovery, logout, global sign-out | `src/Accounts.tsx` via `supabase-js` | Neon Auth (managed Better Auth) or another JWT provider |
| TOTP MFA for staff, enforced in RLS through the `aal2` claim | `private.level()` in the migration | An auth provider that issues an equivalent assurance claim. **VERIFY** whether Neon Auth supports TOTP and can emit it |
| Optional Google sign-in | `signInWithOAuth` | Provider setting in the new auth service |
| Browser reads/writes with Row Level Security (catalog view, watchlist, progress, ratings, admin CRUD) | `src/api.ts`, `src/state.tsx`, `src/Admin.tsx` using `.from(...)` | Neon Data API plus a PostgREST-style client |
| Roles `anon`, `authenticated`, `service_role` used in every `grant` and policy | migration | Confirm the roles the Data API uses. **VERIFY** |
| `auth.uid()`, `auth.jwt()` in policies | migration | Provided by Neon's `pg_session_jwt` extension (see section 2) |
| Foreign keys to `auth.users`, session checks against `auth.sessions` | migration, `start_playback`, `heartbeat`, `resolve_media` | Re-point to the new auth user table; replace the session check with a Worker-side token check. **VERIFY** the new table's id type and whether a sessions table exists |
| Worker calls Supabase REST/RPC with a service key, verifies tokens at `/auth/v1/user`, deletes users at `/auth/v1/admin/users` | `worker/index.js` | Direct Postgres access from the Worker, JWKS token verification, auth-service admin API |

## 2. What Neon provides (checked 2026-11-26)

- **Data API:** exposes your Postgres database as a REST endpoint secured by JWT authentication and Row-Level Security, and is enabled at the branch level for a single database. All tables accessed via the Data API must have RLS enabled. The Data API has no permission layer of its own, so every grant and policy must be right before exposure. It is not supported on projects that use IP Allow or Private Networking.
- **Auth:** the Data API works with any JWT-issuing identity system if you supply a JWKS URL; Neon Auth is a managed Better Auth service that stores users in a `neon_auth` schema in your database.
- **RLS helpers:** the `pg_session_jwt` extension is configured automatically with the Data API and gives `auth.session()`, `auth.jwt()`, `auth.user_id()` and `auth.uid()` (uuid, null if `sub` is not a uuid). Source: Neon docs.
- **Workers:** Cloudflare recommends Hyperdrive for Postgres from Workers; Neon's serverless driver (HTTP/WebSocket) is the alternative.

## 3. Fit and gaps

Good fit: the schema is plain Postgres with RLS, and `auth.uid()` and `auth.jwt()` exist on Neon. Media stays in R2, so no storage change.

Real work and risks:
1. **Accounts do not move automatically.** Existing Supabase users have their own ids and password hashes. Neon Auth's import options are **VERIFY**. Plan on a one-time "reset your password" email unless Neon confirms bulk import. All user-owned rows (list, progress, ratings, roles) must be re-keyed to new user ids with a mapping table.
2. **Staff MFA.** Today only an `aal2` token can use admin policies. If the new provider cannot emit that claim, staff MFA cannot be enforced in the database and the admin policies must be redesigned. Do not go live with weaker admin protection.
3. **Worker rewrite.** `worker/index.js` is built around Supabase REST and auth endpoints; `tests/gateway.test.mjs` and `tests/connected.mjs` (Supabase Docker stack) must be rewritten. The Worker needs JWKS verification and a Postgres connection through Hyperdrive or the serverless driver.
4. **Request load vs. the free plan.** The gateway does one database lookup per media segment (`SCALING_PLAN.md`: about 12,000 per hour for 20 viewers, 300,000 per hour for 500). Neon's Free plan gives 100 CU-hours of compute per project per month and 1 GB of storage per project, and hitting any Free monthly limit suspends compute until the next billing month. Continuous playback traffic keeps compute awake, so a free project could exhaust compute mid-month and stop all playback. Plan for the paid Launch plan ($0.106 per CU-hour for compute, $0.35 per GB-month for storage) or reduce per-segment queries with a short authorization cache (takedown delay equals the cache time).
5. **Cold starts.** Neon Free compute scales to zero after 5 minutes of inactivity; the first request after idle is slower. Fine for browsing, undesirable for first-play latency.
6. **Vercel integration variables.** The Vercel-Neon integration injects database connection strings such as `DATABASE_URL` into Vercel. This app is a static single-page app, so those must **never** be exposed as `VITE_` variables. The Worker runs on Cloudflare, so its database credential belongs in Worker secrets, not in Vercel.
7. **Email.** Supabase Auth currently sends verification and recovery mail through your configured SMTP. The Neon Auth email sender and templates must be configured. **VERIFY**.

## 4. Options

| Option | Effort | Risk | Notes |
|---|---|---|---|
| A. Stay on Supabase | none | lowest | Keeps tested auth, MFA and RLS; this was your stated baseline |
| B. Neon database + Neon Auth + Data API + Worker via Hyperdrive | large (auth, client, Worker, tests, data migration) | highest | The plan below |
| C. Neon database with Supabase Auth tokens via JWKS | medium | medium | Neon's Data API accepts any JWKS issuer, so the existing sign-in could stay. **VERIFY** that Supabase's token claims and key rotation work with it; the Worker still needs the rewrite |

My recommendation remains A for launch, with B or C reconsidered after the catalog and traffic are real. If you choose B or C, proceed with the phases below.

## 5. Phased plan (staging first)

1. **Discovery (no changes):** confirm which Supabase project holds live users and films; export row counts; decide account strategy (reset vs import); confirm Neon Auth feature list (TOTP, email verification, recovery, OAuth, admin delete, claims) and Data API roles with Neon.
2. **Neon staging project:** create a new Neon project (or branch), separate from anything live. Apply a translated schema: replace `auth.users` FKs, keep tables, indexes and RLS; replace `private.level()` with the new claim; keep grants minimal. Run the existing PGlite policy suite (`tests/db.mjs`) against the translated schema, extended for the new roles.
3. **Client:** swap `supabase-js` for the Neon auth and data client behind the existing `src/api.ts` and `state.tsx` seams so pages change little. Update auth pages and redirect/callback settings.
4. **Worker:** replace REST/RPC calls with direct SQL through Hyperdrive (or the serverless driver), verify JWTs with the provider's JWKS, keep the same routes (`/authorize`, `/heartbeat`, `/media/...`, `/contact`, `/account/export`, `/account/delete`), headers, rate limits and R2 key layout. Existing movies, manifests and objects stay unchanged.
5. **Data migration (dry run):** copy catalog, licenses, assets and subtitles as-is (ids and `video_assets.prefix` preserved); map users and re-key viewer rows; verify counts and a sample film plays end to end with the existing ingestion output.
6. **Test gates before any cutover:** unauthorized and expired manifest/segment denial, cross-account isolation, staff MFA enforcement, unpublished and expired-license titles, account export and deletion, auth email flows, load check against the planned plan limits.
7. **Cutover and rollback:** switch the Vercel build variables and Worker secrets in one change window; keep the Supabase project untouched and read-only for at least 30 days so rollback is repointing the variables and redeploying the previous Worker version.

## 6. What I need from you to continue

- Is there any live Supabase data (real users, films)? Or is everything still empty/test?
- Is the Neon project empty, and did you enable Neon Auth or the Data API on it?
- Are existing viewers' passwords expected to carry over, or is a forced reset acceptable?
- Is a paid Neon plan acceptable for the playback gateway?

## Sources

- Neon Data API: https://neon.com/docs/data-api/get-started, access control: https://neon.com/docs/data-api/access-control
- Custom auth providers (JWKS): https://neon.com/docs/data-api/custom-authentication-providers
- RLS on Neon: https://neon.com/docs/guides/neon-rls, `pg_session_jwt`: https://neon.com/docs/extensions/pg_session_jwt
- Neon Auth flow: https://neon.com/docs/auth/authentication-flow
- Free plan limits: https://neon.com/faqs/free-plan-limits-and-quotas, pricing: https://neon.com/pricing
- Workers with Neon: https://neon.com/docs/guides/cloudflare-workers.md
