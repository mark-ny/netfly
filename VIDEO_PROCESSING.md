# Media processing

Use Python 3.10+, FFmpeg and FFprobe with libx264, AAC and WebP support on a local workstation. Keep source masters and their license records in a separate, backed-up archive. The included demonstration consists of eight 18-second motion studies with original synthesized audio. Photography attribution and license links are in public/art/CREDITS.md.

## 1. Plan an encode

```bash
python3 tools/ingest.py plan --minutes 90 --count 20 --renditions 360,480,720 --viewer-hours 100
python3 tools/ingest.py plan --source "/media/approved-film.mp4" --renditions 360,480 --used-gb 2.1 --limit-gb 10
```

All sizes use decimal GB. The model sums video and 96 kbit/s AAC per rendition, allows 5% container overhead and adds 2 MB per film for small ancillary files. Source complexity, keyframes, VBR output and duration affect actual size. The CLI prints threshold crossings at 70%, 85% and 95% (override with `--warn-at 65,80,90`), estimated R2 requests and R2 Standard storage/operation charges, delivery volume, Worker requests, progress writes and peak-hour scenarios. The Worker model allows three startup requests and 80 heartbeat renewals per viewer-hour, plus one segment request per segment interval. Separate subtitle reads, application requests, and retries add traffic. Worker overages, taxes and Supabase costs are outside the R2 estimate. For this model, 20 × 90-minute films at 360p/480p/720p consume about 57.99 GB. The lowest rendition alone needs around 9.91 GB. Keep room for other objects and monthly usage from other applications.

## 2. Encode

```bash
python3 tools/ingest.py encode "/media/approved-film.mp4" --out encoded --renditions 360,480,720 --segment 6 --caption en=english.vtt --used-gb 2.1
```

Select only heights at or below the source. MP4, M4V, MOV, MKV and WebM inputs are supported. The first motion-video stream and first audio stream are selected; silent sources receive a silent AAC track. Frames are normalized to 24 fps for aligned keyframes. Audio is encoded independently in each rendition. Inspect the result for films with variable frame rates, unusual aspect ratios, multiple audio tracks or HDR masters before registering it. Set `--renditions 360,480,720,1080` to opt into 1080p. Repeat `--caption` with additional BCP-47 language/region tags such as `sw` or `en-GB`.

Progress appears on stdout per rendition. The encoder writes to its own temporary directory and moves the complete result into `encoded/<UUID>/`. Each encode gets a new UUID. A failed encode can be restarted with the same command. Only the active process's own temporary encode directory is removed automatically on a normal failure. Preserve the completed local copy for retries. The encoder produces relative HLS playlists, aligned H.264/AAC MPEG-TS segments, optional WebVTT tracks, a WebP thumbnail and a local SHA-256/MD5 inventory in `asset.json`. Hard termination may leave a `.encode-*` directory for an operator to inspect.

## 3. Validate and upload

```bash
python3 tools/ingest.py upload encoded/<UUID> --used-gb 2.1 --limit-gb 10
```

Replace `<UUID>` with the directory name printed by the encoder. For an upload, read the current usage in the Cloudflare dashboard and pass it explicitly with `--used-gb`. Measurement lag, concurrent jobs and unrelated usage can change remaining allowance. Coordinate uploads through one operator or job queue. The locally configured budget checks estimates and actual encoded bytes. It does not impose a provider-wide spending cap.

Only after private R2 is provisioned and approved, install the upload dependency and supply the bucket-scoped credentials through your local secret manager:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r tools/requirements.txt
python tools/ingest.py upload encoded/<UUID> --used-gb 2.1 --limit-gb 10 --apply
```

Set `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in the upload process environment. Disable public bucket access, including the development subdomain. Keep these credentials off the client. Each object uses an immutable UUID prefix, conditional single-part PUT, Content-MD5, stored SHA-256 metadata and a HEAD comparison of the returned ETag, size and metadata. Uploads submit segments first, variant playlists next and the master last. A conflict stops the job. Retrying the same command verifies existing identical objects and resumes missing ones. The local `upload-status.json` records state and verified count. A connection or authentication failure may require re-running the upload after resolving its cause.

## 4. Register and preview

Use the admin media registration interface to associate `video_assets.prefix` with the verified UUID. The entry point is `master.m3u8`; registered caption locations are relative, e.g. `captions/en.vtt`. Grant a catalog publication window, territory rights and license expiration from the actual contract. Preview a signed playback session and both rendition and subtitle selection before publication. Keep any replacement under a new prefix. Repoint the movie only after verification. Retire old files manually after checking references, retention and backup status.

The shipped samples use shorter six-second segments so each gives the player three segments at each demo resolution. Their MP4 previews last six seconds. No third-party movie or music is included in them.
