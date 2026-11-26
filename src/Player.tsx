import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { ArrowLeft, RotateCcw, RotateCw } from "lucide-react";
import { demoMode, type Movie } from "./catalog";
import { callWorker } from "./api";
import { useApp } from "./state";
type Grant = {
  url: string;
  id: string;
  qualities: number[];
  tracks: { label: string; language: string; url: string }[];
};
export default function Player({ m }: { m: Movie }) {
  const { personal, progress, session } = useApp(),
    container = useRef<HTMLDivElement>(null),
    player = useRef<ReturnType<typeof videojs> | null>(null),
    [err, setErr] = useState(""),
    [attempt, setAttempt] = useState(0),
    [options, setOptions] = useState<number[]>([]),
    [quality, setQuality] = useState("auto"),
    saved = useRef(personal.progress[m.id]?.position || 0),
    write = useRef(progress);
  write.current = progress;
  const id = session?.user.id;
  useEffect(() => {
    if (!demoMode && !id) return;
    let active = true,
      grant: Grant | undefined,
      interval: ReturnType<typeof setInterval> | undefined,
      lastWrite = -1,
      watched = 0,
      lastPoint = 0,
      renewing = false,
      playerEl: ReturnType<typeof videojs> | undefined;
    setErr("");
    setQuality("auto");
    function mark(force = false) {
      if (!playerEl || playerEl.isDisposed()) return;
      const pos = Math.floor(playerEl.currentTime() || 0);
      if (
        pos > 0 &&
        ((force && pos !== lastWrite) || Math.abs(pos - lastWrite) >= 30)
      ) {
        lastWrite = pos;
        saved.current = pos;
        void write.current(m.id, pos);
      }
    }
    async function pulse(closing = false, failed = false, finished = false) {
      if (!grant?.id || (renewing && !closing)) return;
      const value = watched;
      watched = 0;
      renewing = true;
      try {
        await callWorker("/heartbeat", {
          id: grant.id,
          watched: Math.floor(value),
          closing,
          failed,
          finished,
        });
      } catch (e) {
        if (active && !closing) {
          setErr((e as Error).message);
          playerEl?.pause();
        }
      } finally {
        renewing = false;
      }
    }
    async function start() {
      const base = "/demo/" + m.slug + "/";
      grant = demoMode
        ? {
            id: "",
            url: base + "master.m3u8",
            qualities: [360, 480],
            tracks: [
              { label: "English", language: "en", url: base + "captions.vtt" },
            ],
          }
        : await callWorker("/authorize", { movie_id: m.id });
      if (!grant || !active || !container.current) {
        if (grant?.id) void pulse(true);
        return;
      }
      const el = document.createElement("video-js");
      el.classList.add("vjs-big-play-centered");
      el.setAttribute("playsinline", "");
      el.setAttribute("crossorigin", "anonymous");
      container.current.appendChild(el);
      const p = videojs(el, {
        controls: true,
        autoplay: false,
        preload: personal.reduceData ? "none" : "metadata",
        poster: m.backdrop,
        muted: true,
        fluid: false,
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        html5: { vhs: { limitRenditionByPlayerDimensions: true } },
      });
      playerEl = p;
      player.current = p;
      p.src({ src: grant.url, type: "application/x-mpegURL" });
      for (const t of grant.tracks)
        p.addRemoteTextTrack(
          {
            kind: "subtitles",
            label: t.label,
            srclang: t.language,
            src: t.url,
          },
          false,
        );
      setOptions(grant.qualities);
      p.on("loadedmetadata", () => {
        if (saved.current > 0 && saved.current < m.duration - 1)
          p.currentTime(saved.current);
      });
      p.on("timeupdate", () => {
        const now = p.currentTime() || 0;
        if (!p.paused() && now >= lastPoint && now - lastPoint < 2)
          watched += now - lastPoint;
        lastPoint = now;
        mark();
      });
      p.on("seeked", () => {
        lastPoint = p.currentTime() || 0;
        mark(true);
      });
      p.on("pause", () => mark(true));
      p.on("ended", () => {
        mark(true);
        void pulse(false, false, true);
      });
      p.on("error", () => {
        if (active) {
          setErr(
            "This stream could not be played. Check your connection and retry.",
          );
          void pulse(false, true);
        }
      });
      interval = setInterval(() => void pulse(), 45000);
    }
    void start().catch((e) => {
      if (active) setErr(e.message);
    });
    const visibility = () => {
      if (document.hidden) mark(true);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mark(true);
      active = false;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
      if (grant?.id) void pulse(true);
      playerEl?.dispose();
      player.current = null;
    };
  }, [m.id, attempt, id]);
  function choose(v: string) {
    setQuality(v);
    const p = player.current;
    if (!p) return;
    const tech = p.tech({ IWillNotUseThisInPlugins: true }) as any;
    const reps = tech?.vhs?.representations?.();
    if (reps?.length) {
      reps.forEach((r: any) =>
        r.enabled(v === "auto" || r.height === Number(v)),
      );
      return;
    }
    const current = p.currentSrc(),
      base = current.slice(
        0,
        current.lastIndexOf("master.m3u8") >= 0
          ? current.lastIndexOf("master.m3u8")
          : current.lastIndexOf("/", current.lastIndexOf("/") - 1) + 1,
      ),
      pos = p.currentTime(),
      paused = p.paused();
    p.src({
      src: base + (v === "auto" ? "master.m3u8" : v + "p/index.m3u8"),
      type: "application/x-mpegURL",
    });
    p.one("loadedmetadata", () => {
      p.currentTime(pos || 0);
      if (!paused) p.play()?.catch(() => {});
    });
  }
  const skip = (delta: number) => {
    const p = player.current;
    if (p)
      p.currentTime(
        Math.max(
          0,
          Math.min(p.duration() || m.duration, (p.currentTime() || 0) + delta),
        ),
      );
  };
  if (!demoMode && !session)
    return (
      <div className="formpage">
        <h1>Sign in to watch</h1>
        <Link
          className="primary"
          to={"/login?next=" + encodeURIComponent("/watch/" + m.slug)}
        >
          Sign in
        </Link>
      </div>
    );
  return (
    <div className="watchpage">
      <Link className="back" to={"/movie/" + m.slug}>
        <ArrowLeft size={15} />
        Film details
      </Link>
      <h1>{m.title}</h1>
      {err && (
        <div role="alert" className="msg">
          {err}{" "}
          <button className="ghost" onClick={() => setAttempt((x) => x + 1)}>
            Retry playback
          </button>
        </div>
      )}
      <div
        ref={container}
        className="screen"
        onKeyDown={(e) => {
          if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLSelectElement
          )
            return;
          const k = e.key.toLowerCase(),
            p = player.current;
          if (["j", "l", "k", "f", "m", "arrowleft", "arrowright"].includes(k)) {
            e.preventDefault();
            if (k === "j" || k === "arrowleft") skip(-10);
            else if (k === "l" || k === "arrowright") skip(10);
            else if (k === "f" && p) {
              if (p.isFullscreen()) void p.exitFullscreen();
              else void p.requestFullscreen();
            }
            else if (k === "m" && p) p.muted(!p.muted());
            else if (k === "k" && p?.paused()) p.play()?.catch(() => {});
            else if (k === "k") p?.pause();
          }
        }}
        tabIndex={0}
        aria-label="Film player. J or Left arrow back ten seconds, L or Right arrow forward ten seconds, K play or pause, M mute, F fullscreen."
      />
      <div className="playertools">
        <button onClick={() => skip(-10)}>
          <RotateCcw size={16} />
          10s
        </button>
        <button onClick={() => skip(10)}>
          <RotateCw size={16} />
          10s
        </button>
        <label>
          Quality{" "}
          <select value={quality} onChange={(e) => choose(e.target.value)}>
            <option value="auto">Auto</option>
            {options.map((h) => (
              <option key={h} value={String(h)}>
                {h}p
              </option>
            ))}
          </select>
        </label>
        <Link className="back" to={"/support?movie=" + m.id}>
          Report an issue
        </Link>
      </div>
      <p className="small shortcuts">
        Shortcuts: K play/pause · J / ← back 10s · L / → forward 10s · M mute ·
        F fullscreen
      </p>
      <p className="small">{m.synopsis}</p>
    </div>
  );
}
