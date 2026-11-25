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
};
export const demoMode =
  !import.meta.env.VITE_SUPABASE_URL &&
  !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const titles = [
  [
    "The Last Light",
    "the-last-light",
    "As the sun slips behind the acacias, a quiet road through Kenya takes on a life of its own.",
    "African Cinema",
    "Nature",
    "Kenya",
  ],
  [
    "Blue Hours",
    "blue-hours",
    "A study of the open ocean, where light traces the restless surface of the water.",
    "Nature",
    "Documentary",
    "",
  ],
  [
    "Above the Clouds",
    "above-the-clouds",
    "Beyond the cloud line, mountain ridges emerge in a changing field of light.",
    "Adventure",
    "Nature",
    "",
  ],
  [
    "Between the Trees",
    "between-the-trees",
    "An unhurried passage into the forest, following the light through layers of green.",
    "Nature",
    "Documentary",
    "",
  ],
  [
    "After Dark",
    "after-dark",
    "The city comes into focus after sunset, its streets redrawn in pools of electric light.",
    "Urban",
    "Documentary",
    "",
  ],
  [
    "Dunes of Silence",
    "dunes-of-silence",
    "Wind and shadow carve a shifting geometry across the desert.",
    "Adventure",
    "Nature",
    "",
  ],
  [
    "Falling Water",
    "falling-water",
    "A waterfall fills the frame in a close encounter with the force of moving water.",
    "Nature",
    "Documentary",
    "",
  ],
  [
    "Northern Skies",
    "northern-skies",
    "A luminous night sky stretches across a landscape on the edge of darkness.",
    "Nature",
    "Adventure",
    "",
  ],
];
export const demos: Movie[] = titles.map(
  ([title, slug, synopsis, g, g2, country], i) => ({
    id: "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
    title,
    slug,
    synopsis,
    year: 2026,
    duration: 18,
    language: "No dialogue",
    country,
    classification: "Unrated",
    director: "Netfly Studio",
    poster: "/art/" + slug + "-poster.webp",
    backdrop: "/art/" + slug + ".webp",
    trailer: "/demo/" + slug + "/preview.mp4",
    genres: [g, g2],
    cast_names: [],
    created_at: new Date(Date.UTC(2026, 10, 24 - i)).toISOString(),
    plays: 0,
    recent_plays: 0,
    collection_names: ["The screening room"],
    featured: i < 4,
  }),
);
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
