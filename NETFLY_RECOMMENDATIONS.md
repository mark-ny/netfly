# NETFLY Recommendations (approval required; nothing here is implemented)

Each item lists benefit, cost, risk and rollback. Costs are estimates for planning only.

## 1. Viewer profiles (Netflix-style "Who's watching?")

- **Why:** one account can hold several people; enables kids profiles and per-profile history.
- **Today:** one profile per login (`profiles.user_id` is the primary key; `watchlists`, `watch_progress`, `ratings` are keyed by `user_id`).
- **Proposal:** add `viewer_profiles(id, account_id → auth.users, name, avatar, is_kids, max_classification, pin_hash)`; add a nullable `profile_id` to the three viewer tables; backfill one default profile per account; change primary keys to `(profile_id, movie_id)`; RLS checks `account_id = auth.uid()` through the profile.
- **Risk:** primary-key change on live data; the Worker must also check the active profile for restricted titles.
- **Rollback:** keep old `user_id` columns during a transition release; revert the policies.
- **Needs:** your approval, a staging Supabase project.

## 2. Maturity limits, kids profile and PIN

Only valid once item 1 exists and the **Worker `/authorize`** and the catalog view enforce them. `movies.classification` is free text today, so a controlled list is also required. Until then nothing in the UI should be described as parental control.

## 3. TV series, seasons, episodes

Add `series`, `seasons`, `episodes(movie_id → movies)` so each episode reuses an existing `video_assets` row and the same ingestion command. No change to `tools/ingest.py`. Skip-intro and next-episode buttons also need timestamp columns. Risk is low (additive tables). Navigation stays hidden until real series exist.

## 4. Gateway and capacity (no changes made)

- Each segment request runs one Supabase authorization query. At 500 viewers that is about 83 queries per second and 300,000 Worker calls per hour; that exceeds Workers Free (100,000 per day) in about 20 minutes. Estimates are in `SCALING_PLAN.md` and are unmeasured.
- Options: a short (10 to 30 s) in-Worker authorization cache keyed by token digest (tradeoff: takedown delay equal to the cache time); 10-second segments (about 40 percent fewer requests, slower seeks); a paid Workers plan (from $5 per month); fewer renditions (360p alone is 9.91 GB for 20 films).
- Scenarios, 20 / 100 / 200 / 500 concurrent viewers, storage beyond 60 GB: use the one-hour table in `SCALING_PLAN.md`; verify provider quotas against current official pages before buying anything.
- Do not claim support for these numbers until a staged, authorised load test passes.

## 5. Hosting discrepancy

The app deploys to Vercel; the brief assumed Cloudflare Pages. Moving would let the site, Worker and R2 share one provider, but it is a deployment change with DNS and header implications. Recommendation: stay on Vercel for launch.

## 6. Security hardening candidates

- `public/_headers` duplicates the CSP in `vercel.json` and does nothing on Vercel; keep one source of truth.
- Narrow `connect-src` and `media-src` from `https:` to the exact Supabase and gateway origins for production (already advised in `SECURITY.md`).
- The Worker media route ignores `Range` requests; harmless for HLS, relevant only if MP4 is ever served.
- Add Supabase Auth CAPTCHA or provider rate limits before public registration (provider-side setting).
- Have counsel review privacy, terms and takedown templates for Kenya (Data Protection Act, KFCB classification).

## 7. Optional integrations (none required)

TMDB for metadata (licence and attribution rules apply, free for non-commercial use, check terms); Resend for email (free tier exists; SMTP is already supported by Supabase). Payments (M-Pesa, cards, ads): keep disabled; the entitlement function in the database is the documented boundary.

## 8. Next implementation batch (once you have run the tests)

Accessible admin delete dialog plus its test update; admin search and status filters; player polish and shortcut help; rail arrow-key navigation; search debounce; skeletons; PWA icon refresh; README and TESTING updates.
