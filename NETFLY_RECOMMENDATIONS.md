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

## 9. Storage beyond 60 GB (estimates from the repo's own model)

Model: three renditions total 4,088 kb/s, so a 90-minute film is about 2.90 GB plus 2 MB of ancillary files; 360p alone is about 0.50 GB per film. R2 Standard storage is $0.015 per GB-month after 10 GB free, using the pricing recorded in FREE_TIER_LIMITS.md on 25 Nov 2026. I did not re-verify provider pricing today; check the official pages before deciding.

| Catalog (90-min films) | Ladder | Storage | Storage cost per month |
|---|---|---:|---:|
| 20 | 360, 480, 720 | about 58 GB | about $0.72 |
| 50 | 360, 480, 720 | about 145 GB | about $2.03 |
| 100 | 360, 480, 720 | about 290 GB | about $4.20 |
| 100 | 360 only | about 50 GB | about $0.59 |
| 200 | 360, 480, 720 | about 580 GB | about $8.55 |

Storage is the small cost. Requests are the constraint: see the 20, 100, 200 and 500 viewer table in SCALING_PLAN.md (20 viewers is about 12,000 segment requests per hour, 500 minutes to reach 100,000 Worker calls). Options in order of least change: keep three renditions and add a paid Workers plan; drop 720p for long titles; add a short authorization cache in the Worker (takedown delay equals cache time). None is implemented.

## 10. Viewer profiles proposal

Detailed SQL, rules, tests and rollback are in `docs/proposals/viewer-profiles.md` and `.sql`. The SQL has not been run against any Postgres (none is available here), so treat it as a draft to test on a staging project.

## 11. Neon database (you asked for a migration plan)

See `docs/proposals/neon-migration.md`: options (stay on Supabase, full Neon, Neon with the existing sign-in), risks (accounts, staff MFA, Worker rewrite, free-plan compute limits under playback load) and a staged plan with rollback. Nothing has been changed.

## 12. Kids profiles (built in 1.8.0), PIN lock and per-profile maturity levels (not built)

Kids profiles with a PG limit exist now (CHANGELOG 1.8.0). What follows is the remaining PIN and finer maturity-level work.

Profiles (1.6.0) separate lists and history only. Restricting what a profile can see or play is a security feature, so it should be enforced server side:
1. Add `max_rank` and `is_kids` to `viewer_profiles`, written only through the Worker.
2. Filter the `catalog` view by the active profile's rank (needs the profile in the request, for example a Worker-signed claim) and check the rank again in `start_playback`.
3. Store PIN hashes server side with a rate limit; never compare a PIN in the browser.
This needs a Worker change and approval, so it is left as a proposal. The earlier draft is in docs/proposals/viewer-profiles.sql (superseded by the migration for everything except these fields).
