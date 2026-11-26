# NETFLY Upgrade Plan (Phase 1: Audit)

Audit date: 2026-11-26. Source: `netfly-main.zip` (167 files, not a git repository, so no history or working-tree status was available; all work is done on an extracted copy and the original zip is untouched). No secrets were found in the files read. No live service was contacted.

## 1. What the repository actually is

The repo is **already branded Netfly** and is a considerably more complete build than the baseline spec assumes. It is an incremental-refinement target, not a rebuild.

| Layer | Actual implementation | Spec baseline | Decision |
|---|---|---|---|
| Frontend | React 19, TypeScript, Vite 7, react-router 7 | same | Retain |
| UI | Tailwind 4 (single 1,290-line `styles.css`), Lucide, Framer Motion | same | Retain |
| Database/Auth | Supabase Postgres + RLS + Auth (one migration + brand migration) | same | Retain |
| **Frontend hosting** | **Vercel** (`vercel.json`, `.openai/hosting.json`, `DEPLOYMENT.md`) | Cloudflare Pages | **Discrepancy. Preserve Vercel, report.** |
| Media storage | Private R2 bucket `netfly-private-media`, binding `MEDIA` | same | Retain |
| Playback gateway | Cloudflare Worker `netfly-playback` (`worker/index.js`, cron `17 * * * *`, two rate-limit bindings) | same | Retain |
| Ingestion | `tools/ingest.py` (plan / encode / upload), FFmpeg + FFprobe, boto3 for R2 | same | Retain, unchanged |
| Player | Video.js 8.23.7 over HLS, custom toolbar | same | Retain |
| CI | `checks.yml` (lint, tests, build, python tests, Playwright, npm audit), manual `deploy.yml` for the Worker | same | Retain |

Source layout: `src/` is 8 files (`main`, `Shell`, `CatalogPages`, `Player`, `Accounts`, `Admin`, `state`, `api`, `catalog`) totalling about 3,000 lines. Admin and Player are lazy-loaded. Tests: Worker gateway (3), PGlite policy suite (15 cases), Playwright demo spec, connected Docker harness (8 checkpoints), Python ingestion (3).

## 2. Baseline results (measured today)

| Check | Result |
|---|---|
| `node --test tests/*.test.mjs` (Worker gateway) | **3 / 3 pass** |
| `python3 -m unittest discover -s tools -p 'test_*.py'` | **3 / 3 pass** (real FFmpeg encode; S3 is an in-memory fake, so `boto3` is not needed) |
| `npm run typecheck`, `lint`, `build`, `test:db`, `e2e`, `test:connected` | **Unverified.** `node_modules` is absent and package installs are blocked in this environment. Docker is present but the connected suite was not attempted. |
| Existing docs claim (TESTING.md, 25 Nov 2026) | All of the above passed on the author's machine. Not independently reproduced here. |

To reproduce the full baseline on your machine: `npm ci && npm run typecheck && npm run lint && npm test && npm run test:db && npm run build && npx playwright install chromium && npm run e2e`.

## 3. Preserved ingestion reference (do not change)

Verbatim from `VIDEO_PROCESSING.md` and `tools/ingest.py` (no credentials involved):

```bash
python3 tools/ingest.py plan --minutes 90 --count 20 --renditions 360,480,720 --viewer-hours 100
python3 tools/ingest.py plan --source "/media/approved-film.mp4" --renditions 360,480 --used-gb 2.1 --limit-gb 10
python3 tools/ingest.py encode "/media/approved-film.mp4" --out encoded --renditions 360,480,720 --segment 6 --caption en=english.vtt --used-gb 2.1
python3 tools/ingest.py upload encoded/<UUID> --used-gb 2.1 --limit-gb 10            # dry-run validation
python3 tools/ingest.py upload encoded/<UUID> --used-gb 2.1 --limit-gb 10 --apply    # real upload
```

