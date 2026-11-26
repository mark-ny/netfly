import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { useApp } from "./state";
import { db } from "./api";
import { demoMode } from "./catalog";
import { Mfa } from "./Accounts";
type Row = Record<string, any>;
type Resource = {
  label: string;
  table: string;
  keys: string[];
  fields: Row;
  level: number;
  read?: boolean;
  editOnly?: boolean;
};
const resources: Resource[] = [
  {
    label: "Films",
    table: "movies",
    keys: ["id"],
    level: 1,
    fields: {
      title: "",
      slug: "",
      synopsis: "",
      year: 2026,
      duration: 18,
      director: "",
      language: "No dialogue",
      country: "",
      classification: "Unrated",
      poster: "",
      backdrop: "",
      trailer: "",
      state: "draft",
      release_at: "",
      featured: false,
    },
  },
  {
    label: "Series",
    table: "series",
    keys: ["id"],
    level: 1,
    fields: {
      title: "",
      slug: "",
      synopsis: "",
      year: 2026,
      language: "No dialogue",
      country: "",
      classification: "Unrated",
      poster: "",
      backdrop: "",
      state: "draft",
      release_at: "",
      featured: false,
    },
  },
  {
    label: "Episodes",
    table: "episodes",
    keys: ["movie_id"],
    level: 1,
    fields: { movie_id: "", series_id: "", season: 1, number: 1 },
  },
  {
    label: "Media assets",
    table: "video_assets",
    keys: ["movie_id"],
    level: 1,
    fields: { movie_id: "", prefix: "", bytes: 0, qualities: [360, 480, 720] },
  },
  {
    label: "Subtitles",
    table: "subtitle_tracks",
    keys: ["id"],
    level: 1,
    fields: {
      movie_id: "",
      label: "English",
      language: "en",
      path: "captions/en.vtt",
    },
  },
  {
    label: "Licenses",
    table: "content_licenses",
    keys: ["id"],
    level: 1,
    fields: {
      movie_id: "",
      reference: "",
      starts_at: "",
      ends_at: "",
      territories: ["KE"],
    },
  },
  {
    label: "Genres",
    table: "genres",
    keys: ["id"],
    level: 1,
    fields: { name: "" },
  },
  {
    label: "Film genres",
    table: "movie_genres",
    keys: ["movie_id", "genre_id"],
    level: 1,
    fields: { movie_id: "", genre_id: "" },
  },
  {
    label: "Cast",
    table: "cast_members",
    keys: ["id"],
    level: 1,
    fields: { name: "" },
  },
  {
    label: "Film cast",
    table: "movie_cast",
    keys: ["movie_id", "cast_id"],
    level: 1,
    fields: { movie_id: "", cast_id: "" },
  },
  {
    label: "Collections",
    table: "collections",
    keys: ["id"],
    level: 1,
    fields: { name: "", sort_order: 0 },
  },
  {
    label: "Collection films",
    table: "collection_movies",
    keys: ["movie_id", "collection_id"],
    level: 1,
    fields: { movie_id: "", collection_id: "", sort_order: 0 },
  },
  {
    label: "Users",
    table: "profiles",
    keys: ["user_id"],
    level: 2,
    read: true,
    fields: { user_id: "", display_name: "" },
  },
  {
    label: "Permissions",
    table: "roles",
    keys: ["user_id"],
    level: 3,
    editOnly: true,
    fields: { user_id: "", role: "viewer" },
  },
  {
    label: "Reports",
    table: "user_reports",
    keys: ["id"],
    level: 2,
    editOnly: true,
    fields: { status: "open" },
  },
  {
    label: "Site settings",
    table: "site_settings",
    keys: ["key"],
    level: 2,
    fields: { key: "", value: {} },
  },
  {
    label: "Audit log",
    table: "admin_audit_logs",
    keys: ["id"],
    level: 2,
    read: true,
    fields: {},
  },
];
const labels: Record<string, string> = {
  duration: "Duration (seconds)",
  bytes: "Verified encoded size (bytes)",
  prefix: "Private R2 asset UUID",
  poster: "Poster image URL",
  backdrop: "Landscape backdrop URL",
  trailer: "Public preview URL",
  release_at: "Release time (UTC)",
  starts_at: "Rights start (UTC)",
  ends_at: "Rights end (UTC)",
  reference: "License agreement reference",
  territories: "Territory codes (comma separated)",
  qualities: "Quality heights (comma separated)",
  value: "Setting value (JSON)",
  featured: "Feature on home",
  season: "Season number",
  number: "Episode number",
  series_id: "Series",
};
const enums: Record<string, string[]> = {
  role: ["viewer", "content_manager", "administrator", "super_administrator"],
  state: ["draft", "published", "archived"],
  status: ["open", "reviewing", "resolved"],
};
const refs: Record<string, [string, string]> = {
  movie_id: ["movies", "title"],
  series_id: ["series", "title"],
  genre_id: ["genres", "name"],
  cast_id: ["cast_members", "name"],
  collection_id: ["collections", "name"],
};
const textValue = (v: any) =>
  Array.isArray(v)
    ? v.join(", ")
    : v && typeof v === "object"
      ? JSON.stringify(v, null, 2)
      : String(v ?? "");
