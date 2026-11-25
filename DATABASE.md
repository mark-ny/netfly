# Database

Apply versioned files under supabase/migrations in order with the Supabase CLI. Each migration is transactional. The schema seeds genre labels, a screening-room collection and brand and quota settings. The local CLI seed adds eight draft movie records. Provide your own rights and registered assets before releasing a connected film.

| Area | Relations and ownership |
| --- | --- |
| Identity | Auth owns credentials and sessions. Signup creates profiles and roles. Only an MFA-verified super administrator can assign roles. |
| Catalog | movies, genres, movie_genres, cast_members, movie_cast, collections and collection_movies hold metadata. catalog is a security-invoker view. |
| Rights and media | content_licenses holds territory arrays, contractual references and UTC start and end instants. video_assets assigns a unique immutable prefix to a movie. subtitle_tracks points into that prefix. |
| Viewer | watchlists, watch_progress and ratings use user/movie composite primary keys. Personal rows are isolated by auth.uid(). |
| Operations | playback_sessions holds a digest, live Auth session ID, timestamps and counters. analytics_daily has movie/day totals. user_reports tracks requests. site_settings stores brand and budget configuration. admin_audit_logs records staff mutation identity, type and record reference. |

The database enables RLS on every exposed base table. Private entitlement functions use explicit search paths. Playback RPCs are executable by the service role only. The Worker validates the caller before invoking them. Administrative rights lookup uses the stored role and the verified JWT assurance level. User-provided metadata cannot grant a role.

Only published, released movie metadata is available from the catalog. Rights, bucket paths, contracts, other users' viewing data and grant hashes have separate access rules. Metadata can remain listed when territorial playback rights expire. A film with no matching active agreement cannot play. “*” means the operator has documented worldwide rights.

Use the dashboard SQL editor to inspect migrations, indexes, policies and grants. Run npm run test:db after schema changes. For restore, follow SECURITY.md and exercise the policy tests on a staging copy before returning traffic.