- Env for upload: `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (names only).
- Flags: `--renditions` (360/480/720/1080, default 360,480,720), `--segment` (6/8/10/12, default 6), `--caption LANG=PATH`, `--warn-at` (default 70,85,95), `--used-gb`, `--limit-gb` (default 10), `--viewer-hours`, `--apply`.
- Output: `encoded/<UUID>/` with `master.m3u8`, `<h>p/index.m3u8`, `<h>p/seg-NNNNN.ts`, `captions/<lang>.vtt`, WebP thumbnail, `asset.json` (SHA-256/MD5 inventory), `upload-status.json`.
- Object keys: `<UUID>/master.m3u8`, `<UUID>/<h>p/...`, `<UUID>/captions/...`. Upload order: segments, variant playlists, master last. Conditional PUT, Content-MD5, HEAD verify.
- Registration: admin UI, `video_assets.prefix` = UUID, plus `subtitle_tracks.path` (`captions/<lang>.vtt`) and `content_licenses`.
- Playback: `POST /authorize` returns `{id, url, qualities, tracks, renew_after}`, then `GET /media/<64-hex token>/<file>` and `POST /heartbeat` every 45 s.

**Rule for this upgrade:** no edits to `tools/`, `worker/` media paths, key layout, manifests or the migration history. Anything touching them becomes a recommendation.

## 4. Feature matrix

Status: W = working (per code, tests not re-run), P = partial, M = missing, U = unverified. Action: R = retain, F = refine, A = compatible addition, REC = recommendation requiring approval.

| Area | Status | Finding | Action |
|---|---|---|---|
| Brand name, wordmark, PWA icons | W | "Netfly" everywhere; `Mark` SVG; manifest present. Tagline not used. Accent/tokens are ad hoc in one CSS file. | F: document tokens and accent, add tagline |
| Landing page for signed-out users | **M** | `/` is the catalog home for everyone. There is no marketing hero, FAQ section, or sign-in/register call to action. Header has only a profile icon. | A |
| Navigation | P | Home, Movies, Genres, Watchlist, Search, profile icon. No "New & Popular" (routes `/trending`, `/recently-added`, `/popular` exist but are not linked), no "My List" label, no TV Series (correctly absent). Mobile menu exists. | F |
| Home rows | P | Hero (6 featured), Continue watching, collection shelf, Recommended, Trending, Recently added. Empty rows hidden. Hero has no Resume or More Info. No genre rows (African/Kenyan), no Popular row on home. | F |
| Cards and rails | P | Lazy images, save button, one chevron that wraps. No keyboard row navigation, no left arrow, no hover preview (acceptable per spec). | F |
| Detail page | P | Needs line-by-line check of cast, subtitles, quality fields. Ratings and watchlist exist. No "similar titles". | F, A |
| Search | P | Client-side filter over title, genres, cast, year, language, director; URL params; Filters panel. Not debounced explicitly; whole catalog is loaded client-side in pages of 48. Acceptable for hundreds of titles. | F |
| Auth: email, verify, login, recovery, logout | W | Uses Supabase Auth; `next` redirect is regex-validated. Verified by connected suite per docs. | R, F (error copy) |
| Google OAuth | P | Behind `VITE_GOOGLE_SIGN_IN=true`; needs provider config. | R, mark U |
| Account settings | P | Profile name, reduce-data, export, delete (via Worker). No change-email/password UI, no sign-out-all, no session list. | A (sign-out-all via `signOut({scope:'global'})`) |
| MFA | W | TOTP for staff enforced in RLS via `aal2`. Optional for viewers. | R |
| Multiple viewing profiles | **M** | One profile per auth user (`profiles.user_id` is the PK; `watchlists`, `watch_progress`, `ratings` are keyed on `user_id`). Adding viewer profiles changes those keys. | **REC (migration proposal)**, not implemented |
| Kids/maturity/PIN | M | `movies.classification` exists but nothing enforces it at the catalog view or gateway. | REC (depends on profiles) |
| Player | P | Video.js with native controls, extra toolbar: ±10 s, quality select, keyboard j/l/k, speed, captions, PiP via Video.js. Resume and 30 s throttled progress. Heartbeat renewal. No end-of-film "next" (correct: no series). Quality menu uses VHS representations with a fallback URL swap. | F |
| TV series | M | No schema. Nav correctly has none. | REC (design only) |
| Admin | W | Role-gated tabs, CRUD, import inventory, confirm on delete, overview metrics, quota warnings, audit logs, reports. Uses `window.confirm`. | F (dialogs, filters, responsive tables) |
| Analytics | W | Real counts via `cinema_overview()`; concurrency labelled estimate. | R |
| Worker security | W | Origin pinning, JSON size caps, IP rate limit fails closed, hashed grant tokens, per-segment entitlement check, `private, no-store`, four-screen cap. | R, see section 5 |
| PWA/offline | W | Static assets and `offline.html` only; no media caching. | F (rename cache, icons) |
| SEO | W | Build generates per-film pages and sitemap; `robots.txt` excludes private routes. | R |
| Docs | W | All ten named docs exist and are accurate and specific. | F (update, not replace) |

## 5. Findings and risks to carry into later phases

1. **Hosting discrepancy.** Vercel, not Cloudflare Pages. Everything in the prompt about "Pages" is applied to Vercel. No migration proposed.
2. **Legacy "Stillframe" identifiers.** `localStorage` key `stillframe:demo:v1` (demo watchlist/progress), service-worker cache prefix `stillframe-static-`, a `_redirects` rule, the migration's seeded brand value. They are invisible to users but rename would drop saved demo data. Plan: read old key and migrate on first load, keep the redirect.
3. **`vercel.json` vs `public/_headers`.** The CSP is duplicated in both (`_headers` is a Cloudflare/Netlify format and is inert on Vercel). Risk of drift. Plan: keep `vercel.json` authoritative and note it in SECURITY.md.
4. **Worker media route does not handle `Range` requests.** Fine for HLS `.ts` segments and playlists; would matter if anyone later serves MP4. Report only.
5. **Worker JWT parsing** decodes claims after Auth validation (`/auth/v1/user`); this is safe because Auth already verified the token. No change.
6. **Anonymous `/contact`** writes with the service key behind a rate limit and size checks; acceptable, retained.
7. **Classification is display-only.** Must not be described as parental control.
8. **Capacity claims.** `SCALING_PLAN.md` correctly treats 100 to 500 viewers as design targets. The per-segment database check means 500 viewers is about 83 queries/s. That is flagged in the docs, and is unmeasured.
9. **Not verifiable here:** Cloudflare runtime behaviour, live R2, SMTP, Google OAuth, Safari HLS/PiP, real-domain CORS, and the CI results.

## 6. Proposed work, in order

| Step | Scope | Touches protected paths? |
|---|---|---|
| A. Signed-out landing page (hero, value proposition, sign-in/register CTAs, real featured titles from the public catalog, FAQ, support/policy links); keep every existing URL | `src/CatalogPages.tsx`, `main.tsx`, CSS | No |
| B. Navigation: Home, Movies, New & Popular, My List, Search, account menu; mobile drawer; keyboard-accessible genre menu | `Shell.tsx`, CSS | No |
| C. Home refinements: Resume/More Info on hero, Popular and genre rows (African Cinema when data exists), keyboard/touch rails, "Because you watched" from real genre overlap, no fabricated ranks | `CatalogPages.tsx` | No |
| D. Detail page: similar titles, subtitle/quality availability from real data | `CatalogPages.tsx` | No |
| E. Player polish: styling, shortcut help, error states, buffering, no autoplay with sound | `Player.tsx`, CSS | No (same gateway contract) |
| F. Account: sign-out all devices, clearer auth errors and states | `Accounts.tsx` | No |
| G. Admin: replace `confirm()` with accessible dialog, search/filter, status badges, responsive tables | `Admin.tsx`, CSS | No |
| H. Design tokens, accent documentation, focus, reduced motion, skeletons, SW cache rename with migration | CSS, `sw.js` | No |
| I. Tests and docs updates, plus `NETFLY_UPGRADE_REPORT.md` and `NETFLY_RECOMMENDATIONS.md` | tests, docs | No |

## 7. Approval-required (documented, not implemented)

- Viewer profiles (kids profile, PIN, maturity enforcement): migration touching the primary keys of `watchlists`, `watch_progress` and `ratings`, plus RLS and Worker enforcement. A design and rollback plan will be provided.
- TV series/seasons/episodes schema and admin registration.
- Skip-intro/credits timestamps (needs new metadata).
- Any change to encoding ladder, 1080p, segment length, object layout, caching in the gateway, payments, or a metadata provider.

## 8. Regression checklist for ingestion (to run with local fixtures)

1. `python3 tools/ingest.py plan ...` prints the same estimate as before.
2. `encode` on a 10-second local fixture produces the artifacts in section 3.
3. `upload <dir>` (dry-run) validates against the inventory; no network.
4. Upload to an **authorized test bucket only**, then register via the admin UI with the existing steps.
5. Play through `/authorize` then `/media/...`; confirm an unlicensed or expired title is denied.
6. Confirm a previously published title still resolves with no change.

Steps 4 to 6 are **unverified** until test credentials are supplied.

## 9. Open questions

- Do you want a signed-out landing page at `/` (and the catalog for signed-in users) or a separate `/welcome` route? Default: landing at `/` only when signed out in connected mode; the bundled demo mode keeps the catalog home.
- Accent colour: default plan keeps the current brand mark and picks a single original accent, documented in the tokens section.
