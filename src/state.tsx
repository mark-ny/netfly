import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import {
  blank,
  catalog,
  db,
  loadPersonal,
  readDemo,
  writeDemo,
  type Personal,
} from "./api";
import { demoMode, type Movie } from "./catalog";
function useStore() {
  const [movies, setMovies] = useState<Movie[]>([]),
    [busy, setBusy] = useState(true),
    [problem, setProblem] = useState(""),
    [session, setSession] = useState<Session | null>(null),
    [role, setRole] = useState("viewer"),
    [loadedUser, setLoadedUser] = useState<string>(),
    [brand, setBrand] = useState("Stillframe"),
    [notice, setNotice] = useState(""),
    [personal, setPersonal] = useState<Personal>(demoMode ? readDemo : blank);
  const current = useRef(personal),
    activeUser = useRef<string | undefined>(undefined),
    nav = useNavigate();
  const account = session?.user.id;
  function apply(p: Personal) {
    current.current = p;
    setPersonal(p);
  }
  async function refresh() {
    setBusy(true);
    setProblem("");
    try {
      setMovies(await catalog());
      if (db) {
        const s = await db
          .from("site_settings")
          .select("value")
          .eq("key", "brand")
          .maybeSingle();
        setBrand(s.data?.value?.name || "Stillframe");
      }
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
    if (!db) return;
    const { data } = db.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") nav("/account/reset");
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    activeUser.current = account;
    if (!db) return;
    setLoadedUser(undefined);
    apply(blank());
    setRole("viewer");
    if (!account) return;
    let live = true;
    loadPersonal(account)
      .then((p) => {
        if (live) apply(p);
      })
      .catch((e) => {
        if (live) setNotice(e.message);
      })
      .finally(() => {
        if (live) setLoadedUser(account);
      });
    db.from("roles")
      .select("role")
      .eq("user_id", account)
      .maybeSingle()
      .then((r) => {
        if (live) setRole(r.data?.role || "viewer");
      });
    return () => {
      live = false;
    };
  }, [account]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  function requireUser() {
    if (!demoMode && !account) {
      nav(
        "/login?next=" +
          encodeURIComponent(location.pathname + location.search),
      );
      return false;
    }
    return true;
  }
  async function change(
    transform: (p: Personal) => Personal,
    remote: () => PromiseLike<{ error: unknown }>,
    ok = "",
  ) {
    if (!requireUser()) return false;
    try {
      if (!demoMode) {
        const res = await remote();
        if (res.error) throw res.error;
        if (activeUser.current !== account) return false;
      }
      const next = transform(current.current);
      if (demoMode) writeDemo(next);
      apply(next);
      if (ok) setNotice(ok);
      return true;
    } catch (e) {
      setNotice((e as Error).message || "Could not save this change.");
      return false;
    }
  }
  function save(id: string) {
    const remove = current.current.saved.includes(id);
    return change(
      (p) => ({
        ...p,
        saved: remove
          ? p.saved.filter((x) => x !== id)
          : Array.from(new Set([...p.saved, id])),
      }),
      () =>
        remove
          ? db!
              .from("watchlists")
              .delete()
              .match({ user_id: account, movie_id: id })
          : db!.from("watchlists").upsert({ user_id: account, movie_id: id }),
      remove ? "Removed from your watchlist" : "Added to your watchlist",
    );
  }
  function progress(id: string, position: number) {
    const item = {
      position: Math.max(0, Math.floor(position)),
      updated_at: new Date().toISOString(),
    };
    return change(
      (p) => ({ ...p, progress: { ...p.progress, [id]: item } }),
      () =>
        db!
          .from("watch_progress")
          .upsert({ user_id: account, movie_id: id, ...item }),
    );
  }
  function rate(id: string, score: number) {
    return change(
      (p) => ({ ...p, ratings: { ...p.ratings, [id]: score } }),
      () =>
        db!.from("ratings").upsert({ user_id: account, movie_id: id, score }),
      "Rating saved",
    );
  }
  function clearHistory() {
    return change(
      (p) => ({ ...p, progress: {} }),
      () => db!.from("watch_progress").delete().eq("user_id", account),
      "Watch history cleared",
    );
  }
  function preferences(name: string, reduceData: boolean) {
    return change(
      (p) => ({ ...p, name, reduceData }),
      () =>
        db!.from("profiles").upsert({
          user_id: account,
          display_name: name,
          reduce_data: reduceData,
        }),
      "Preferences saved",
    );
  }
  return {
    personalReady: demoMode || !account || loadedUser === account,
    movies,
    busy,
    problem,
    session,
    role,
    brand,
    notice,
    setNotice,
    personal,
    save,
    progress,
    rate,
    clearHistory,
    preferences,
    requireUser,
    refresh,
  };
}
const Context = createContext<ReturnType<typeof useStore> | null>(null);
export function Store({ children }: { children: ReactNode }) {
  return <Context.Provider value={useStore()}>{children}</Context.Provider>;
}
export const useApp = () => useContext(Context)!;
