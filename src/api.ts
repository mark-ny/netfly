import { createClient } from "@supabase/supabase-js";
import { demoMode, demos, type Movie } from "./catalog";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const db = url && key ? createClient(url, key) : null;
export const gateway = (import.meta.env.VITE_PLAYBACK_ORIGIN || "").replace(
  /\/$/,
  "",
);
export async function catalog(): Promise<Movie[]> {
  if (demoMode) return demos;
  if (!db) throw Error("Catalog configuration is incomplete.");
  const rows: Movie[] = [];
  for (let offset = 0; ; offset += 48) {
    const { data, error } = await db
      .from("catalog")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 47);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 48) return rows;
  }
}
export type Personal = {
  saved: string[];
  progress: Record<string, { position: number; updated_at: string }>;
  ratings: Record<string, number>;
  name: string;
  reduceData: boolean;
};
export const blank = (): Personal => ({
  saved: [],
  progress: {},
  ratings: {},
  name: "",
  reduceData: false,
});
const storageKey = "stillframe:demo:v1";
export function readDemo(): Personal {
  try {
    return {
      ...blank(),
      ...JSON.parse(localStorage.getItem(storageKey) || "{}"),
    };
  } catch {
    return blank();
  }
}
export function writeDemo(p: Personal) {
  localStorage.setItem(storageKey, JSON.stringify(p));
}
export async function loadPersonal(id: string): Promise<Personal> {
  const d = db!;
  const [s, p, r, u] = await Promise.all([
    d.from("watchlists").select("movie_id").eq("user_id", id),
    d
      .from("watch_progress")
      .select("movie_id,position,updated_at")
      .eq("user_id", id),
    d.from("ratings").select("movie_id,score").eq("user_id", id),
    d
      .from("profiles")
      .select("display_name,reduce_data")
      .eq("user_id", id)
      .maybeSingle(),
  ]);
  for (const result of [s, p, r, u]) if (result.error) throw result.error;
  return {
    saved: (s.data || []).map((x) => x.movie_id),
    progress: Object.fromEntries((p.data || []).map((x) => [x.movie_id, x])),
    ratings: Object.fromEntries(
      (r.data || []).map((x) => [x.movie_id, x.score]),
    ),
    name: u.data?.display_name || "",
    reduceData: u.data?.reduce_data || false,
  };
}
export async function callWorker(path: string, body?: object) {
  if (!db || !gateway)
    throw Error("Playback service configuration is missing.");
  const { data } = await db.auth.getSession();
  if (!data.session) throw Error("Please sign in to continue.");
  const res = await fetch(gateway + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + data.session.access_token,
    },
    body: JSON.stringify(body || {}),
  });
  const out = await res.json();
  if (!res.ok) throw Error(out.error || "Request failed. Please try again.");
  return out;
}