export default function Admin() {
  const { session, role, refresh } = useApp(),
    level = [
      "viewer",
      "content_manager",
      "administrator",
      "super_administrator",
    ].indexOf(role),
    [tab, setTab] = useState("overview"),
    [rows, setRows] = useState<Row[]>([]),
    [stats, setStats] = useState<Row>({}),
    [draft, edit] = useState<Row | null>(null),
    [original, setOriginal] = useState<Row | null>(null),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState<Row | null>(null),
    [find, setFind] = useState(""),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [verified, setVerified] = useState(false),
    [reload, setReload] = useState(0),
    [choices, setChoices] = useState<Record<string, Row[]>>({}),
    [total, setTotal] = useState(0),
    [quota, setQuota] = useState({ storageGB: 10, thresholds: [70, 85, 95] });
  const resource = resources.find((r) => r.table === tab);
  useEffect(() => {
    if (!db || !session) return;
    db.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then((r) => setVerified(r.data?.currentLevel === "aal2"));
  }, [session, reload]);
  useEffect(() => {
    if (!verified || !level || !db) return;
    let live = true;
    setMessage("");
    setRows([]);
    edit(null);
    setOriginal(null);
    setBusy(true);
    async function load() {
      if (!resource) {
        if (level >= 2) {
          const r = await db!.rpc("cinema_overview");
          if (r.error) throw r.error;
          if (live) setStats(r.data);
          const q = await db!
            .from("site_settings")
            .select("value")
            .eq("key", "quotas")
            .maybeSingle();
          if (
            live &&
            q.data &&
            q.data.value?.storageGB > 0 &&
            Array.isArray(q.data.value.thresholds)
          )
            setQuota(q.data.value);
        }
        return;
      }
      const r = await db!
        .from(resource.table)
        .select("*", { count: "exact" })
        .order(
          resource.table === "admin_audit_logs" ||
            resource.table === "user_reports"
            ? "created_at"
            : resource.keys[0],
          {
            ascending: !["admin_audit_logs", "user_reports"].includes(
              resource.table,
            ),
          },
        )
        .range(page * 25, page * 25 + 24);
      if (r.error) throw r.error;
      if (live) {
        setRows(r.data);
        setTotal(r.count || 0);
      }
      const values: Record<string, Row[]> = {};
      for (const field of Object.keys(resource.fields)) {
        if (!(field in refs)) continue;
        const [t, col] = refs[field],
          q = await db!
            .from(t)
            .select("id," + col)
            .order(col)
            .limit(1000);
        if (q.error) throw q.error;
        values[field] = q.data as unknown as Row[];
      }
      if (live) setChoices(values);
    }
    load()
      .catch((e) => live && setMessage(e.message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [tab, page, verified, level, reload, resource]);
  if (demoMode || !session || level < 1)
    return (
      <div className="formpage">
        <h1>Administration</h1>
        <p>
          {demoMode
            ? "Administration requires the connected Supabase application and a provisioned staff account."
            : "Sign in with a provisioned staff account to manage the catalog."}
        </p>
        <Link className="ghost mt-5" to={demoMode ? "/" : "/login"}>
          {demoMode ? "Back to home" : "Sign in"}
        </Link>
      </div>
    );
  if (!verified)
    return (
      <div className="formpage">
        <h1>Verify staff access</h1>
        <Mfa />
        <button className="primary" onClick={() => setReload((x) => x + 1)}>
          Continue to dashboard
        </button>
      </div>
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft || !resource || !db) return;
    setBusy(true);
    setMessage("");
    try {
      const values: Row = {};
      for (const [k, base] of Object.entries(resource.fields)) {
        let val = draft[k];
        if (Array.isArray(base)) {
          val = String(val)
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          if (k === "qualities") val = val.map(Number);
        } else if (base && typeof base === "object") {
          val = JSON.parse(val);
        } else if (typeof base === "number") val = Number(val);
        else if (k.endsWith("_at"))
          val = new Date(String(val).replace(/Z?$/, "Z")).toISOString();
        values[k] = val;
      }
      const match = Object.fromEntries(
        resource.keys.map((k) => [k, original?.[k]]),
      );
      if (original) resource.keys.forEach((k) => delete values[k]);
      const r = original
        ? await db.from(tab).update(values).match(match).select()
        : await db.from(tab).insert(values).select();
      if (r.error || !r.data?.length)
        throw Error(
          r.error?.message || "Update denied. Verify your permissions.",
        );
      setReload((x) => x + 1);
      void refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(row: Row | null) {
    if (!resource) return;
    setOriginal(row);
    edit(
      Object.fromEntries(
        Object.entries(resource.fields).map(([k, v]) => {
          const value = row?.[k] ?? v;
          return [
            k,
            k.endsWith("_at")
              ? (value ? new Date(value) : new Date())
                  .toISOString()
                  .slice(0, 16)
              : typeof v === "boolean"
                ? value
                : textValue(value),
          ];
        }),
      ),
    );
  }
  function remove(row: Row) {
    setPending(row);
  }
  async function confirmRemove() {
    const row = pending;
    setPending(null);
    if (!resource || !row) return;
    const r = await db!
      .from(tab)
      .delete()
      .match(Object.fromEntries(resource.keys.map((k) => [k, row[k]])))
      .select();
    if (r.error || !r.data?.length)
      setMessage(r.error?.message || "Deletion denied.");
    else {
      setReload((x) => x + 1);
      void refresh();
    }
  }
  async function importInventory(files: FileList | null) {
    if (!files?.length) return;
    try {
      let meta: Row | null = null,
        status: Row | null = null;
      for (const f of Array.from(files)) {
        if (f.size > 16_000_000) throw Error("Inventory exceeds 16 MB.");
        const value = JSON.parse(await f.text());
        if (f.name === "asset.json") meta = value;
        if (f.name === "upload-status.json") status = value;
      }
      if (!meta || !status || meta.asset_id !== status.asset_id)
        throw Error(
          "Choose asset.json and upload-status.json from the same encoder output.",
        );
      if (status.status !== "ready" || status.verified !== status.total)
        throw Error(
          "Upload " +
            status.status +
            ": " +
            status.verified +
            " of " +
            status.total +
            " objects verified. Retry the CLI upload and reload these files.",
        );
      const objects = Object.values(meta.files) as Row[];
      if (
        objects.length !== status.total ||
        !objects.every((v) => Number.isSafeInteger(v.bytes) && v.bytes > 0) ||
        !Array.isArray(meta.renditions)
      )
        throw Error("Invalid upload inventory.");
      setOriginal(null);
      edit({
        movie_id: "",
        prefix: meta.asset_id,
        bytes: objects.reduce((n, v) => n + v.bytes, 0),
        qualities: meta.renditions.join(", "),
      });
      setMessage(
        "Verified " +
          status.total +
          " objects in the upload log. Select the film and save its registration.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const usage =
    (Number(stats["Registered media bytes"] || 0) / 1e9 / quota.storageGB) *
    100;
  return (
    <div className="admin">
      <h1>Administration</h1>
      <div className="tabs">
        {[{ label: "Overview", table: "overview", level: 1 }, ...resources]
          .filter((r) => level >= r.level)
          .map((r) => (
            <button
              key={r.table}
              className={tab === r.table ? "selected" : ""}
              onClick={() => {
                setTab(r.table);
                setPage(0);
              }}
            >
              {r.label}
            </button>
          ))}
      </div>
      <h2>{resource?.label || "Overview"}</h2>
      {!resource && level >= 2 && (
        <p className="small">
          Registered storage uses {usage.toFixed(1)}% of the {quota.storageGB}{" "}
          GB planning budget.{" "}
          {quota.thresholds
            .filter((n) => usage >= n)
            .map((n) => n + "% warning crossed. ")
            .join("")}
        </p>
      )}
      {message && (
        <p role="alert" className="msg">
          {message}
        </p>
      )}
      {!resource ? (
        <>
          {level >= 2 ? (
            <div className="stats">
              {Object.entries(stats).map(([k, v]) => (
                <div key={k}>
                  <strong>{v ?? "—"}</strong>
                  <span>{k}</span>
                </div>
              ))}
            </div>
          ) : (
            <p>
              Manage film metadata, register encoded media and enter license
              windows using the sections above.
            </p>
          )}
        </>
      ) : (
        <>
          {tab === "video_assets" && (
            <p className="small">
              Run the local ingestion CLI, then register the verified UUID, size
              and renditions from its inventory. Source uploads and encoding
              progress are handled by the CLI.
            </p>
          )}
          {tab === "video_assets" && (
            <label>
              Import encoder inventory and upload status
              <input
                type="file"
                accept=".json"
                multiple
                onChange={(e) => void importInventory(e.target.files)}
              />
            </label>
          )}
          {!resource.read && !resource.editOnly && (
            <button className="ghost" onClick={() => open(null)}>
              <Plus size={15} />
              Add record
            </button>
          )}
          {draft && (
            <form onSubmit={submit}>
              {Object.entries(resource.fields).map(([k, base]) => (
                <label key={k}>
                  {labels[k] || k.replaceAll("_", " ")}
                  {typeof base === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={draft[k]}
                      onChange={(e) =>
                        edit({ ...draft, [k]: e.target.checked })
                      }
                    />
                  ) : enums[k] || choices[k] ? (
                    <select
                      disabled={!!original && resource.keys.includes(k)}
                      value={draft[k]}
                      onChange={(e) => edit({ ...draft, [k]: e.target.value })}
                    >
                      {choices[k] ? (
                        <>
                          <option value="">Select a record</option>
                          {choices[k].map((r) => (
                            <option key={r.id} value={r.id}>
                              {r[refs[k][1]]}
                            </option>
                          ))}
                        </>
                      ) : (
                        enums[k].map((v) => <option key={v}>{v}</option>)
                      )}
                    </select>
                  ) : k === "value" || k === "synopsis" ? (
                    <textarea
                      value={draft[k]}
                      onChange={(e) => edit({ ...draft, [k]: e.target.value })}
                    />
                  ) : (
                    <input
                      disabled={!!original && resource.keys.includes(k)}
                      type={
                        k.endsWith("_at")
                          ? "datetime-local"
                          : typeof base === "number"
                            ? "number"
                            : "text"
                      }
                      value={draft[k]}
                      onChange={(e) => edit({ ...draft, [k]: e.target.value })}
                    />
                  )}
                </label>
              ))}
              <div className="actions">
                <button className="primary" disabled={busy}>
                  Save record
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => edit(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <label className="small">
            Filter this page
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Type to filter the records shown below"
            />
          </label>
          {pending && resource && (
            <div
              className="dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="del-title"
              onKeyDown={(e) => e.key === "Escape" && setPending(null)}
            >
              <div className="dialog-box">
                <h3 id="del-title">
                  Delete this {resource.label.toLowerCase()} record?
                </h3>
                <p className="small">
                  This cannot be undone. Related records may block the deletion,
                  and stored media files are never removed from here.
                </p>
                <div className="actions">
                  <button
                    className="primary"
                    autoFocus
                    onClick={() => void confirmRemove()}
                  >
                    Delete permanently
                  </button>
                  <button className="ghost" onClick={() => setPending(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
          {busy ? (
            <p role="status">Loading…</p>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Details</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter(
                      (row) =>
                        !find ||
                        JSON.stringify(row)
                          .toLowerCase()
                          .includes(find.toLowerCase()),
                    )
                    .map((row) => (
                    <tr key={resource.keys.map((k) => row[k]).join("/")}>
                      <td>
                        {(row.state || row.status) && (
                          <span
                            className={"badge " + (row.state || row.status)}
                          >
                            {String(row.state || row.status)}
                          </span>
                        )}{" "}
                        {String(
                          row.title ||
                            row.name ||
                            row.label ||
                            row.display_name ||
                            row.key ||
                            row.kind ||
                            row.action ||
                            row.reference ||
                            row[resource.keys[0]],
                        )}
                      </td>
                      <td>
                        <details>
                          <summary>Inspect record</summary>
                          {Object.entries(row).map(([k, v]) => (
                            <div key={k}>
                              <b>{k}</b> {textValue(v)}
                            </div>
                          ))}
                        </details>
                      </td>
                      <td>
                        {!resource.read && (
                          <button onClick={() => open(row)}>Edit</button>
                        )}{" "}
                        {!resource.read && !resource.editOnly && (
                          <button onClick={() => remove(row)}>Delete</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <p className="small">No records.</p>}
            </div>
          )}
          <div className="actions">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(total / 25))}
            </span>
            <button
              disabled={(page + 1) * 25 >= total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
            <button
              aria-label="Reload records"
              onClick={() => setReload((x) => x + 1)}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
