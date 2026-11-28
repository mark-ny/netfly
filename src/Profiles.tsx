import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Pencil, Plus, Play, Trash2 } from "lucide-react";
import { avatars, maxProfiles, type Profile } from "./api";
import { useApp } from "./state";
import { durationLabel } from "./catalog";
import { Empty, LoadState } from "./CatalogPages";

export function Avatar({ p, size = 96 }: { p: Pick<Profile, "name" | "avatar">; size?: number }) {
  return (
    <span
      className={"avatar av-" + p.avatar}
      style={{ width: size, height: size, fontSize: size / 2.4 }}
      aria-hidden="true"
    >
      {(p.name.trim()[0] || "?").toUpperCase()}
    </span>
  );
}

export function WhoIsWatching() {
  const { session, profiles, profilesReady, profile, chooseProfile, addProfile, editProfile, removeProfile } = useApp(),
    [params] = useSearchParams(),
    nav = useNavigate(),
    [manage, setManage] = useState(false),
    [form, setForm] = useState<{ id?: string; name: string; avatar: string; is_kids: boolean } | null>(null),
    [removing, setRemoving] = useState<Profile | null>(null),
    [saving, setSaving] = useState(false);
  const next = params.get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  useEffect(() => {
    if (!removing) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setRemoving(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [removing]);
  if (!session) return <Navigate to="/login" replace />;
  if (!profilesReady) return <LoadState />;
  if (!profiles.length)
    return <Empty title="Profiles are unavailable" text="We could not load your profiles. Refresh the page or try again later." />;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form || !form.name.trim() || saving) return;
    setSaving(true);
    const ok = form.id ? await editProfile(form.id, form.name, form.avatar, form.is_kids) : await addProfile(form.name, form.avatar, form.is_kids);
    setSaving(false);
    if (ok) setForm(null);
  }
  function pick(p: Profile) {
    if (manage) setForm({ id: p.id, name: p.name, avatar: p.avatar, is_kids: p.is_kids });
    else {
      chooseProfile(p.id);
      nav(target, { replace: true });
    }
  }
  return (
    <div className="who">
      <h1>{manage ? "Manage profiles" : "Who's watching?"}</h1>
      <ul className="whogrid">
        {profiles.map((p) => (
          <li key={p.id}>
            <button className={"whocard" + (p.id === profile?.id ? " current" : "")} onClick={() => pick(p)} aria-label={(manage ? "Edit profile " : "Watch as ") + p.name}>
              <Avatar p={p} />
              <span>{p.name}{p.is_kids ? " · Kids" : ""}</span>
              {manage && <Pencil size={14} aria-hidden="true" />}
            </button>
          </li>
        ))}
        {profiles.length < maxProfiles && (
          <li>
            <button className="whocard add" onClick={() => setForm({ name: "", avatar: avatars[profiles.length % avatars.length], is_kids: false })} aria-label="Add profile">
              <span className="avatar add" aria-hidden="true"><Plus /></span>
              <span>Add profile</span>
            </button>
          </li>
        )}
      </ul>
      <button className="ghost" onClick={() => { setManage(!manage); setForm(null); }}>
        {manage ? "Done" : "Manage profiles"}
      </button>
      {form && (
        <form className="whoform" onSubmit={submit} aria-label={form.id ? "Edit profile" : "Add profile"}>
          <label>
            Name
            <input value={form.name} maxLength={30} required autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="checkline">
            <input type="checkbox" checked={form.is_kids} onChange={(e) => setForm({ ...form, is_kids: e.target.checked })} />
            Kids profile (hides films rated above PG and blocks playing them)
          </label>
          <fieldset>
            <legend>Colour</legend>
            {avatars.map((a) => (
              <label key={a} className={"swatch av-" + a + (form.avatar === a ? " on" : "")}>
                <input type="radio" name="avatar" checked={form.avatar === a} onChange={() => setForm({ ...form, avatar: a })} />
                <span className="sr">{a}</span>
              </label>
            ))}
          </fieldset>
          <div className="actions">
            <button className="primary" disabled={saving}>{saving ? "Saving" : "Save profile"}</button>
            <button type="button" className="ghost" onClick={() => setForm(null)}>Cancel</button>
            {form.id && !profiles.find((p) => p.id === form.id)?.is_default && (
              <button type="button" className="ghost danger" onClick={() => setRemoving(profiles.find((p) => p.id === form.id)!)}>
                <Trash2 size={14} /> Delete profile
              </button>
            )}
          </div>
        </form>
      )}
      {removing && (
        <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="rm-title">
          <div className="dialog-box">
            <h2 id="rm-title">Delete “{removing.name}”?</h2>
            <p>This removes the profile's list, watch history and ratings. This cannot be undone.</p>
            <div className="actions">
              <button className="primary" autoFocus onClick={async () => { const ok = await removeProfile(removing.id); if (ok) { setRemoving(null); setForm(null); } }}>Delete permanently</button>
              <button className="ghost" onClick={() => setRemoving(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SeriesList() {
  const { series, busy, problem } = useApp();
  if (busy || problem) return <LoadState />;
  if (!series.length) return <Empty title="No series yet" text="TV series will appear here once they are published." />;
  return (
    <div className="page">
      <div className="pageheading">
        <h1>TV Series</h1>
      </div>
      <div className="gridfilms">
        {series.map((s) => (
          <article key={s.id} className={"filmcard style-" + s.slug}>
            <div className="poster">
              <Link to={"/series/" + s.slug} aria-label={"Details for " + s.title}>
                <img src={s.poster} alt="" loading="lazy" />
                <div className="posterwords" aria-hidden="true">{s.title}</div>
              </Link>
            </div>
            <Link className="cardtitle" to={"/series/" + s.slug}>{s.title}</Link>
            <div className="cardmeta">{s.year}<i /> Series</div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function SeriesPage() {
  const { slug } = useParams(),
    { series, episodes, busy, problem, personal } = useApp(),
    s = series.find((x) => x.slug === slug),
    eps = episodes
      .filter((e) => e.series_id === s?.id)
      .sort((a, b) => (a.season || 0) - (b.season || 0) || (a.episode_number || 0) - (b.episode_number || 0)),
    seasons = [...new Set(eps.map((e) => e.season || 1))],
    [season, setSeason] = useState<number>();
  if (busy || problem) return <LoadState />;
  if (!s) return <Empty title="Series not found" text="This series may have moved or is not available." />;
  const active = season && seasons.includes(season) ? season : seasons[0],
    list = eps.filter((e) => (e.season || 1) === active),
    resume = eps.find((e) => { const pr = personal.progress[e.id]; return pr && pr.position > 0 && pr.position < e.duration - 1; }) || eps[0];
  return (
    <div className="detail">
      <div className="detailback" style={{ backgroundImage: "url(" + JSON.stringify(s.backdrop) + ")" }} />
      <div className="detailcontent">
        <Link className="back" to="/series"><ArrowLeft size={15} /> TV Series</Link>
        <h1>{s.title}</h1>
        <div className="herometa">{s.year}<span className="classify">{s.classification}</span>{s.language}</div>
        <p>{s.synopsis}</p>
        {resume && (
          <div className="actions">
            <Link className="primary" to={"/watch/" + resume.slug}>
              <Play size={16} fill="currentColor" /> {personal.progress[resume.id]?.position ? "Resume" : "Play"} S{resume.season} E{resume.episode_number}
            </Link>
          </div>
        )}
        {seasons.length > 1 && (
          <label className="seasonpick">
            Season
            <select value={active} onChange={(e) => setSeason(Number(e.target.value))}>
              {seasons.map((n) => <option key={n} value={n}>Season {n}</option>)}
            </select>
          </label>
        )}
        {!eps.length && <p>Episodes are being prepared.</p>}
        <ol className="episodes">
          {list.map((e) => {
            const pr = personal.progress[e.id],
              pct = pr ? Math.min(100, Math.round((pr.position / e.duration) * 100)) : 0;
            return (
              <li key={e.id}>
                <Link to={"/watch/" + e.slug}>
                  <b>{e.episode_number}</b>
                  <span>
                    <strong>{e.title}</strong>
                    <small>{durationLabel(e.duration)}</small>
                    {e.synopsis && <em>{e.synopsis}</em>}
                    {pct > 0 && <i className="bar" style={{ width: pct + "%" }} aria-label={pct + "% watched"} />}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
