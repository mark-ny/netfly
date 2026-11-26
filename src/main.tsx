import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import { Store, useApp } from "./state";
import { demoMode } from "./catalog";
import { Shell } from "./Shell";
import {
  Details,
  Empty,
  Genres,
  Home,
  Landing,
  Listing,
  LoadState,
} from "./CatalogPages";
import { Auth, Legal, Profile, Support } from "./Accounts";
import "./styles.css";
const Player = lazy(() => import("./Player")),
  Admin = lazy(() => import("./Admin"));
function NotFound() {
  return (
    <Empty
      title="Page not found"
      text="This page may have moved or the film may be unavailable."
    />
  );
}
function Entry() {
  const { session, authReady } = useApp();
  if (!demoMode && !authReady)
    return <div className="loading" role="status" aria-label="Loading" />;
  return !demoMode && !session ? <Landing /> : <Home />;
}
function FilmRoute({ play = false }: { play?: boolean }) {
  const { slug } = useParams(),
    { movies, busy, problem, personalReady } = useApp();
  if (busy || problem || (play && !personalReady)) return <LoadState />;
  const m = movies.find((m) => m.slug === slug);
  if (!m) return <NotFound />;
  return play ? <Player key={m.id} m={m} /> : <Details m={m} />;
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Store>
      <Suspense
        fallback={
          <div className="loading" role="status" aria-label="Loading page" />
        }
      >
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Entry />} />
            {[
              "movies",
              "search",
              "trending",
              "recently-added",
              "popular",
              "watchlist",
              "history",
            ].map((p) => (
              <Route key={p} path={p} element={<Listing />} />
            ))}
            <Route path="genres" element={<Genres />} />
            <Route path="movie/:slug" element={<FilmRoute />} />
            <Route path="watch/:slug" element={<FilmRoute play />} />
            {["login", "signup", "recover", "account/reset"].map((p) => (
              <Route key={p} path={p} element={<Auth />} />
            ))}
            <Route path="profile" element={<Profile />} />
            <Route path="account/settings" element={<Profile />} />
            <Route path="support" element={<Support />} />
            {["terms", "privacy", "copyright"].map((kind) => (
              <Route key={kind} path={kind} element={<Legal kind={kind} />} />
            ))}
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </Store>
  </BrowserRouter>,
);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
