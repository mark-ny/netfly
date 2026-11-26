import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
  loadProfiles,
  loadSeries,
  maxProfiles,
  readDemo,
  writeDemo,
  type Personal,
  type Profile,
  type Series,
} from "./api";
import { demoMode, type Movie } from "./catalog";
const storeKey = (kind: string, account: string) =>
  "netfly:" + kind + ":" + account;
function read(k: string, tab = false) {
  try {
    return (tab ? sessionStorage : localStorage).getItem(k) || undefined;
  } catch {
    return undefined;
  }
}
function write(k: string, v: string, tab = false) {
  try {
    (tab ? sessionStorage : localStorage).setItem(k, v);
  } catch {
    /* storage can be unavailable (private mode); the choice then lasts for this page only */
  }
}
function clearChosen() {
  try {
    for (const k of Object.keys(sessionStorage))
      if (k.startsWith("netfly:chosen:")) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
function useStore() {
  const [all, setAll] = useState<Movie[]>([]),
    [series, setSeries] = useState<Series[]>([]),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [profileId, setProfileId] = useState<string>(),
    [profilesReady, setProfilesReady] = useState(false),
    [chosen, setChosen] = useState(false),
    [busy, setBusy] = useState(true),
    [problem, setProblem] = useState(""),
    [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(!db),
    [role, setRole] = useState("viewer"),
    [loadedKey, setLoadedKey] = useState<string>(),
    [brand, setBrand] = useState("Netfly"),
    [notice, setNotice] = useState(""),
    [personal, setPersonal] = useState<Personal>(demoMode ? readDemo : blank);
  const current = useRef(personal),
    activeUser = useRef<string | undefined>(undefined),
    nav = useNavigate();
  const account = session?.user.id;
  const movies = useMemo(() => all.filter((m) => !m.series_id), [all]),
    episodes = useMemo(() => all.filter((m) => m.series_id), [all]);
  const key = account && profileId ? account + ":" + profileId : undefined;
  function apply(p: Personal) {
    current.current = p;
    setPersonal(p);
  }
  async function refresh() {
    setBusy(true);
    setProblem("");
    try {
      setAll(await catalog());
      // Series are optional: an older database without them still shows films.
      setSeries(await loadSeries().catch(() => []));
      if (db) {
        const s = await db
          .from("site_settings")
          .select("value")
          .eq("key", "brand")
          .maybeSingle();
        setBrand(s.data?.value?.name || "Netfly");
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
      setAuthReady(true);
      if (event === "SIGNED_OUT") clearChosen();
      if (event === "PASSWORD_RECOVERY") nav("/account/reset");
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    setProfiles([]);
    setProfileId(undefined);
    setProfilesReady(false);
    setChosen(false);
    setRole("viewer");
    if (!db || !account) {
      if (!db) setProfilesReady(true);
      return;
    }
    let live = true;
    loadProfiles(account)
      .then((list) => {
        if (!live) return;
        const saved = read(storeKey("profile", account)),
          pick = list.find((p) => p.id === saved) || list.find((p) => p.is_default) || list[0];
        setProfiles(list);
        setProfileId(pick?.id);
        // One profile needs no picker; several ask once per browser tab session.
        setChosen(list.length < 2 || read(storeKey("chosen", account), true) === "1");
      })
      .catch((e) => {
        if (live) setNotice(e.message);
      })
      .finally(() => {
        if (live) setProfilesReady(true);
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
    activeUser.current = key;
    if (!db) return;
    setLoadedKey(undefined);
    apply(blank());
    if (!account || !profileId) return;
    let live = true;
    loadPersonal(account, profileId)
      .then((p) => {
        if (live) apply(p);
      })
      .catch((e) => {
        if (live) setNotice(e.message);
      })
      .finally(() => {
        if (live) setLoadedKey(key);
      });
    return () => {
      live = false;
    };
  }, [key]);
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
        if (activeUser.current !== key) return false;
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
              .match({ profile_id: profileId, movie_id: id })
          : db!
              .from("watchlists")
              .upsert({ user_id: account, profile_id: profileId, movie_id: id }),
      remove ? "Removed from My List" : "Added to My List",
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
          .upsert({
            user_id: account,
            profile_id: profileId,
            movie_id: id,
            ...item,
          }),
    );
  }
  function rate(id: string, score: number) {
    return change(
      (p) => ({ ...p, ratings: { ...p.ratings, [id]: score } }),
      () =>
        db!
          .from("ratings")
          .upsert({ user_id: account, profile_id: profileId, movie_id: id, score }),
      "Rating saved",
    );
  }
  function clearHistory() {
    return change(
      (p) => ({ ...p, progress: {} }),
      () => db!.from("watch_progress").delete().eq("profile_id", profileId),
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
  function chooseProfile(id: string) {
    if (!account || !profiles.some((p) => p.id === id)) return;
    write(storeKey("profile", account), id);
    write(storeKey("chosen", account), "1", true);
    setChosen(true);
    setProfileId(id);
  }
  async function addProfile(name: string, avatar: string) {
    if (!db || !account) return false;
    if (profiles.length >= maxProfiles) {
      setNotice("You can have up to " + maxProfiles + " profiles.");
      return false;
    }
    const { data, error } = await db
      .from("viewer_profiles")
      .insert({ account_id: account, name: name.trim(), avatar })
      .select("id,name,avatar,is_default")
      .single();
    if (error) {
      setNotice(error.message);
      return false;
    }
    setProfiles((p) => [...p, data]);
    return true;
  }
  async function editProfile(id: string, name: string, avatar: string) {
    if (!db) return false;
    const { error } = await db
      .from("viewer_profiles")
      .update({ name: name.trim(), avatar })
      .eq("id", id);
    if (error) {
      setNotice(error.message);
      return false;
    }
    setProfiles((p) =>
      p.map((x) => (x.id === id ? { ...x, name: name.trim(), avatar } : x)),
    );
    return true;
  }
  async function removeProfile(id: string) {
    const target = profiles.find((p) => p.id === id);
    if (!db || !account || !target || target.is_default) return false;
    const { error } = await db.from("viewer_profiles").delete().eq("id", id);
    if (error) {
      setNotice(error.message);
      return false;
    }
    const rest = profiles.filter((p) => p.id !== id);
    setProfiles(rest);
    if (profileId === id) {
      const fallback = rest.find((p) => p.is_default) || rest[0];
      write(storeKey("profile", account), fallback.id);
      setProfileId(fallback.id);
    }
    return true;
  }
  const profile = profiles.find((p) => p.id === profileId);
  return {
    personalReady:
      demoMode || !account || (profilesReady && (!profileId || loadedKey === key)),
    profilesReady,
    needsPicker:
      !demoMode && !!account && profilesReady && profiles.length > 1 && !chosen,
    profiles,
    profile,
    chosen,
    chooseProfile,
    addProfile,
    editProfile,
    removeProfile,
    series,
    episodes,
    lookup: all,
    authReady,
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
