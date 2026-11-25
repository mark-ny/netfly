# Netfly

A free-viewing movie library with a React frontend, Supabase Auth and PostgreSQL, private R2 media delivery through a Cloudflare Worker, and a local FFmpeg pipeline. The included catalog contains eight original 18-second picture studies with two HLS qualities, English captions and short previews. Licensed feature films can be registered through administration.

## Start locally

```bash
npm ci
npm run dev
```

Use Node 22.12+ or 24 and open the URL printed by Vite. The demo works without accounts or cloud credentials. Save a film, play it, switch quality and captions, revisit your history and edit the local profile. The rights and credits for the demo photography are in public/art/CREDITS.md.

## Feature checklist

- Home feature carousel, genre shelves, collections, search, filtering, pagination, trending and recently added pages, shared film links and per-film metadata.
- Adaptive HLS, manual quality, subtitles, keyboard controls, playback speed, fullscreen, browser-supported picture-in-picture, ten-second skip, resume and stream reporting.
- Email confirmation, login, recovery, optional Google, TOTP, profile settings, ratings, watchlists, history clearing, export and account deletion in connected mode.
- Roles enforced by PostgreSQL RLS; protected media, license windows, territory and schedule enforcement; hourly aggregation and retention.
- Administrative editing of films, posters, trailers, media registrations, subtitles, collections, cast, genres, contracts, users, permissions, reports and branding. Upload and transcode progress are shown in the local CLI.
- Budget planning, verified resumable uploads, static PWA offline fallback, accessibility, dependency and bundle checks, automated browser and database tests.

## Code map and launch documents

| Path | Contents |
| --- | --- |
| src/ | React application and viewer data access |
| worker/ | Authorization gateway, media proxy, account services and scheduled maintenance |
| supabase/ | Versioned migration, local development configuration and draft seed data |
| tools/ | FFmpeg ingestion and loopback capacity benchmark |
| tests/ | Gateway, PostgreSQL policy and browser suites |
| ARCHITECTURE.md · DATABASE.md | Request paths, data model and access controls |
| DEPLOYMENT.md · ADMIN_GUIDE.md | Accounts, exact setup sequence, operator bootstrap and publication |
| VIDEO_PROCESSING.md · FREE_TIER_LIMITS.md | Encoding, validation, R2 planning, provider terms and billing controls |
| SECURITY.md · SCALING_PLAN.md | Backups, restoration, incident response, retention and pilot sizing |
| TESTING.md · MEDIA_BENCHMARK.md | Reproducible checks, observed results and remaining validation |

A typical twenty-film ladder uses about 57.99 GB for twenty 90-minute films at 360p, 480p and 720p. The modeled R2 storage overage is about $0.72/month before other charges. The same catalog at just 360p is modeled at 9.91 GB, leaving little room for variation or replacements. Consider a smaller initial catalog. Hosted production accounts, SMTP, rights, legal review and domain setup are the operator's launch dependencies.

