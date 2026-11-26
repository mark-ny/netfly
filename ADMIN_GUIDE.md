# Operator guide

Sign in with the provisioned staff account. In Profile, enroll a TOTP authenticator and verify the six-digit code. Open Administration. A content manager can manage titles, cast, genres, collections, licensing and media. An administrator also handles users, reports, site settings and audits. A super administrator can also assign permissions.

## Release a film

1. Create a draft in Films. Enter its slug, classification, actual running time in seconds, creator, description, publication time and public poster/backdrop URLs. A public trailer needs preview rights.
2. Add genre and cast records and associate them through Film genres and Film cast. Add the film to collections. The Featured switch enables hero rotation.
3. Run the local encoder and verify the upload as described in VIDEO_PROCESSING.md. Use its progress and failure status to resume. Register the UUID, actual byte count and qualities under Media assets. Add subtitle labels and relative paths in Subtitles.
4. Record contract reference, start and end instants and permitted ISO country codes in Licenses. An end instant is exclusive. Keep restrictions aligned with actual distribution rights.
5. Set state to published and the release time in UTC. Verify a newly authenticated viewer can play from a permitted territory and an ineligible request is denied. To withdraw a title, archive it. Archiving also stops an active stream at its next gateway read.
6. Verify poster, captions, manual quality, playback errors, search and metadata on the deployed app. Rebuild the Vercel frontend after metadata changes to refresh crawler previews and sitemap.

## Daily work

Overview shows registered media byte counts, active users, an estimated concurrency window and recent session totals. The registered inventory can differ from the provider's billed bucket size. Reconcile with R2 metrics before uploading. Use Reports to change cases from open to reviewing to resolved. Record any removal decision in your rights register. The audit log records administrative mutations without recording passwords or tokens.

Use Site settings → brand to edit the JSON name. Content Manager can change title presentation, rights and publication state. Keep this role limited to trusted staff. Confirm all deletes. Database references block deletion of movies with registered assets or contracts. Removing a registration does not delete a storage object. Confirm backups, legal retention and absence of references before removing bucket objects manually.

