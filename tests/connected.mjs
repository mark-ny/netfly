// Run against a fresh, isolated Docker network. Only loopback ports are published.
// Tests use the real GoTrue, PostgREST and PostgreSQL services. No hosted project is contacted.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import worker from "../worker/index.js";
const suffix = randomBytes(5).toString("hex"),
  network = "netfly-qa-" + suffix,
  containers = [],
  secret = randomBytes(40).toString("hex"),
  pw = randomBytes(22).toString("hex");
const servicePort = 4213,
  uiPort = 4214,
  base = "http://127.0.0.1:" + servicePort,
  app = "http://127.0.0.1:" + uiPort;
function docker(args, input) {
  return execFileSync("docker", args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
function start(label, image, env, port) {
  const name = label + "-" + suffix;
  containers.push(name);
  const vars = Object.entries(env).flatMap(([k, v]) => ["-e", k + "=" + v]);
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--network",
    network,
    "--network-alias",
    label,
    ...(port ? ["-p", "127.0.0.1::" + port] : []),
    ...vars,
    image,
  ]);
  return name;
}
function portOf(name, port) {
  return docker(["port", name, String(port) + "/tcp"])
    .split(":")
    .pop();
}
function jwt(role) {
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    p = Buffer.from(
      JSON.stringify({
        role,
        iss: "supabase",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
  return (
    h +
    "." +
    p +
    "." +
    createHmac("sha256", secret)
      .update(h + "." + p)
      .digest("base64url")
  );
}
const anon = jwt("anon"),
  service = jwt("service_role");
async function until(fn) {
  for (let i = 0; i < 60; i++) {
    try {
      if (await fn()) return;
    } catch {
      /* services are starting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Local test service did not become ready.");
}
let proxy, vite, browser, activePage;
try {
  docker(["network", "create", network]);
  const pg = start("db", "postgres:17-alpine", { POSTGRES_PASSWORD: pw });
  const sql = (input) =>
    docker(
      [
        "exec",
        "-i",
        pg,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-At",
      ],
      input,
    );
  await until(() =>
    docker(["exec", pg, "pg_isready", "-h", "127.0.0.1"]).includes(
      "accepting connections",
    ),
  );
  sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
grant usage on schema auth to anon,authenticated,service_role;`);
  const mail = start(
      "mail",
      "public.ecr.aws/supabase/mailpit:v1.22.3",
      {},
      8025,
    ),
    mailUrl = "http://127.0.0.1:" + portOf(mail, 8025);
  const auth = start(
    "auth",
    "public.ecr.aws/supabase/gotrue:v2.187.0",
    {
      GOTRUE_API_HOST: "0.0.0.0",
      GOTRUE_API_PORT: "9999",
      API_EXTERNAL_URL: base,
      GOTRUE_DB_DRIVER: "postgres",
      GOTRUE_DB_DATABASE_URL:
        "postgres://postgres:" + pw + "@db:5432/postgres?search_path=auth",
      GOTRUE_SITE_URL: app,
      GOTRUE_URI_ALLOW_LIST: app + "/**",
      GOTRUE_JWT_SECRET: secret,
      GOTRUE_JWT_AUD: "authenticated",
      GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
      GOTRUE_JWT_ADMIN_ROLES: "service_role",
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
      GOTRUE_MAILER_AUTOCONFIRM: "false",
      GOTRUE_SMTP_HOST: "mail",
      GOTRUE_SMTP_PORT: "1025",
      GOTRUE_SMTP_ADMIN_EMAIL: "cinema@example.test",
      GOTRUE_SMTP_SENDER_NAME: "Netfly",
      GOTRUE_SMTP_MAX_FREQUENCY: "1s",
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: "/auth/v1/verify",
      GOTRUE_MAILER_URLPATHS_RECOVERY: "/auth/v1/verify",
      GOTRUE_MFA_TOTP_ENROLL_ENABLED: "true",
      GOTRUE_MFA_TOTP_VERIFY_ENABLED: "true",
    },
    9999,
  );
  const authUrl = "http://127.0.0.1:" + portOf(auth, 9999);
  await until(async () => (await fetch(authUrl + "/health")).ok);
  for (const file of (await readdir("supabase/migrations")).sort())
    sql(await readFile("supabase/migrations/" + file, "utf8"));
  sql(await readFile("supabase/seed.sql", "utf8"));
  const rest = start(
      "rest",
      "public.ecr.aws/supabase/postgrest:v14.5",
      {
        PGRST_DB_URI: "postgres://postgres:" + pw + "@db:5432/postgres",
        PGRST_DB_ANON_ROLE: "anon",
        PGRST_DB_SCHEMAS: "public",
        PGRST_JWT_SECRET: secret,
      },
      3000,
    ),
    restUrl = "http://127.0.0.1:" + portOf(rest, 3000);
  await until(async () => (await fetch(restUrl + "/catalog")).ok);
  const bytes = await readFile("tests/fixtures/hls/the-last-light/master.m3u8"),
    film = "00000000-0000-4000-8000-000000000001";
  const env = {
    APP_ORIGIN: app,
    SUPABASE_URL: base,
    SUPABASE_SERVICE_ROLE_KEY: service,
    LIMITER: { limit: async () => ({ success: true }) },
    REPORT_LIMIT: { limit: async () => ({ success: true }) },
    MEDIA: {
      get: async (k) => {
        if (!k.startsWith(film + "/")) return null;
        try {
          const body = await readFile(
            "tests/fixtures/hls/the-last-light/" + k.slice(37),
          );
          return { body, size: body.length };
        } catch {
          return null;
        }
      },
    },
  };
  proxy = createServer(async (req, res) => {
    try {
      const u = new URL(req.url, base),
        headers = new Headers(req.headers);
      headers.delete("host");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const init = {
        method: req.method,
        headers,
        redirect: "manual",
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      };
      let r;
      if (
        u.pathname.startsWith("/auth/v1/") ||
        u.pathname.startsWith("/rest/v1/")
      ) {
        const a = u.pathname.startsWith("/auth/");
        r =
          req.method === "OPTIONS"
            ? new Response(null, { status: 204 })
            : await fetch(
                (a ? authUrl : restUrl) +
                  u.pathname.replace(/^\/(auth|rest)\/v1/, "") +
                  u.search,
                init,
              );
      } else {
        r = await worker.fetch(new Request(u, init), env);
      }
      res.statusCode = r.status;
      r.headers.forEach((v, k) => {
        if (
          ![
            "content-encoding",
            "content-length",
            "transfer-encoding",
            "connection",
          ].includes(k)
        )
          res.setHeader(k, v);
      });
      res.setHeader("Access-Control-Allow-Origin", app);
      res.setHeader(
        "Access-Control-Allow-Headers",
        "authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile,x-supabase-api-version",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
      );
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch {
      res.writeHead(503);
      res.end();
    }
  });
  await new Promise((r) => proxy.listen(servicePort, "127.0.0.1", r));
  vite = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(uiPort),
      "--strictPort",
    ],
    {
      env: {
        ...process.env,
        VITE_SUPABASE_URL: base,
        VITE_SUPABASE_PUBLISHABLE_KEY: anon,
        VITE_PLAYBACK_ORIGIN: base,
      },
      stdio: "ignore",
    },
  );
  await until(async () => (await fetch(app)).ok);
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  activePage = page;
  page.setDefaultTimeout(12000);
  const email = "viewer-" + suffix + "@example.test",
    password = randomBytes(16).toString("hex");
  async function nextMail(type) {
    let link;
    await until(async () => {
      const msgs = await (await fetch(mailUrl + "/api/v1/messages")).json();
      for (const item of msgs.messages || []) {
        const msg = await (
          await fetch(mailUrl + "/api/v1/message/" + item.ID)
        ).json();
        const links =
          (msg.HTML || msg.Text || "")
            .replaceAll("&amp;", "&")
            .match(/https?:\/\/[^\s"<]+/g) || [];
        link = links.find((x) => x.includes("type=" + type));
        if (link) return true;
      }
      return false;
    });
    return link;
  }
  await page.goto(app + "/signup");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText(/Check your email to verify/).waitFor();
  await page.goto(await nextMail("signup"));
  await page.waitForURL((u) => u.pathname === "/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  console.log("PASS registration and email verification");
  await page.goto(app + "/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/profile");
  console.log("PASS real password login");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto(app + "/recover");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.goto(await nextMail("recovery"));
  await page.getByLabel("New password").fill(password + "a");
  await page.getByRole("button", { name: "Save password" }).click();
  await page.waitForURL((u) => u.pathname === "/profile");
  console.log("PASS recovery mail and password replacement");
  const client = createClient(base, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({
    email,
    password: password + "a",
  });
  assert.ok(login.data.session);
  const user = login.data.user.id;
  sql(
    "update public.roles set role='super_administrator' where user_id='" +
      user +
      "';",
  );
  const factor = await client.auth.mfa.enroll({ factorType: "totp" });
  assert.ifError(factor.error);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
    bits = Array.from(factor.data.totp.secret.replace(/=+$/, ""))
      .map((c) => chars.indexOf(c).toString(2).padStart(5, "0"))
      .join("");
  const key = Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2))),
    counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac("sha1", key).update(counter).digest(),
    otp = ((mac.readUInt32BE(mac[19] & 15) & 0x7fffffff) % 1000000)
      .toString()
      .padStart(6, "0");
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: factor.data.id,
    code: otp,
  });
  assert.ifError(verified.error);
  const add = await client
    .from("movies")
    .insert({
      title: "Fixture",
      slug: "fixture",
      year: 2026,
      duration: 18,
      poster: "/art/fixture.webp",
      backdrop: "/art/fixture.webp",
    })
    .select()
    .single();
  assert.ifError(add.error);
  assert.ifError(
    (
      await client
        .from("movies")
        .update({ title: "Updated fixture" })
        .eq("id", add.data.id)
    ).error,
  );
  assert.ifError(
    (await client.from("movies").delete().eq("id", add.data.id)).error,
  );
  console.log("PASS verified MFA and staff CRUD through PostgREST");
  for (const result of [
    await client.from("video_assets").insert({
      movie_id: film,
      prefix: film,
      bytes: bytes.length,
      qualities: [360, 480],
    }),
    await client.from("content_licenses").insert({
      movie_id: film,
      reference: "Local test",
      territories: ["*"],
      starts_at: "2020-01-01",
      ends_at: "2100-01-01",
    }),
    await client.from("movies").update({ state: "published" }).eq("id", film),
  ])
    assert.ifError(result.error);
  // Enrolling MFA revokes other sessions. Establish a fresh viewer session.
  await page.goto(app + "/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password + "a");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/profile");
  await page.goto(app + "/watch/the-last-light");
  await page.getByRole("button", { name: "Play Video", exact: true }).click();
  await until(() => page.locator("video").evaluate((v) => v.currentTime > 0));
  console.log("PASS authenticated HLS playback through Worker and database");
  await page.goto(app + "/movie/the-last-light");
  await page.locator(".detail .ghost").first().click();
  await page.getByText("Added to My List").waitFor();
  await page.goto(app + "/watchlist");
  await page
    .locator(".cardtitle")
    .filter({ hasText: "The Last Light" })
    .waitFor();
  console.log("PASS cloud-backed watchlist");
  const staff = await browser.newPage();
  const access = (await client.auth.getSession()).data.session;
  await staff.addInitScript(
    ({ session, origin }) => {
      if (location.origin === origin)
        localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
    },
    { session: access, origin: app },
  );
  await staff.goto(app + "/admin");
  await staff
    .getByRole("button", { name: "Genres", exact: true })
    .last()
    .click();
  await staff.getByRole("button", { name: "Add record" }).click();
  await staff.getByLabel("name", { exact: true }).fill("Test collection genre");
  await staff.getByRole("button", { name: "Save record" }).click();
  const row = staff
    .getByRole("row")
    .filter({ hasText: "Test collection genre" });
  await row.getByRole("button", { name: "Edit" }).click();
  await staff.getByLabel("name", { exact: true }).fill("Updated test genre");
  await staff.getByRole("button", { name: "Save record" }).click();
  await staff
    .getByRole("row")
    .filter({ hasText: "Updated test genre" })
    .getByRole("button", { name: "Delete" })
    .click();
  await staff.getByRole("button", { name: "Delete permanently" }).click();
  await until(
    async () =>
      !(
        await client
          .from("genres")
          .select("name")
          .eq("name", "Updated test genre")
      ).data?.length,
  );
  console.log("PASS staff dashboard create, edit and confirmed deletion");
  await staff.close();
  await page.goto(app + "/account/settings");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data" }).click();
  const exported = JSON.parse(
    await readFile(await (await downloaded).path(), "utf8"),
  );
  assert.equal(exported.account.email, email);
  assert.ok(exported.watchlists.some((x) => x.movie_id === film));
  sql("update public.roles set role='viewer' where user_id='" + user + "';");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByLabel(/Type DELETE/).fill("DELETE");
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  assert.equal(
    sql("select count(*) from auth.users where id='" + user + "'"),
    "0",
  );
  console.log("PASS data export and confirmed account deletion");
} catch (e) {
  if (activePage) {
    const diagnostic = await activePage.evaluate(() => ({
      path: location.pathname,
      authError: new URLSearchParams(location.hash.slice(1)).get(
        "error_description",
      ),
      messages: Array.from(document.querySelectorAll(".msg")).map(
        (x) => x.textContent,
      ),
      headings: Array.from(document.querySelectorAll("h1")).map(
        (x) => x.textContent,
      ),
      buttons: Array.from(document.querySelectorAll("main button,main a"))
        .slice(0, 10)
        .map((x) => x.textContent),
    }));
    console.error(diagnostic);
  }
  throw e;
} finally {
  await browser?.close();
  vite?.kill();
  proxy?.closeAllConnections();
  proxy?.close();
  for (const name of containers.reverse())
    try {
      docker(["rm", "-fv", name]);
    } catch {
      /* already stopped */
    }
  try {
    docker(["network", "rm", network]);
  } catch {
    /* already removed */
  }
}
