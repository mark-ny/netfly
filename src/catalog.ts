export type Movie = {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  year: number;
  duration: number;
  language: string;
  country: string;
  classification: string;
  director: string;
  poster: string;
  backdrop: string;
  trailer: string;
  genres: string[];
  cast_names: string[];
  created_at: string;
  plays: number;
  recent_plays: number;
  collection_names: string[];
  featured: boolean;
  intro_start?: number;
  intro_end?: number;
  series_id?: string | null;
  season?: number | null;
  episode_number?: number | null;
};
export const demoMode =
  !import.meta.env.VITE_SUPABASE_URL &&
  !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// The bundled sample films were removed. Without Supabase variables the app
// starts with an empty catalog; real titles come from the database.
// Mirrors private.class_rank() in the database. Unknown ratings rank 99.
export const classRank = (c: string) =>
  ({ G: 0, GE: 0, PG: 1, "13": 2, "PG-13": 2, "16": 3, "18": 4, R: 4 })[
    c.trim().toUpperCase() as "G"
  ] ?? 99;
export const kidsMaxRank = 1;
export const demos: Movie[] = [];
export function durationLabel(s: number) {
  return s < 60 ? s + " sec" : Math.round(s / 60) + " min";
}
export function filterFilms(
  movies: Movie[],
  q: string,
  genre: string,
  year: string,
  language: string,
) {
  const val = q.trim().toLocaleLowerCase();
  return movies.filter(
    (m) =>
      (!val ||
        [m.title, ...m.genres, ...m.cast_names, m.year, m.language, m.director]
          .join(" ")
          .toLocaleLowerCase()
          .includes(val)) &&
      (!genre || m.genres.includes(genre)) &&
      (!year || String(m.year) === year) &&
      (!language || m.language === language),
  );
}
