# NETFLY Upgrade Report (round 1)

Date: 2026-11-26. Scope: front-end refinements that need no change to the database, Worker, storage, ingestion or deployment. See `NETFLY_UPGRADE_PLAN.md` for the audit and `NETFLY_RECOMMENDATIONS.md` for items awaiting approval.

## Verification status (read this first)

| Check | Result |
|---|---|
| Worker gateway tests (`node --test tests/*.test.mjs`) | **3 / 3 pass** after the changes |
| Ingestion tests (python unittest) | 3 / 3 pass (run before the changes; `tools/` was not edited) |
| Syntax of edited `.tsx`, `.ts`, `.mjs` files | Parse cleanly (TypeScript reported only missing-package errors, no syntax errors; `node --check` OK on `connected.mjs`) |
| `npm run typecheck`, `lint`, `build`, `e2e`, `test:db`, `test:connected` | **NOT RUN.** Dependencies cannot be installed in this environment. **Every UI change below is untested in a browser.** Run the commands in `TESTING.md` before merging. |

## Completed (code written, not browser-tested)

| Change | Files |
|---|---|
| Signed-out landing page at `/` in connected mode: "Entertainment Without Limits" hero, Join free / Sign in / Browse films, a row of real featured titles, FAQ, support and policy links. Demo mode and signed-in users still get the catalog home. A loading state avoids flashing the landing page while the session is restored. | `main.tsx`, `CatalogPages.tsx` (`Landing`), `state.tsx` (`authReady`), `styles.css` |
| Navigation: **New & Popular** (links to the existing `/trending`), **My List** (URL stays `/watchlist`), a "Sign in" button when signed out | `Shell.tsx` |
| Hero: **Resume** when progress exists, **More info** link | `CatalogPages.tsx` |
| Home rows: **Popular on Netfly** (real play counts, hidden when none), up to three genre rows with at least two films (African Cinema first). No invented rankings or percentages. | `CatalogPages.tsx` |
| Rails: previous and next arrows (hidden on phones; cards stay keyboard- and touch-scrollable) | `CatalogPages.tsx`, CSS |
| Film page: **More like this** (ranked by shared genres) | `CatalogPages.tsx` |
| Account: **Sign out on all devices** (Supabase `signOut({scope:'global'})`) | `Accounts.tsx` |
| Visible-focus ring in the accent colour; design tokens documented | `styles.css` |
| Tests updated for renamed labels ("My List", "Added to My List") | `demo.spec.ts`, `connected.mjs` |

Design tokens: surface `#121312`, text `#f7f5f0`, muted `#acada7`, border `#343633`, accent `#ff814d` (warm ember; already the app's accent, kept and documented as Netfly's). Brand clearance has **not** been performed; do that before public launch.

## Deliberately not changed

- **Admin delete confirmation** still uses `window.confirm`. The connected test accepts a native dialog, so swapping it for a custom dialog needs a test change I cannot run. Listed as next.
- **Legacy identifiers** `stillframe:demo:v1` (local demo data) and the `stillframe-static-` cache prefix are kept so existing browsers keep their saved data.
- **`tools/`, `worker/`, `supabase/migrations/`, `vercel.json`, `.env.example`**: untouched.

## Partial, unverified or still open

- Player styling, shortcut help and buffering states (spec section 10): not started.
- Admin search/filter, status badges and responsive tables (section 12): not started.
- Rail keyboard arrow-key navigation, hover trailers: not implemented (cards are already focusable).
- Search debounce, a skeleton loader and a PWA icon refresh: not started.
- Docs: README feature list and TESTING.md need a line each for the above; ARCHITECTURE, DEPLOYMENT and the rest are still accurate.
- No git history was in the zip, so changes cannot be listed as a diff; the changed files are those in the table above plus the three new `NETFLY_*.md` files.

## Required user actions

1. `npm ci`, then run: `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e`. Report any failures and I will fix them.
2. If you have Docker: `npm run test:connected`.
3. Review the landing page on a phone and desktop (signed out, with Supabase variables set).

## Rollback

All changes are in the files listed above. Restore them from your original zip or git history; nothing touched the database, storage or deployment settings.

## Round 2: bundled sample films removed (at your request)

- Deleted `public/demo/`, `public/art/` (artwork and credits file), `scripts/demo-metadata.json`; `src/catalog.ts` now has an empty sample catalog; `supabase/seed.sql` is an empty comment file; the copyright page no longer links the photo credits.
- Kept one tiny HLS fixture at `tests/fixtures/hls/the-last-light/` (about 0.9 MB) because the connected gateway test and `tools/bench-media.mjs` stream it. It is test-only, not shipped in `public/`.
- `tests/browser/demo.spec.ts` was rewritten for the empty preview (navigation, empty states, mobile layout, offline fallback, local profile). The earlier film-specific browser tests were dropped. **Not run.**
- Nothing in your database, R2 bucket, migrations, `tools/ingest.py` or the Worker was changed. Existing demo rows in a live database (if you ever seeded them) are untouched; archive them in Administration if you want them gone.
- With no Supabase variables, the home page now shows "The program is being prepared". Connected mode is unchanged.

## Round 3: admin, search, rails and player (untested in a browser)

- **Admin:** deleting a record now opens an accessible confirmation dialog ("Delete permanently" / Cancel, Escape closes) instead of the browser confirm box. A "Filter this page" box narrows the 25 records currently shown (client-side, current page only). The connected test was updated to click the new button.
- **Search:** typing is debounced by 250 ms before the URL updates, so shared search links still work.
- **Rails:** Left and Right arrow keys scroll a row when focus is inside it.
- **Player:** added Left/Right arrow seek, M mute and F fullscreen alongside J, L, K, with a visible shortcut line. Playback still starts muted and never autoplays with sound; gateway, authorization and renewal are unchanged.
- **Still open:** admin status badges, skeleton loaders, PWA icon refresh, player skin and quality-menu styling, auth error copy. Run the Playwright and connected suites before relying on any of this.

## Round 4 (v1.4.0): batch of small items (untested in a browser)

Friendlier auth error copy, admin status badges, accent-coloured player skin, PWA manifest metadata and shortcuts, version labels and `CHANGELOG.md`. Skeleton loading already existed (`.loading` pulse), so no change was made. Not done: custom PWA icon artwork (needs image tooling here), viewer profiles and series (await your approval, see NETFLY_RECOMMENDATIONS.md).
