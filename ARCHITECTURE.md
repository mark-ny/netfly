# Netfly architecture

The client is a React and TypeScript single-page app built with Vite, Tailwind, locally packaged fonts, Lucide and Framer Motion. The catalog opens without loading Video.js. The player and admin dashboard load on demand. CSS handles reduced motion and horizontal shelves. The browser service worker caches versioned script, stylesheet and font assets and an offline page.

## Request paths

1. Anyone can browse released titles from the Supabase PostgREST catalog view. An anonymous publishable key identifies the app. Database RLS controls what each user can read and write.
2. Supabase Auth provides verified email sessions, account recovery, optional Google OAuth and staff TOTP. Profile, history, bookmarks and ratings use the viewer's JWT and ownership policies.
3. An authenticated player posts the chosen movie ID to the playback Worker. The Worker verifies the session with Auth. A restricted SQL function checks the live Auth session, time window, territory, publication and available media. An advisory lock serializes grant creation per user.
4. The Worker returns an opaque, 256-bit grant in a path. Its digest lives in Postgres. Every playlist, caption and segment goes through the Worker, which resolves the digest to a registered UUID before reading the private R2 binding. A 45-second heartbeat extends a two-minute lease. License withdrawal and expiration are checked on every read. A native HLS player can resolve relative media URLs without custom headers.
5. The encoder runs on the operator's workstation. Uploads use immutable asset prefixes and integrity-checked retries. A successful upload produces the inventory needed for registration. Public artwork and previews have separate rights and URLs.
6. A scheduled Worker aggregates playback sessions hourly and applies retention. Administrative metrics count real data. The fully local demo has no shared analytics or administrative authentication.

## Local demo

Eight open-access picture studies run from public/demo. Their explicitly public media is distributable under the terms described in public/art/CREDITS.md. The app stores its local profile in browser localStorage. Configuring both Supabase variables switches the catalog and viewer data to the database. An unreachable configured backend surfaces an error.

## Future paid access

The database entitlement function is the integration boundary for a future subscription, rental or ad-supported policy. The checkout workflow, payment credentials and paid features are absent from the launch build. A future payment integration needs approval and verified provider webhooks before entitlement changes.

