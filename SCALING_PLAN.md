# Viewing capacity and staged rollout

Planning model reviewed on 25 November 2026. The rows represent a constant number of people watching for an hour. An hour at peak demand can consume most of a daily allowance. Capacity measured on the deployed app must account for authentication, database policy evaluation, object reads and actual player behavior.

## One-hour demand model

Assume six-second multiplexed HLS segments, one active rendition per viewer, 1.5 Mbit/s average delivered bitrate including audio and transport overhead, and a progress write every 30 seconds of active playback. Assume no retries or seeks in the model below. With no object cache, each successful segment fetch invokes a Worker once and reads R2 once. Header, playlist, authorization, token renewal, subtitle, failed request and early-disconnect traffic is additional.

| Simultaneous viewers | Segments, R2 GETs and Worker calls/hour, each | Segment requests/s | Progress writes/hour | Aggregate transfer rate | GB delivered/hour | Minutes to 100k segment calls |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 typical | 6,000 | 1.67 | 1,200 | 15 Mbit/s | 6.75 | 1,000 |
| 20 | 12,000 | 3.33 | 2,400 | 30 Mbit/s | 13.5 | 500 |
| 100 | 60,000 | 16.67 | 12,000 | 150 Mbit/s | 67.5 | 100 |
| 200 | 120,000 | 33.33 | 24,000 | 300 Mbit/s | 135 | 50 |
| 500 | 300,000 | 83.33 | 60,000 | 750 Mbit/s | 337.5 | 20 |

Segment requests per hour equal viewers × 3,600 ÷ segment seconds. For example, ten viewers for two hours per day over 30 days would produce about 360,000 segment GETs, 360,000 segment Worker calls, 72,000 progress writes and 405 GB of transferred video. At six seconds, an account with no other traffic has an upper bound of 167 viewer-hours per day on Workers Free. A nominal 100-viewer two-hour screening would already exceed that request budget.

A 90-minute title produces around 900 segment files per rendition. Twenty three-rendition titles produce approximately 54,000 segment PUTs before manifests, thumbnails, verification and retries. Each segment GET or HEAD is typically an R2 Class B operation. For 100 viewers watching an hour a day, 30 days would consume about 1.8 million segment reads. For 500, the corresponding estimate is 9 million before other traffic. Budget for the daily Worker limit separately. [R2 operation classes](https://developers.cloudflare.com/r2/pricing/) · [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## How to derive service load

- Count one new playback grant per start plus 80 heartbeat renewals per viewer-hour at the configured 45-second interval. Each renewal verifies Auth and updates the session. Measure actual grants, playlist reloads and retries from a complete session.
- The gateway checks rights through Supabase for every segment. Budget one database authorization query per segment plus grant lookups. At 500 viewers the modeled segment rate alone is 83.33 reads/s. Evaluate latency and Supabase egress at that rate before scaling. A pooled query or bounded authorization cache must preserve takedown deadlines and expiry semantics.
- Low-bandwidth startup, seeking and switching qualities increase requests. Ten-second segments reduce the steady rate to 360 requests/viewer-hour but increase startup and seek granularity. Test both lengths with the intended audience before changing the encoder.
- Authorization must run before a shared cache lookup. Keep private manifests and tokens out of browser/service-worker caches. Keep expiry, publication and territory behavior correct after any optimization.
- Preserve progress on meaningful pauses and exits while deduplicating periodic writes. Measure the extra session, history and audit writes separately. Use aggregate counts instead of retaining per-segment identity data.

## Controlled capacity measurement

Start on owned local infrastructure using a tiny authorized HLS fixture. Run a complete playback session, including a token refresh, quality switch and progress persistence. Capture baseline startup time, authorization latency, buffering ratio and request count. Start the next stage only after verifying the previous one completes.

For hosted staging, use an owner-approved isolated project or route with a small fixture, a defined region, a fixed time window and disposable test users. Set a hard client-side maximum on playback sessions, requests, bytes and wall time. A six-second ladder consumes about 100 requests for ten users over one minute plus startup and ancillary requests. First run 10 users for one minute. Reconcile Worker invocations, CPU and errors, actual R2 reads, database queries, progress writes and auth limits with the dashboard. Allow for delayed usage reporting.

For the next runs, ramp to 100, 200 and 500 viewers for two minutes each only if the previous run stays inside its approved envelope. These three steady-state plateaus contribute around 16,000 segment calls and 18 GB at the modeled bitrate, before startup, retries or ramp traffic. Compare with remaining daily and monthly budgets. Stop on sustained 429/5xx errors, exhausted budget, out-of-territory playback, database saturation or authorization failures. Keep retries bounded. A free-tier limit that stops a run is itself a measured outcome.

Publish an evidence table with build revision, region, actual rate ladder, segment length, client count, duration, concurrent sessions achieved, p50/p95 startup and segment latency, buffering, failures, bytes, CPU time, database reads/writes and reconciled provider usage. Compare cold and warm runs. Report the largest tested plateau that met the agreed target. Until those measurements exist, 100–500 viewers remains a design target.

## Rollout choices

Start with the short-film demo or a rotating two-feature pilot. Check storage and daily Workers usage after every publishing batch. Add popular renditions selectively. For a larger audience, model a paid Workers plan, more R2 storage and the database tier separately, then obtain a budget decision from the owner. The full three-rendition feature catalog's modeled storage overage is $0.72/month independent of Worker or database charges. See [launch assumptions and provider terms](FREE_TIER_LIMITS.md).
