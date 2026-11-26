# Verification record

The following checks passed on 25 November 2026 with Node 24, Chromium, FFmpeg and Python on the development machine.

| Check | Result |
| --- | --- |
| npm run typecheck, npm run lint, npm run build | Passed. The production demo generated eight film metadata pages, a sitemap and a clean client-bundle credential check. |
| npm test | Three gateway tests passed. They cover origin and path restrictions, authentication requirements, cache headers, expired or denied grants, rate-limit configuration and authorization before reading the bucket. |
| npm run test:db | Fifteen embedded PostgreSQL policy cases passed across anonymous, viewer, content manager, administrator and super administrator roles. Tests cover ownership, MFA, unpublished and scheduled titles, territorial access, session renewal and immediate license expiration. |
| npm run e2e | Five Playwright tests passed. They exercise desktop and mobile navigation, search and filters, persistence, HLS, quality selection, subtitle selection, resume, reports, ratings, offline fallback and constrained mobile browsing without movie preloads. |
| npm run test:connected | Eight checkpoints passed with PostgreSQL 17, GoTrue, PostgREST, Mailpit, Chromium and the actual Worker handler. They cover registration/email verification, login, password recovery, MFA and privileged API CRUD, authorized HLS, a shared-account watchlist, staff dashboard CRUD, data export and confirmed deletion. |
| Python ingestion tests | Three passed. A real FFmpeg encode, subtitle validation, output estimates, quota refusal, modified-file detection, resumable upload and immutable conflict handling were exercised. The object-store tests use an in-memory S3 implementation. |
| Media inspection | All 16 demo rendition playlists decoded, all 48 segments started on keyframes, and timestamps aligned between qualities. |
| Dependency scanning | npm audit reported zero known vulnerabilities after updating React Router, Vite, lint dependencies and the lockfile. |
| Bounded local streaming load | 4,000 successful requests across the 100, 200 and 500 simulated-viewer scenarios. See MEDIA_BENCHMARK.md for latency and methodology. |

## Reproduce the checks

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run test:db
python3 -m unittest discover -s tools -p 'test_*.py' -v
npm run build
npx playwright install chromium
npm run e2e
npm run test:connected
npm audit
node tools/bench-media.mjs tests/fixtures/hls
```

Set CHROMIUM_PATH to an installed Chromium executable when using a system browser. The connected suite requires Docker, sufficient free disk space for its four images and free loopback ports 4213 and 4214. It creates isolated test accounts and private Docker services, then removes its own containers. The demo suite tests a production build with both Supabase build variables empty. Its browser fixture uses port 4186.

## Launch verification still required

The connected suite runs the real Worker handler with a local file-backed bucket adapter and a rate-limit test double. The actual Cloudflare runtime, live R2 upload permissions, native Safari HLS and picture-in-picture, public SMTP deliverability, Google OAuth, billing controls, real domain CORS and regional routing still need operator staging verification. No licensed feature catalog or public cloud capacity was supplied.

Run the smoke script after configuring staging. Sign up through the deployed frontend, receive the verification email, sign in, play a permitted registered film, pause and resume from another browser, change quality and captions, and keep playing past several renewals. Verify an expired contract and a viewer in an excluded territory cannot read the media. Review response headers and check that the service worker contains no protected media. Measure first-frame time, authorization latency, buffering, failures, actual request counts and cost under the staging plan before raising capacity.

