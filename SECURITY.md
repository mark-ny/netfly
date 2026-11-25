# Security and operations

## Access boundaries

Use HTTPS and an exact APP_ORIGIN. The frontend needs a Supabase URL and publishable key. The Worker alone holds the service-role key. It verifies the access token with Auth, enforces country and grant state in the database, and reads R2 through a private binding. A token is a bearer capability. Its random value is returned to the player and its SHA-256 digest is stored. It expires after two minutes without renewal. Both the underlying Auth session and the current license are checked on each object read. Signed access controls distribution. It cannot stop screen capture.

Keep public access, the R2 development URL and public custom domains disabled on the media bucket. Keep request URL logging, browser error-reporting URL collection, traces, and cache-all rules disabled on the media route because the URL contains the grant. Media responses specify private, no-store and a no-referrer policy. Each media request costs one authorization query plus the Worker call and object read.

The Worker limits requests per IP and separately limits anonymous reports. Grant creation is serialized per account, with a cap of four active streams. Configure Auth email rate limits and production bot protection according to the provider's current supported options. Shared mobile networks and carrier NAT can encounter IP limits; measure these in a controlled pilot. Service limits apply per location. The system also needs provider-level usage monitoring.

Static Pages headers are in public/_headers. For production, narrow connect-src and media-src to the exact Supabase, Worker and approved trailer origins and img-src to approved artwork hosts. Local testing uses a separate Vite development server. Staff are trusted to register properly licensed images, media metadata and links. The database keeps privileged writes behind role checks plus MFA. RLS operates independently of UI routing. Only viewer data belongs in browser storage. An XSS defect on the same origin could read browser sessions, so avoid third-party scripts and keep dependencies patched.

## Data handling and legal review

The privacy, terms and copyright pages are templates. Record the real Kenyan controller identity and contact, lawful bases, safeguards for international transfers, retention, processor agreements, complaint process, age policies and any applicable ODPC registration or classification duties before opening registration. Apply contractual rights to territories, release times, classifications and expirations. Discuss age-restricted material with counsel and implement the required age-assurance process before adding it. See FREE_TIER_LIMITS.md for official sources.

Profile settings export account and viewer records and support deletion. Deletion cascades through viewer history, watchlists, ratings and grants. Remove separately held support correspondence as required and retain only material with a documented legal basis. Anonymous reports cannot be tied to an account automatically. Verify requesters before acting on emailed data-access requests.

## Backups, recovery and rotation

1. Keep encrypted offline copies of signed rights and source masters. Export application data and schema with a restricted database backup identity or the supported Supabase backup tooling. Protect identity data and store encryption keys independently. Use a consistent snapshot and record its timestamp, migration version, media inventory and retention period.
2. Back up private R2 objects to a separate controlled location with the operator's approved budget. Preserve the verified SHA-256 inventory. Test a restore in a new private bucket and staging database. Reapply migrations and roles, replace service secrets, verify checksums, confirm Auth settings and test RLS, license expiry and playback before switching DNS.
3. Rotate bucket API credentials by issuing a narrowly scoped replacement, verifying the next upload and disabling the old key. Rotate Supabase service keys in the Worker secret store using the provider's active key migration procedure. Keep database passwords, OAuth secrets and signing keys outside Git. Revoke user sessions on suspected credential loss.
4. For a takedown or unauthorized delivery, archive the title, disable affected media routes or revoke sessions immediately. Check request counts and audit metadata, preserve the incident timeline, notify the designated privacy and rights leads, and follow applicable legal notification deadlines. Purge any mistakenly cached content before restoration. Test one unauthorized and one authorized read before reopening.
5. Deploy the last known-good Pages revision and Worker version to roll back application code. Handle destructive schema changes with a tested forward migration or staging restore. Record the operator, incident time and recovery outcome.

