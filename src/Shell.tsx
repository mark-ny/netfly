import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Menu,
  Search,
  X,
  UserRound,
  Bookmark,
  ArrowUpRight,
  ChevronDown,
  Check,
} from "lucide-react";
import { useApp } from "./state";
import { demoMode } from "./catalog";
export function Mark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 38 38" fill="none">
      <g stroke="currentColor" strokeWidth="3.7" strokeLinecap="square">
        <path d="M4 25V9l7-4h21M10 30V14l7-4h15M16 34V19l7-4h9" />
        <path d="M16 34l16-9V15" />
      </g>
    </svg>
  );
}
export function Shell() {
  const { brand, notice, session } = useApp(),
    [menu, setMenu] = useState(false),
    [genres, setGenres] = useState(false),
    loc = useLocation(),
    nav = useNavigate(),
    { movies } = useApp();
  useEffect(() => {
    setMenu(false);
    setGenres(false);
    window.scrollTo(0, 0);
    const path = loc.pathname.replace(/\/$/, "") || "/";
    const m = movies.find((x) => path === "/movie/" + x.slug);
    document.title =
      (m?.title ||
        (path === "/"
          ? "Independent Cinema"
          : path.slice(1).replace(/[-/]/g, " "))) +
      " · " +
      brand;
    const href = (import.meta.env.VITE_SITE_ORIGIN || location.origin) + path;
    const meta = (
      selector: string,
      tag: string,
      attrs: Record<string, string>,
    ) => {
      let el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement(tag);
        document.head.append(el);
      }
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    };
    meta("meta[name=description]", "meta", {
      name: "description",
      content:
        m?.synopsis || "Browse the independent cinema collection on " + brand,
    });
    meta("link[rel=canonical]", "link", { rel: "canonical", href });
    meta('meta[property="og:title"]', "meta", {
      property: "og:title",
      content: document.title,
    });
    meta('meta[property="og:image"]', "meta", {
      property: "og:image",
      content: new URL(m?.backdrop || "/icon-512.png", href).href,
    });
    meta('meta[name="robots"]', "meta", {
      name: "robots",
      content:
        /^\/(account|admin|watch\/|profile|login|signup|history|watchlist|recover|search)/.test(
          path,
        )
          ? "noindex,nofollow"
          : "index,follow",
    });
    document.querySelector("#film-schema")?.remove();
    if (m) {
      const el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = "film-schema";
      el.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Movie",
        name: m.title,
        description: m.synopsis,
        image: m.poster,
        duration: "PT" + m.duration + "S",
        genre: m.genres,
      });
      document.head.append(el);
    }
  }, [loc.pathname, brand, movies]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenu(false);
        setGenres(false);
      }
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        e.preventDefault();
        nav("/search");
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [nav]);
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="top">
        <div className="topinner">
          <Link className="wordmark" to="/">
            <Mark />
            {brand.toUpperCase()}
          </Link>
          <nav aria-label="Main" className={menu ? "shown" : ""}>
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/movies">Movies</NavLink>
            <NavLink to="/trending">New &amp; Popular</NavLink>
            <div className="genre-wrap">
              <button
                className={genres ? "active" : ""}
                onClick={() => setGenres(!genres)}
                aria-expanded={genres}
              >
                Genres <ChevronDown size={13} />
              </button>
              {genres && (
                <>
                  <button
                    aria-label="Close genres"
                    className="dismiss"
                    onClick={() => setGenres(false)}
                  />
                  <div className="genre-menu">
                    <Link to="/genres">All genres</Link>
                    {[...new Set(movies.flatMap((m) => m.genres))].map((g) => (
                      <Link
                        key={g}
                        to={"/movies?genre=" + encodeURIComponent(g)}
                      >
                        {g}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
            <NavLink to="/watchlist">
              <Bookmark size={15} />
              My List
            </NavLink>
          </nav>
          <div className="navtools">
            <Link
              className="searchlink"
              to="/search"
              aria-label="Search movies"
            >
              <Search size={18} />
              <span>Search films</span>
              <kbd>/</kbd>
            </Link>
            <span className="divider" />
            {!demoMode && !session && (
              <Link className="signin-link" to="/login">
                Sign in
              </Link>
            )}
            <Link
              aria-label="Open profile"
              className="profilelink"
              to={demoMode || session ? "/profile" : "/login"}
            >
              <UserRound size={18} />
            </Link>
            <button
              className="mobilemenu iconbtn"
              aria-label="Toggle navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer>
        <Link className="wordmark" to="/">
          <Mark />
          {brand.toUpperCase()}
        </Link>
        <div>
          <Link to="/support">
            Support <ArrowUpRight size={12} />
          </Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/copyright">Copyright</Link>
        </div>
      </footer>
      {notice && (
        <div role="status" className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
    </>
  );
}
