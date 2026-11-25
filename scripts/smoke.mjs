import assert from "node:assert/strict";
const [app, media] = process.argv.slice(2);
if (!app)
  throw Error(
    "Usage: node scripts/smoke.mjs https://your-app [https://your-playback-service]",
  );
for (const path of [
  "/",
  "/movies",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/offline.html",
]) {
  const r = await fetch(new URL(path, app));
  assert.equal(r.status, 200, path);
  if (path === "/manifest.webmanifest")
    assert.equal((await r.json()).display, "standalone");
  else if (path === "/") assert.ok((await r.text()).includes('id="root"'));
  console.log("PASS " + path);
}
if (media) {
  let r = await fetch(new URL("/health", media));
  assert.equal((await r.json()).status, "ok");
  r = await fetch(new URL("/authorize", media), {
    method: "POST",
    headers: {
      Origin: new URL(app).origin,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 401);
  console.log("PASS gateway health and anonymous denial");
}
