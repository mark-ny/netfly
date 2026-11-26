import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { loadEnv } from "vite";
const config = {
  ...loadEnv("production", process.cwd(), "VITE_"),
  ...process.env,
};
const origin = config.VITE_SITE_ORIGIN || (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : undefined);
const site = origin ? new URL(origin).origin : null;
const template = await readFile("dist/index.html", "utf8");
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
let movies = [];
if (config.VITE_SUPABASE_URL && config.VITE_SUPABASE_PUBLISHABLE_KEY) {
  const endpoint = new URL("/rest/v1/catalog", config.VITE_SUPABASE_URL);
  endpoint.searchParams.set(
    "select",
    "title,slug,synopsis,poster,backdrop,genres,duration",
  );
  endpoint.searchParams.set("order", "id");
  for (let offset = 0; ; offset += 100) {
    endpoint.searchParams.set("offset", String(offset));
    endpoint.searchParams.set("limit", "100");
    const r = await fetch(endpoint, {
      headers: { apikey: config.VITE_SUPABASE_PUBLISHABLE_KEY },
    });
    if (!r.ok)
      throw Error(
        "Unable to build public catalog metadata. Check Data API configuration.",
      );
    const batch = await r.json();
    movies.push(...batch);
    if (batch.length < 100) break;
  }
} else if (!config.VITE_SUPABASE_URL && !config.VITE_SUPABASE_PUBLISHABLE_KEY) {
  movies = [];
} else throw Error("Both Supabase frontend variables are required.");
for (const m of movies) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.slug))
    throw Error("Invalid catalog slug");
  const route = "/movie/" + m.slug,
    head =
      '<meta property="og:title" content="' +
      escape(m.title) +
      '"/><meta property="og:description" content="' +
      escape(m.synopsis) +
      '"/><meta property="og:image" content="' +
      escape(site ? new URL(m.backdrop, site).href : m.backdrop) +
      '"/>' +
      (site ? '<link rel="canonical" href="' + site + route + '"/>' : "") +
      '<script id="film-schema" type="application/ld+json">' +
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Movie",
        name: m.title,
        description: m.synopsis,
        genre: m.genres,
        duration: "PT" + m.duration + "S",
        image: site ? new URL(m.poster, site).href : m.poster,
      }).replaceAll("<", "\\u003c") +
      "</script>";
  await mkdir("dist" + route, { recursive: true });
  await writeFile(
    "dist" + route + "/index.html",
    template
      .replace(
        /<title>.*?<\/title>/,
        "<title>" + escape(m.title) + " · Netfly</title>",
      )
      .replace(
        /<meta name="description" content="[^"]*"\s*\/>/,
        '<meta name="description" content="' + escape(m.synopsis) + '"/>',
      )
      .replace("</head>", head + "</head>"),
  );
}
if (site) {
  const urls = [
    "/",
    "/movies",
    "/genres",
    "/recently-added",
    "/popular",
    "/trending",
    ...movies.map((m) => "/movie/" + m.slug),
  ];
  await writeFile(
    "dist/sitemap.xml",
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      urls
        .map((u) => "<url><loc>" + escape(site + u) + "</loc></url>")
        .join("") +
      "</urlset>",
  );
  await writeFile(
    "dist/robots.txt",
    (await readFile("public/robots.txt", "utf8")) +
      "Sitemap: " +
      site +
      "/sitemap.xml\n",
  );
}
// Scan executable client files, including lazy chunks. Local fixture keys and server credentials must never ship.
for (const file of await readdir("dist/assets"))
  if (file.endsWith(".js")) {
    const js = await readFile("dist/assets/" + file, "utf8");
    for (const forbidden of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "R2_SECRET_ACCESS_KEY",
      "sb_secret_",
      ...Object.entries(process.env)
        .filter(
          ([key, v]) =>
            ["SUPABASE_SERVICE_ROLE_KEY", "R2_SECRET_ACCESS_KEY"].includes(
              key,
            ) &&
            v &&
            v.length > 12,
        )
        .map(([, v]) => v),
    ])
      if (js.includes(forbidden))
        throw Error("Private credential indicator in client build");
  }
console.log(
  "Generated metadata for " +
    movies.length +
    " films and checked client bundles.",
);
