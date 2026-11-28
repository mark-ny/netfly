import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
// Embedded PostgreSQL with the smallest Auth schema needed to exercise actual RLS.
const db = new PGlite();
const ids = Array.from(
  { length: 7 },
  (_, i) => "11111111-1111-4111-8111-" + String(i + 1).padStart(12, "0"),
);
const [viewer, other, manager, admin, owner, film, session] = ids;
let cases = 0;
async function check(name, fn) {
  await fn();
  console.log("PASS " + name);
  cases++;
}
async function role(name, id = "", aal = "aal1") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: id || null, aal }),
  ]);
  await db.exec("set role " + name);
}
async function count(sql) {
  return Number((await db.query(sql)).rows[0].n);
}
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users on delete cascade);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;`);
  for (const f of (await readdir("supabase/migrations"))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  await check("all public base tables have row security", async () =>
    assert.equal(
      await count(
        "select count(*) n from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity",
      ),
      0,
    ),
  );
  for (const id of ids.slice(0, 5))
    await db.query("insert into auth.users values ($1)", [id]);
  for (const [id, r] of [
    [manager, "content_manager"],
    [admin, "administrator"],
    [owner, "super_administrator"],
  ])
    await db.query("update roles set role=$1 where user_id=$2", [r, id]);
  await db.query("insert into auth.sessions values($1,$2)", [session, viewer]);
  await db.query(
    "insert into movies(id,title,slug,year,duration,poster,backdrop) values($1,'QA film','qa-film',2026,18,'/art/a.webp','/art/b.webp')",
    [film],
  );
  await role("anon");
  await check(
    "anonymous catalog hides drafts and private license terms",
    async () => {
      assert.equal(await count("select count(*) n from catalog"), 0);
      await assert.rejects(db.query("select * from content_licenses"));
    },
  );
  await role("authenticated", viewer);
  await check(
    "viewers cannot publish, assign roles, or issue grants",
    async () => {
      assert.equal(
        (await db.query("update movies set state='published' returning id"))
          .rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "update roles set role='super_administrator' returning user_id",
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        db.query("select start_playback($1,$2,$3,$4,$5)", [
          viewer,
          film,
          session,
          "x",
          "KE",
        ]),
      );
    },
  );
  await role("authenticated", manager);
  await check("staff need MFA", async () =>
    assert.equal(
      (await db.query("update movies set state='published' returning id")).rows
        .length,
      0,
    ),
  );
  await role("authenticated", manager, "aal2");
  await check(
    "content managers can edit and schedule titles but cannot manage users",
    async () => {
      await db.query(
        "update movies set state='published',release_at=now()+interval '1 day' where id=$1",
        [film],
      );
      assert.equal(
        (
          await db.query(
            "update roles set role='administrator' returning user_id",
          )
        ).rows.length,
        0,
      );
    },
  );
  await role("anon");
  await check("future releases stay hidden", async () =>
    assert.equal(await count("select count(*) n from catalog"), 0),
  );
  await role("authenticated", manager, "aal2");
  await db.query(
    "update movies set release_at=now()-interval '1 day' where id=$1",
    [film],
  );
  await db.query(
    "insert into video_assets(movie_id,prefix,bytes) values($1,$1,1000)",
    [film],
  );
  await db.query(
    "insert into content_licenses(movie_id,starts_at,ends_at,territories,reference) values($1,now()-interval '2 days',now()+interval '2 days','{KE}','QA')",
    [film],
  );
  await role("authenticated", viewer);
  await check(
    "owners can save a released film and keep a single rating",
    async () => {
      await db.query("insert into watchlists(user_id,movie_id) values($1,$2)", [
        viewer,
        film,
      ]);
      await db.query("insert into ratings values($1,$2,4)", [viewer, film]);
      await assert.rejects(
        db.query("insert into ratings values($1,$2,5)", [viewer, film]),
      );
      await db.query(
        "insert into watch_progress(user_id,movie_id,position) values($1,$2,7)",
        [viewer, film],
      );
    },
  );
  await role("authenticated", other);
  await check(
    "other viewers see no personal rows and cannot overwrite them",
    async () => {
      assert.equal(await count("select count(*) n from watchlists"), 0);
      assert.equal(await count("select count(*) n from watch_progress"), 0);
      await assert.rejects(
        db.query(
          "insert into watch_progress(user_id,movie_id,position) values($1,$2,10)",
          [viewer, film],
        ),
      );
      assert.equal(
        (await db.query("delete from ratings returning *")).rows.length,
        0,
      );
    },
  );
  await role("authenticated", admin, "aal2");
  await check(
    "administrators can read metrics and cannot grant privileges",
    async () => {
      const r = await db.query("select cinema_overview() stats");
      assert.equal(r.rows[0].stats["Registered users"], 5);
      assert.equal(
        (
          await db.query(
            "update roles set role='super_administrator' returning *",
          )
        ).rows.length,
        0,
      );
    },
  );
  await role("authenticated", owner, "aal2");
  await check(
    "MFA super administrators can grant roles with an audit trail",
    async () => {
      await db.query(
        "update roles set role='content_manager' where user_id=$1",
        [other],
      );
      assert.ok(
        (await count(
          "select count(*) n from admin_audit_logs where entity='roles' and action='UPDATE'",
        )) > 0,
      );
    },
  );
  await role("service_role");
  await check(
    "playback requires a live Auth session and permitted territory",
    async () => {
      await assert.rejects(
        db.query("select start_playback($1,$2,$3,$4,$5)", [
          viewer,
          film,
          viewer,
          "bad",
          "KE",
        ]),
      );
      await assert.rejects(
        db.query("select start_playback($1,$2,$3,$4,$5)", [
          viewer,
          film,
          session,
          "bad",
          "US",
        ]),
      );
    },
  );
  const play = (
    await db.query("select start_playback($1,$2,$3,$4,$5) play", [
      viewer,
      film,
      session,
      "known",
      "KE",
    ])
  ).rows[0].play;
  await check(
    "segment resolution and renewal enforce the session and country",
    async () => {
      assert.equal(
        (await db.query("select resolve_media('known','KE') p")).rows[0].p,
        film,
      );
      assert.equal(
        (await db.query("select resolve_media('known','US') p")).rows[0].p,
        null,
      );
      assert.equal(
        (
          await db.query(
            "select heartbeat($1,$2,$3,'KE',0,false,false,false) ok",
            [viewer, play, session],
          )
        ).rows[0].ok,
        true,
      );
    },
  );
  await db.query("update content_licenses set ends_at=now()-interval '1 hour'");
  await check(
    "license expiration immediately closes existing media grants",
    async () =>
      assert.equal(
        (await db.query("select resolve_media('known','KE') p")).rows[0].p,
        null,
      ),
  );
  await db.query("update content_licenses set ends_at=now()+interval '1 day'");
  await db.query(
    "update playback_sessions set expires_at=now()-interval '1 second'",
  );
  await check("expired grants cannot resolve or renew", async () => {
    assert.equal(
      (await db.query("select resolve_media('known','KE') p")).rows[0].p,
      null,
    );
    assert.equal(
      (
        await db.query(
          "select heartbeat($1,$2,$3,'KE',0,false,false,false) ok",
          [viewer, play, session],
        )
      ).rows[0].ok,
      false,
    );
  });
  await db.query("select maintain_cinema()");
  await check("maintenance aggregates actual sessions", async () =>
    assert.equal(await count("select sum(plays) n from analytics_daily"), 1),
  );
  // ---- 1.6.0: viewer profiles and series (written without a Postgres run; see TESTING.md) ----
  const [seriesId, epOne, epTwo] = [
    "22222222-2222-4222-8222-000000000001",
    "22222222-2222-4222-8222-000000000002",
    "22222222-2222-4222-8222-000000000003",
  ];
  await role("service_role");
  await check("every account has exactly one default profile", async () =>
    assert.equal(
      await count(
        "select count(*) n from viewer_profiles where is_default and account_id in (select id from auth.users)",
      ),
      5,
    ),
  );
  await role("authenticated", viewer);
  await check("a viewer reads only their own profiles", async () =>
    assert.equal(
      await count("select count(*) n from viewer_profiles where account_id<>auth.uid()"),
      0,
    ),
  );
  await check("profiles cannot be created as default or promoted", async () => {
    await assert.rejects(
      db.query("insert into viewer_profiles(account_id,name,is_default) values($1,'Sneaky',true)", [viewer]),
    );
    await assert.rejects(db.query("update viewer_profiles set is_default=true where not is_default"));
  });
  await check("a viewer cannot create a profile for another account", async () =>
    assert.rejects(db.query("insert into viewer_profiles(account_id,name) values($1,'Intruder')", [other])),
  );
  await check("the default profile cannot be deleted", async () => {
    await db.query("delete from viewer_profiles where is_default");
    assert.equal(await count("select count(*) n from viewer_profiles where is_default"), 1);
  });
  await check("an account is limited to five profiles", async () => {
    for (const n of ["Two", "Three", "Four", "Five"])
      await db.query("insert into viewer_profiles(account_id,name) values($1,$2)", [viewer, n]);
    await assert.rejects(db.query("insert into viewer_profiles(account_id,name) values($1,'Six')", [viewer]));
  });
  await check("profile names and colours are validated", async () => {
    await db.query("delete from viewer_profiles where name='Five'");
    await assert.rejects(db.query("insert into viewer_profiles(account_id,name) values($1,'   ')", [viewer]));
    await assert.rejects(db.query("insert into viewer_profiles(account_id,name,avatar) values($1,'Odd','javascript:x')", [viewer]));
  });
  await check("watch data is kept separately for each profile", async () => {
    const [a, b] = (await db.query("select id from viewer_profiles order by is_default desc, name")).rows.map((r) => r.id);
    await db.query("delete from watchlists");
    await db.query("insert into watchlists(user_id,profile_id,movie_id) values($1,$2,$3),($1,$4,$3)", [viewer, a, film, b]);
    assert.equal(await count("select count(*) n from watchlists"), 2);
    assert.equal(await count("select count(*) n from watchlists where profile_id='" + a + "'"), 1);
    await db.query("delete from viewer_profiles where id=$1", [b]);
    assert.equal(await count("select count(*) n from watchlists"), 1);
  });
  await check("rows cannot point at another account's profile", async () => {
    const theirs = (await (async () => { await role("service_role"); const r = await db.query("select id from viewer_profiles where account_id=$1", [other]); await role("authenticated", viewer); return r; })()).rows[0].id;
    await assert.rejects(
      db.query("insert into watch_progress(user_id,profile_id,movie_id,position) values($1,$2,$3,5)", [viewer, theirs, film]),
    );
  });
  await role("service_role");
  await db.query("insert into series(id,title,slug,year,poster,backdrop,state) values($1,'QA series','qa-series',2026,'/art/a.webp','/art/b.webp','draft')", [seriesId]);
  await db.query("insert into movies(id,title,slug,year,duration,poster,backdrop,state) values($1,'Pilot','qa-pilot',2026,20,'/art/a.webp','/art/b.webp','published'),($2,'Second','qa-second',2026,21,'/art/a.webp','/art/b.webp','published')", [epOne, epTwo]);
  await db.query("insert into episodes(movie_id,series_id,season,number) values($1,$3,1,1),($2,$3,1,2)", [epOne, epTwo, seriesId]);
  await check("a draft series and its episodes are hidden from the public", async () => {
    await role("anon");
    assert.equal(await count("select count(*) n from series"), 0);
    assert.equal(await count("select count(*) n from episodes"), 0);
  });
  await check("published series expose episodes through the catalog with their series", async () => {
    await role("service_role");
    await db.query("update series set state='published' where id=$1", [seriesId]);
    await role("anon");
    assert.equal(await count("select count(*) n from series"), 1);
    assert.equal(await count("select count(*) n from episodes"), 2);
    assert.equal(await count("select count(*) n from catalog where series_id is not null"), 2);
    assert.equal(await count("select count(*) n from catalog where series_id is null and slug in ('qa-pilot','qa-second')"), 0);
  });
  await check("episode numbers are unique within a season", async () => {
    await role("service_role");
    await assert.rejects(db.query("update episodes set number=1 where movie_id=$1", [epTwo]));
  });
  await check("only staff can change series and episodes", async () => {
    await role("authenticated", viewer);
    await assert.rejects(db.query("insert into series(title,slug,year,poster,backdrop) values('X','x',2026,'/art/a.webp','/art/b.webp')"));
    assert.equal((await db.query("update series set title='Hacked' returning id")).rows.length, 0);
    await role("authenticated", manager);
    assert.equal((await db.query("update series set title='QA series 2' returning id")).rows.length, 1);
  });
  await role("service_role");
  await check("intro markers must be ordered and are exposed by the catalog", async () => {
    await role("service_role");
    await assert.rejects(db.query("update movies set intro_start=30,intro_end=10 where id=$1", [epOne]));
    await db.query("update movies set intro_start=5,intro_end=45 where id=$1", [epOne]);
    assert.equal(await count("select count(*) n from catalog where intro_end=45"), 1);
  });
  await check("a kids profile cannot start playback of films rated above PG", async () => {
    await role("service_role");
    await db.query("delete from viewer_profiles where account_id=$1 and not is_default", [viewer]);
    const kid = (await db.query("insert into viewer_profiles(account_id,name,is_kids) values($1,'Kid',true) returning id", [viewer])).rows[0].id;
    await db.query("update movies set classification='16' where id=$1", [film]);
    await assert.rejects(db.query("select start_playback($1,$2,$3,$4,'KE',$5)", [viewer, film, session, "kids-digest-1", kid]));
    await db.query("update movies set classification='PG' where id=$1", [film]);
    await db.query("select start_playback($1,$2,$3,$4,'KE',$5)", [viewer, film, session, "kids-digest-2", kid]);
    await db.query("delete from playback_sessions where token_hash like 'kids-digest-%'");
  });
  console.log(cases + " database policy cases passed");
} finally {
  await db.close();
}
