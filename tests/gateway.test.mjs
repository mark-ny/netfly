import test from "node:test";
import assert from "node:assert/strict";
import worker, { hashToken } from "../worker/index.js";
const origin = "https://cinema.test",
  token = "a".repeat(64),
  prefix = "11111111-1111-4111-8111-111111111111";
const env = {
  APP_ORIGIN: origin,
  SUPABASE_URL: "https://db.test",
  LIMITER: { limit: async () => ({ success: true }) },
  MEDIA: { get: async () => ({ body: "segment", size: 7 }) },
};
const req = (s, headers = {}) =>
  new Request("https://media.test" + s, {
    headers: { Origin: origin, ...headers },
  });
test("unauthorized objects and invalid media paths are rejected before bucket access", async () => {
  assert.equal(
    (await worker.fetch(req("/media/unscoped.ts"), env)).status,
    404,
  );
  assert.equal(
    (await worker.fetch(req("/media/" + token + "/private.json"), env)).status,
    404,
  );
  assert.equal(
    (
      await worker.fetch(
        req("/media/" + token + "/master.m3u8", {
          Origin: "https://other.test",
        }),
        env,
      )
    ).status,
    403,
  );
});
test("valid grants protect master, variant, captions and individual segments", async (t) => {
  let accepted = false;
  const seen = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.match(url, /rpc\/resolve_media$/);
    const b = JSON.parse(init.body);
    assert.equal(b.digest, await hashToken(token));
    return Response.json(accepted ? prefix : null);
  });
  const e = {
    ...env,
    MEDIA: {
      get: async (key) => {
        seen.push(key);
        return { body: "a", size: 1 };
      },
    },
  };
  for (const file of [
    "master.m3u8",
    "360p/index.m3u8",
    "360p/seg-00000.ts",
    "captions/en.vtt",
  ]) {
    accepted = false;
    const old = seen.length;
    let r = await worker.fetch(req("/media/" + token + "/" + file), e);
    assert.equal(r.status, 403);
    assert.equal(seen.length, old);
    accepted = true;
    r = await worker.fetch(req("/media/" + token + "/" + file), e);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("Cache-Control"), "private, no-store");
    assert.equal(seen.at(-1), prefix + "/" + file);
  }
});
test("authorization requires a verified user, and request limiting fails closed", async () => {
  const r = await worker.fetch(
    new Request("https://media.test/authorize", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: "{}",
    }),
    env,
  );
  assert.equal(r.status, 401);
  assert.equal(
    (
      await worker.fetch(req("/media/" + token + "/master.m3u8"), {
        ...env,
        LIMITER: null,
      })
    ).status,
    503,
  );
});
