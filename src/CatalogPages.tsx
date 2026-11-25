import { useRef, useState, useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock3,
  Film,
  Info,
  ListFilter,
  Play,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useApp } from "./state";
import { durationLabel, filterFilms, type Movie } from "./catalog";
export function Empty({
  title,
  text,
  link = "/movies",
  action = "Browse films",
}: {
  title: string;
  text: string;
  link?: string;
  action?: string;
}) {
  return (
    <div className="empty">
      <Film size={30} />
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="ghost" to={link}>
        {action}
        <ArrowRight size={15} />
      </Link>
    </div>
  );
}
export function LoadState() {
  const { problem, refresh } = useApp();
  return problem ? (
    <div className="empty" role="alert">
      <h2>Catalog unavailable</h2>
      <p>{problem}</p>
      <button className="primary" onClick={refresh}>
        Try again
      </button>
    </div>
  ) : (
    <div aria-label="Loading films" role="status" className="loading" />
  );
}
export function MovieCard({ m }: { m: Movie }) {
  const { personal, save } = useApp();
  const saved = personal.saved.includes(m.id);
  return (
    <article className={"filmcard style-" + m.slug}>
      <div className="poster">
        <Link to={"/movie/" + m.slug} aria-label={"Details for " + m.title}>
          <img src={m.poster} alt="" loading="lazy" />
          <div className="posterwords" aria-hidden="true">
            {m.title}
          </div>
        </Link>
        <button
          className={"card-save " + (saved ? "saved" : "")}
          aria-label={(saved ? "Remove " : "Save ") + m.title}
          onClick={() => save(m.id)}
        >
          {saved ? <Check size={16} /> : <Bookmark size={16} />}
        </button>
      </div>
      <Link className="cardtitle" to={"/movie/" + m.slug}>
        {m.title}
      </Link>
      <div className="cardmeta">
        {m.year}
        <i /> {m.genres[0] || "Film"}
      </div>
    </article>
  );
}
function Shelf({
  title,
  movies,
  to,
  icon,
}: {
  title: string;
  movies: Movie[];
  to: string;
  icon?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  if (!movies.length) return null;
  return (
    <section className="shelf">
      <div className="sectionhead">
        <h2>
          {icon && <span className="sectionbar" />}
          {title}
        </h2>
        <Link to={to}>
          View all <ArrowRight size={14} />
        </Link>
      </div>
      <div className="shelfwrap">
        <div className="filmrow" ref={ref}>
          {movies.map((m) => (
            <MovieCard key={m.id} m={m} />
          ))}
        </div>
        {movies.length > 5 && (
          <button
            className="rownext"
            aria-label={"Scroll " + title}
            onClick={() => {
              const el = ref.current!;
              if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 3)
                el.scrollTo({ left: 0, behavior: "smooth" });
              else
                el.scrollBy({ left: el.clientWidth * 0.8, behavior: "smooth" });
            }}
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </section>
  );
}
function Hero({ films }: { films: Movie[] }) {
  const [index, setIndex] = useState(0),
    m = films[index % films.length],
    { personal, save } = useApp(),
    saved = personal.saved.includes(m.id),
    reduce = useReducedMotion();
  const move = (n: number) =>
    setIndex((index + n + films.length) % films.length);
  return (
    <section className="hero" aria-label="Featured films">
      <motion.div
        key={m.id}
        className="hero-photo"
        initial={{ opacity: reduce ? 1 : 0.72 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        style={{ backgroundImage: "url(" + JSON.stringify(m.backdrop) + ")" }}
      />
      <div className="hero-shade" />
      <div className="heroinner">
        <div className="hero-copy">
          <div className="eyebrow">
            <span />
            FEATURED FILM
          </div>
          <h1>{m.title}</h1>
          <div className="herometa">
            <span>{m.year}</span>
            <i />
            <span>{durationLabel(m.duration)}</span>
            <i />
            <span>{m.genres[0] || "Film"}</span>
            <span className="classify">
              {m.classification === "Unrated" ? "NR" : m.classification}
            </span>
          </div>
          <p>{m.synopsis}</p>
          <div className="actions">
            <Link to={"/watch/" + m.slug} className="primary">
              <Play size={16} fill="currentColor" />
              Watch now
            </Link>
            <button className="ghost" onClick={() => save(m.id)}>
              {saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}{" "}
              {saved ? "Saved" : "Watchlist"}
            </button>
          </div>
        </div>
        <div className="herobottom">
          <div className="slideprogress">
            <b>{String(index + 1).padStart(2, "0")}</b>
            <div className="slidebars">
              {films.map((f, i) => (
                <button
                  key={f.id}
                  aria-label={"Feature " + f.title}
                  aria-current={i === index}
                  className={i === index ? "current" : ""}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
            <span>{String(films.length).padStart(2, "0")}</span>
          </div>
          <div className="herodirections">
            <button
              aria-label="Previous featured film"
              onClick={() => move(-1)}
            >
              <ChevronLeft size={17} />
            </button>
            <button aria-label="Next featured film" onClick={() => move(1)}>
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
export function Home() {
  const { movies, busy, problem, personal } = useApp(),
    [genre, choose] = useState("All films");
  if (busy || problem) return <LoadState />;
  if (!movies.length)
    return (
      <Empty
        title="The program is being prepared"
        text="Published films will appear here."
        link="/support"
        action="Contact support"
      />
    );
  const featured = movies.filter((m) => m.featured),
    g = [...new Set(movies.flatMap((m) => m.genres))],
    working = movies.filter(
      (m) =>
        personal.progress[m.id]?.position > 0 &&
        personal.progress[m.id].position < m.duration - 1,
    );
  const liked = new Set(
      movies
        .filter(
          (m) => personal.saved.includes(m.id) || personal.ratings[m.id] >= 4,
        )
        .flatMap((m) => m.genres),
    ),
    recommended = movies.filter(
      (m) =>
        m.genres.some((g) => liked.has(g)) && !personal.saved.includes(m.id),
    );
  return (
    <>
      <Hero films={(featured.length ? featured : movies).slice(0, 6)} />
      <div className="homebody">
        <div className="browserow">
          <span className="browse-label">
            <SlidersHorizontal size={14} /> Browse by genre
          </span>
          <div className="pills">
            {["All films", ...g].map((x) => (
              <button
                key={x}
                className={x === genre ? "selected" : ""}
                onClick={() => choose(x)}
              >
                {x === "All films" && <Clapperboard size={13} />} {x}
              </button>
            ))}
          </div>
        </div>
        {genre !== "All films" ? (
          <Shelf
            title={genre}
            movies={movies.filter((m) => m.genres.includes(genre))}
            to={"/movies?genre=" + encodeURIComponent(genre)}
            icon
          />
        ) : (
          <>
            <Shelf title="Continue watching" movies={working} to="/history" />
            <Shelf
              title="The screening room"
              movies={
                movies.filter((m) =>
                  m.collection_names.includes("The screening room"),
                ).length
                  ? movies.filter((m) =>
                      m.collection_names.includes("The screening room"),
                    )
                  : movies
              }
              to="/movies"
              icon
            />
            <Shelf
              title="Recommended for you"
              movies={recommended}
              to="/movies"
            />
            <Shelf
              title="Trending now"
              movies={movies
                .filter((m) => m.recent_plays > 0)
                .sort((a, b) => b.recent_plays - a.recent_plays)}
              to="/trending"
            />
            <Shelf
              title="Recently added"
              movies={movies.slice(0, 6)}
              to="/recently-added"
            />
            {[...new Set(movies.flatMap((m) => m.collection_names))]
              .filter((n) => n !== "The screening room")
              .map((n) => (
                <Shelf
                  key={n}
                  title={n}
                  movies={movies.filter((m) => m.collection_names.includes(n))}
                  to={"/movies?collection=" + encodeURIComponent(n)}
                />
              ))}
          </>
        )}
      </div>
    </>
  );
}
export function Listing() {
  const { movies, busy, problem, personal, clearHistory } = useApp(),
    { pathname } = useLocation(),
    [params, setParams] = useSearchParams(),
    [filters, setFilters] = useState(false);
  const q = params.get("q") || "",
    genre = params.get("genre") || "",
    year = params.get("year") || "",
    lang = params.get("language") || "",
    page = Math.max(1, Number(params.get("page")) || 1),
    sort = params.get("sort") || "",
    collection = params.get("collection") || "";
  function put(key: string, val: string) {
    const p = new URLSearchParams(params);
    p.delete("page");
    if (val) p.set(key, val);
    else p.delete(key);
    setParams(p, { replace: true });
  }
  const section = pathname.slice(1),
    names: Record<string, string> = {
      movies: "All movies",
      search: "Search films",
      watchlist: "Your watchlist",
      history: "Watch history",
      trending: "Trending now",
      popular: "Popular films",
      "recently-added": "Recently added",
    };
  let items = filterFilms(movies, q, genre, year, lang).filter(
    (m) => !collection || m.collection_names.includes(collection),
  );
  if (section === "watchlist")
    items = items.filter((m) => personal.saved.includes(m.id));
  if (section === "history")
    items = items
      .filter((m) => personal.progress[m.id])
      .sort((a, b) =>
        personal.progress[b.id].updated_at.localeCompare(
          personal.progress[a.id].updated_at,
        ),
      );
  if (section === "trending")
    items = items
      .filter((m) => m.recent_plays > 0)
      .sort((a, b) => b.recent_plays - a.recent_plays);
  if (section === "popular")
    items = items.filter((m) => m.plays > 0).sort((a, b) => b.plays - a.plays);
  if (sort === "title") items.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "year") items.sort((a, b) => b.year - a.year);
  return (
    <div className="page">
      <div className="pageheading">
        <h1>{names[section] || "Films"}</h1>
        {section === "history" && items.length > 0 && (
          <button
            className="ghost"
            onClick={() => {
              if (confirm("Clear your entire watch history?"))
                void clearHistory();
            }}
          >
            <Trash2 size={15} />
            Clear history
          </button>
        )}
      </div>
      {section === "movies" && (
        <div className="subnav">
          {[
            ["All movies", "movies"],
            ["Trending", "trending"],
            ["Popular", "popular"],
            ["Recently added", "recently-added"],
          ].map(([l, p]) => (
            <Link key={p} to={"/" + p}>
              {l}
            </Link>
          ))}
        </div>
      )}
      <div className="tools">
        <label className="searchbox">
          <Search size={19} />
          <input
            aria-label="Search films"
            autoFocus={section === "search"}
            placeholder="Search by title, genre or cast"
            value={q}
            onChange={(e) => put("q", e.target.value)}
          />
          {q && (
            <button aria-label="Clear search" onClick={() => put("q", "")}>
              <X size={16} />
            </button>
          )}
        </label>
        <button
          className="ghost"
          aria-expanded={filters}
          onClick={() => setFilters(!filters)}
        >
          <ListFilter size={16} />
          Filters
        </button>
      </div>
      {(filters || genre || year || lang) && (
        <div className="filterfields">
          {[
            ["Genre", genre, "genre", movies.flatMap((m) => m.genres)],
            ["Year", year, "year", movies.map((m) => String(m.year))],
            ["Language", lang, "language", movies.map((m) => m.language)],
          ].map(([label, value, key, opts]) => (
            <label key={String(key)}>
              {label}
              <select
                value={String(value)}
                onChange={(e) => put(String(key), e.target.value)}
              >
                <option value="">All</option>
                {Array.from(new Set(opts as string[])).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      {busy || problem ? (
        <LoadState />
      ) : (
        <>
          <div className="resultline">
            <span>
              {items.length} {items.length === 1 ? "film" : "films"}
            </span>
            <label>
              <ArrowDownWideNarrow size={14} />
              <select
                aria-label="Sort films"
                value={sort}
                onChange={(e) => put("sort", e.target.value)}
              >
                <option value="">Default order</option>
                <option value="title">Title A–Z</option>
                <option value="year">Release year</option>
              </select>
            </label>
          </div>
          {items.length ? (
            <div className="gridfilms">
              {items.slice((page - 1) * 12, page * 12).map((m) => (
                <MovieCard key={m.id} m={m} />
              ))}
            </div>
          ) : (
            <Empty
              title={
                q || genre
                  ? "No matching films"
                  : section === "watchlist"
                    ? "Your watchlist is empty"
                    : section === "history"
                      ? "No watch history yet"
                      : "No films here yet"
              }
              text={
                section === "watchlist"
                  ? "Select the bookmark on any film to save it here."
                  : q || genre
                    ? "Try a different title or adjust the filters."
                    : "Explore the collection to find your next film."
              }
            />
          )}
          {items.length > 12 && (
            <div className="actions">
              <button
                disabled={page <= 1}
                onClick={() => put("page", String(page - 1))}
              >
                <ArrowLeft />
                Previous
              </button>
              <span>Page {page}</span>
              <button
                disabled={page * 12 >= items.length}
                onClick={() => put("page", String(page + 1))}
              >
                Next
                <ArrowRight />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
export function Genres() {
  const { movies, busy, problem } = useApp();
  if (busy || problem) return <LoadState />;
  return (
    <div className="page">
      <h1>Genres</h1>
      <div className="genregrid">
        {[...new Set(movies.flatMap((m) => m.genres))].map((g) => {
          const ms = movies.filter((m) => m.genres.includes(g));
          return (
            <Link
              key={g}
              to={"/movies?genre=" + encodeURIComponent(g)}
              style={{
                backgroundImage:
                  "linear-gradient(0deg,#000b,transparent),url(" +
                  JSON.stringify(ms[0].backdrop) +
                  ")",
              }}
            >
              <span>{ms.length} films</span>
              <h2>{g}</h2>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
export function Details({ m }: { m: Movie }) {
  const { save, personal, rate, setNotice } = useApp(),
    [preview, setPreview] = useState(false);
  useEffect(() => setPreview(false), [m.id]);
  return (
    <div className="detail">
      <div
        className="detailback"
        style={{ backgroundImage: "url(" + JSON.stringify(m.backdrop) + ")" }}
      />
      <div className="detailcontent">
        <Link className="back" to="/movies">
          <ArrowLeft size={15} /> Movies
        </Link>
        <div className="eyebrow">
          <span />
          {m.genres[0] || "FILM"}
        </div>
        <h1>{m.title}</h1>
        <div className="herometa">
          {m.year}
          <i />
          <Clock3 size={14} />
          {durationLabel(m.duration)}
          <span className="classify">{m.classification}</span>
        </div>
        <p>{m.synopsis}</p>
        <div className="actions">
          <Link className="primary" to={"/watch/" + m.slug}>
            <Play size={16} fill="currentColor" />
            {personal.progress[m.id]?.position > 0 &&
            personal.progress[m.id].position < m.duration - 1
              ? "Resume film"
              : "Watch now"}
          </Link>
          <button className="ghost" onClick={() => save(m.id)}>
            <Bookmark size={16} />
            {personal.saved.includes(m.id) ? "Saved" : "Watchlist"}
          </button>
          {m.trailer && (
            <button className="ghost" onClick={() => setPreview(!preview)}>
              <Film size={16} />
              {preview ? "Close preview" : "Preview"}
            </button>
          )}
        </div>
        {preview && (
          <video
            className="trailer"
            controls
            autoPlay
            muted
            playsInline
            src={m.trailer}
          />
        )}
        <dl>
          {[
            ["Director", m.director],
            ["Cast", m.cast_names.join(", ")],
            ["Genres", m.genres.join(" · ")],
            ["Language", m.language],
            ["Country", m.country],
          ]
            .filter((x) => x[1])
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        <div className="rating">
          <span>Your rating</span>
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              aria-label={"Rate " + v + " stars"}
              onClick={() => rate(m.id, v)}
            >
              <Star
                size={19}
                fill={
                  (personal.ratings[m.id] || 0) >= v ? "currentColor" : "none"
                }
              />
            </button>
          ))}
        </div>
        <button
          className="linkbutton"
          onClick={() =>
            navigator.clipboard
              .writeText(location.href)
              .then(() => setNotice("Film link copied"))
              .catch(() => setNotice(location.href))
          }
        >
          Copy film link <ArrowRight size={14} />
        </button>
        <Link className="back" to={"/support?movie=" + m.id}>
          <Info size={14} /> Report a playback issue
        </Link>
      </div>
    </div>
  );
}
