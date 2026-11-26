# Netfly on Neon: build kit (draft, nothing applied)

You chose Neon with Neon Auth (no staff 2FA at launch). Neon is empty and nothing has been connected to Supabase, so this is a fresh build, not a migration. Proposal and sources: `docs/proposals/neon-migration.md`.

## What exists now

| File | Status |
|---|---|
| `neon/00_discover.sql` | Read-only query that reports the shape of Neon Auth's tables and the roles present |
| `neon/001_schema.sql` | Schema translated from the Supabase migration. **Untested against Neon.** Review before running |
| App code (`src/`) and Worker (`worker/`) | **Still Supabase.** Not yet ported (see "What is blocked") |

## Order of work

1. **Create a Neon branch for testing** (do not use your main branch first).
2. **Enable Neon Auth** on that branch. In Neon Auth settings, turn on email verification with *verification codes* (works on Neon's shared sender; verification links need your own SMTP). Add your site URL as a trusted domain.
3. **Enable the Data API** on the same branch and database. Choose "Use Neon Auth". **Leave "Grant public schema access" unchecked**: it would give signed-in users access to every table, while `001_schema.sql` grants table by table.
4. **Run `neon/00_discover.sql`** in the SQL editor and send me the output. I will confirm the user and session id types (the draft assumes uuid) and fix anything that differs.
5. **Run `neon/001_schema.sql`** on the test branch. Check it finishes without errors.
6. **Create the Worker's database login** in the Neon console: a login role that is a member of `netfly_service`, with a strong password you keep out of git. This replaces Supabase's service-role key. The Worker never uses the browser-facing roles.
7. **Make yourself the first operator:** sign up in the app (after the code port), then run:
   ```sql
   update public.roles set role = 'super_administrator'
   where user_id = 'REPLACE_WITH_YOUR_USER_ID'::uuid returning user_id, role;
   ```
   Check exactly one row comes back.

## Cloudflare (not set up yet)

Follow `DEPLOYMENT.md` section 2, using these values:
- R2 needs a payment method on the Cloudflare account and can bill beyond the free allowance. Get your own approval first (`FREE_TIER_LIMITS.md`).
- Create a **private** bucket named `netfly-private-media` (matches `worker/wrangler.toml`); keep public access off.
- Create the Worker `netfly-playback`, attach a custom domain you control, and keep the two rate-limit bindings.
- Secrets (set with `wrangler secret put`, never in files): the Neon login connection string for the Worker. Plain variable: `APP_ORIGIN` = your exact site origin.

## Vercel

The Neon integration injects connection strings such as `DATABASE_URL` into Vercel. This site is a static app: **never copy these into any `VITE_` variable.** Only the public Neon Auth and Data API URLs (when I add them) belong in `VITE_` variables.

## What is blocked, and why

- **Client port** (sign-in, data queries): needs Neon's JavaScript client added to `package.json`. Package installs are blocked in my environment, and adding a dependency without updating `package-lock.json` would break your `npm ci`. Run `npm install` for the package named in Neon's console when we get there, or tell me when package installs are enabled.
- **Worker port:** the Worker currently calls Supabase's HTTP API and auth endpoints. It must switch to direct SQL (Cloudflare Hyperdrive or Neon's serverless driver) and to verifying Neon Auth tokens. This also needs a dependency or a Cloudflare binding, and its tests must be rewritten.
- **Tests:** the existing database tests (PGlite) and connected tests assume Supabase; they need adjusting to these role names.

## Security trade-offs you accepted

- Staff accounts have **no second factor** until Neon Auth supports one. Mitigate: keep the operator list to one or two people, long unique passwords, review `admin_audit_logs` regularly, and plan to add MFA when available.
- Neon Auth is still a pre-GA product; check its status before public launch.
- Neon free plan compute is limited and **suspends when the monthly allowance runs out**, which would stop playback checks. Budget for a paid plan before real traffic.
