const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const mediaFile =
  /^(?:master\.m3u8|(?:360|480|720|1080)p\/(?:index\.m3u8|seg-[0-9]{5,6}\.ts)|captions\/[a-z]{2,3}(?:-[A-Z]{2})?\.vtt)$/;
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function deny(status, message) {
  throw new HttpError(status, message);
}
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
export async function hashToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
const serviceHeaders = (e) => ({
  apikey: e.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + e.SUPABASE_SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
});
async function rest(e, path, init = {}) {
  const r = await fetch(e.SUPABASE_URL + path, {
    ...init,
    headers: { ...serviceHeaders(e), ...init.headers },
  });
  if (!r.ok)
    deny(
      r.status >= 500 ? 503 : 403,
      "The service could not authorize this request.",
    );
  return r.status === 204 ? null : r.json();
}
const rpc = (e, name, args) =>
  rest(e, "/rest/v1/rpc/" + name, {
    method: "POST",
    body: JSON.stringify(args),
  });
async function identity(req, e) {
  const header = req.headers.get("Authorization") || "";
  if (!/^Bearer [^ ]+$/.test(header)) deny(401, "Please sign in.");
  const r = await fetch(e.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: e.SUPABASE_SERVICE_ROLE_KEY, Authorization: header },
  });
  if (!r.ok) deny(401, "Your session expired. Sign in again.");
  const user = await r.json();
  let claims;
  try {
    claims = JSON.parse(
      atob(header.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
  } catch {
    deny(401, "Invalid session.");
  }
  if (!uuid.test(claims.session_id) || claims.sub !== user.id)
    deny(401, "Invalid session.");
  return { user, session: claims.session_id };
}
async function body(req) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    deny(415, "Send JSON.");
  if (Number(req.headers.get("content-length") || 0) > 8192)
    deny(413, "Request too large.");
  const reader = req.body?.getReader();
  if (!reader) deny(400, "Missing body.");
  let size = 0;
  const chunks = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader.cancel();
      deny(413, "Request too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(await new Blob(chunks).text());
  } catch {
    deny(400, "Invalid JSON.");
  }
}
export async function handle(req, e) {
  const u = new URL(req.url),
    origin = req.headers.get("Origin"),
    allowed = e.APP_ORIGIN,
    country = req.cf?.country || "XX";
  if (!allowed || (origin && origin !== allowed)) deny(403, "Origin denied.");
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (u.pathname === "/health" && req.method === "GET")
    return json({ status: "ok" });
  if (!e.LIMITER) deny(503, "Request limits are not configured.");
  const media = u.pathname.startsWith("/media/");
  const limit = await e.LIMITER.limit({
    key:
      (media ? "media:" : "api:") +
      (req.headers.get("CF-Connecting-IP") || "local"),
  });
  if (!limit.success) deny(429, "Too many requests. Try again shortly.");
  if (media && ["GET", "HEAD"].includes(req.method)) {
    const match = u.pathname.match(/^\/media\/([a-f0-9]{64})\/(.+)$/);
    if (!match || !mediaFile.test(match[2])) deny(404, "Media not found.");
    const prefix = await rpc(e, "resolve_media", {
      digest: await hashToken(match[1]),
      country_code: country,
    });
    if (!prefix || !uuid.test(prefix))
      deny(403, "Playback access expired or unavailable here.");
    const obj = await (req.method === "HEAD"
      ? e.MEDIA.head(prefix + "/" + match[2])
      : e.MEDIA.get(prefix + "/" + match[2]));
    if (!obj) deny(404, "Media not found.");
    const type = match[2].endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : match[2].endsWith(".vtt")
        ? "text/vtt; charset=utf-8"
        : "video/mp2t";
    return new Response(req.method === "HEAD" ? null : obj.body, {
      headers: { "Content-Type": type, "Content-Length": String(obj.size) },
    });
  }
  if (req.method !== "POST" || origin !== allowed)
    deny(403, "Invalid request.");
  const b = await body(req);
  if (u.pathname === "/contact") {
    if (
      !["support", "privacy", "copyright", "playback"].includes(b.kind) ||
      typeof b.message !== "string" ||
      b.message.length < 5 ||
      b.message.length > 3000 ||
      (b.movie_id && !uuid.test(b.movie_id)) ||
      typeof b.email !== "string" ||
      b.email.length > 254 ||
      (b.kind === "copyright" && !b.email)
    )
      deny(400, "Invalid report.");
    const allowedReport = await e.REPORT_LIMIT?.limit({
      key: req.headers.get("CF-Connecting-IP") || "local",
    });
    if (!allowedReport?.success)
      deny(429, "Report limit reached. Try again later.");
    await rest(e, "/rest/v1/user_reports", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        kind: b.kind,
        message: b.message,
        contact_email: b.email || null,
        movie_id: b.movie_id || null,
      }),
    });
    return json({ ok: true }, 201);
  }
  const { user, session } = await identity(req, e);
  if (u.pathname === "/authorize") {
    if (!uuid.test(b.movie_id)) deny(400, "Invalid film.");
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    const id = await rpc(e, "start_playback", {
      viewer: user.id,
      film: b.movie_id,
      session_key: session,
      digest: await hashToken(token),
      country_code: country,
    });
    const base = u.origin + "/media/" + token + "/";
    const [subs, assets] = await Promise.all([
      rest(
        e,
        "/rest/v1/subtitle_tracks?select=label,language,path&movie_id=eq." +
          b.movie_id,
      ),
      rest(
        e,
        "/rest/v1/video_assets?select=qualities&movie_id=eq." + b.movie_id,
      ),
    ]);
    return json({
      id,
      url: base + "master.m3u8",
      qualities: assets[0].qualities,
      tracks: subs.map((s) => ({ ...s, url: base + s.path })),
      renew_after: 45,
    });
  }
  if (u.pathname === "/heartbeat") {
    if (!uuid.test(b.id)) deny(400, "Invalid playback session.");
    const valid = await rpc(e, "heartbeat", {
      viewer: user.id,
      play_id: b.id,
      session_key: session,
      country_code: country,
      watched: Math.min(60, Math.max(0, Math.floor(Number(b.watched) || 0))),
      finished: b.finished === true,
      failed_play: b.failed === true,
      closing: b.closing === true,
    });
    if (!valid) deny(403, "Playback expired. Reopen the film.");
    return json({ ok: true });
  }
  if (u.pathname === "/account/export") {
    const data = {
      account: { id: user.id, email: user.email, created_at: user.created_at },
    };
    for (const [t, fields] of Object.entries({
      profiles: "*",
      roles: "role",
      watchlists: "*",
      watch_progress: "*",
      ratings: "*",
      user_reports: "*",
      playback_sessions:
        "movie_id,created_at,seen_at,watch_seconds,completed,failed",
    })) {
      data[t] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await rest(
          e,
          "/rest/v1/" +
            t +
            "?user_id=eq." +
            user.id +
            "&select=" +
            fields +
            "&limit=500&offset=" +
            offset +
            "&order=" +
            (t === "playback_sessions" || t === "user_reports"
              ? "id"
              : t === "watchlists" || t === "ratings" || t === "watch_progress"
                ? "movie_id"
                : "user_id"),
        );
        data[t].push(...page);
        if (page.length < 500) break;
      }
    }
    // Viewer profiles (1.6.0). Older databases without the table still export everything else.
    data.viewer_profiles = await rest(
      e,
      "/rest/v1/viewer_profiles?account_id=eq." +
        user.id +
        "&select=id,name,avatar,is_default,created_at&order=created_at",
    ).catch(() => []);
    return json(data);
  }
  if (u.pathname === "/account/delete") {
    if (b.confirmation !== "DELETE") deny(400, "Enter DELETE to confirm.");
    const rr = await rest(
      e,
      "/rest/v1/roles?select=role&user_id=eq." + user.id,
    );
    if (rr[0]?.role === "super_administrator")
      deny(409, "Transfer owner permissions before deleting this account.");
    await rest(e, "/auth/v1/admin/users/" + user.id, { method: "DELETE" });
    return json({ ok: true });
  }
  deny(404, "Route not found.");
}
export default {
  async fetch(req, e) {
    let r;
    try {
      r = await handle(req, e);
    } catch (err) {
      r = json(
        {
          error:
            err instanceof HttpError
              ? err.message
              : "The service is temporarily unavailable.",
        },
        err instanceof HttpError ? err.status : 503,
      );
    }
    const out = new Response(r.body, r);
    for (const [key, value] of Object.entries({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    }))
      out.headers.set(key, value);
    if (req.headers.get("Origin") === e.APP_ORIGIN) {
      out.headers.set("Access-Control-Allow-Origin", e.APP_ORIGIN);
      out.headers.set(
        "Access-Control-Allow-Methods",
        "GET, HEAD, POST, OPTIONS",
      );
      out.headers.set(
        "Access-Control-Allow-Headers",
        "authorization,content-type",
      );
    }
    return out;
  },
  async scheduled(_event, e, ctx) {
    ctx.waitUntil(rpc(e, "maintain_cinema", {}));
  },
};
