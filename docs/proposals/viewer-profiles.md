> **Status (1.6.0):** the simplified version (names, colours, per-profile data) was implemented in `supabase/migrations/20261126090000_profiles_series.sql`. Kids mode, PIN and maturity limits below remain proposals.

# Proposal: viewer profiles, kids profile, PIN (needs approval)

SQL: `docs/proposals/viewer-profiles.sql` (not applied, not in `supabase/migrations`).

**Phase 1 (additive, reversible):** new `viewer_profiles` table, a default profile backfilled per account, nullable `profile_id` on watchlists, progress and ratings, ownership-guard triggers, a five-profile cap. The current app keeps working unchanged because `user_id` columns and RLS policies are untouched.

**Phase 2 (separate review):** make `profile_id` required, re-key the three tables, replace the policies.

**Security rules the design enforces:** a profile never grants roles (admin rights stay on `roles` by auth user); profile creation by the browser cannot set kids, maturity, default or PIN fields; PIN hashing, attempt limits and maturity checks live in the Worker and database, because front-end-only controls are not parental controls.

**App work after approval:** "Who's watching?" picker, profile manager, per-profile data loading in `state.tsx`, `/authorize` receiving a profile id and checking ownership and rank, tests for cross-profile and cross-account access and for escalation attempts.

**Test plan:** extend `tests/db.mjs` (PGlite) with: user A cannot read or write user B's profiles or rows; profile_id from another account is rejected; browser cannot set `is_kids`, `max_rank` or `pin_hash`; default profile cannot be deleted; sixth profile rejected.

**Risks:** data migration on live tables (phase 2); free-text classifications; PIN brute force (needs Worker rate limit). **Rollback:** SQL at the bottom of the file for phase 1.
