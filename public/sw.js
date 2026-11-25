const NAME = "stillframe-static-v1";
self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(NAME).then((c) => c.add("/offline.html"))),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("stillframe-static-") && k !== NAME)
            .map((k) => caches.delete(k)),
        ),
      ),
  ),
);
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/offline.html")));
    return;
  }
  if (!/^\/assets\/[\w.-]+\.(js|css|woff2)$/.test(u.pathname)) return;
  e.respondWith(
    caches.open(NAME).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) await c.put(e.request, r.clone());
      return r;
    }),
  );
});
