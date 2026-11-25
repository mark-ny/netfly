import { test, expect } from "@playwright/test";
test("discover, filter, save, reload and remove", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The Last Light", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next featured film" }).click();
  await expect(
    page.getByRole("heading", { name: "Blue Hours", exact: true }),
  ).toBeVisible();
  await page.locator(".hero .ghost").click();
  await page
    .getByRole("navigation", { name: "Main" })
    .getByText("Watchlist")
    .click();
  await expect(page.locator(".cardtitle")).toHaveText("Blue Hours");
  await page.reload();
  await expect(page.locator(".cardtitle")).toHaveText("Blue Hours");
  await page.getByRole("button", { name: "Remove Blue Hours" }).click();
  await expect(page.getByText("Your watchlist is empty")).toBeVisible();
  await page.goto("/search");
  await page.getByRole("textbox", { name: "Search films" }).fill("blue");
  await expect(page.locator(".cardtitle")).toHaveText("Blue Hours");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Genre", exact: true })
    .selectOption("African Cinema");
  await expect(page.getByText("No matching films")).toBeVisible();
});
test("player loads HLS, switches quality and captions, persists position and resumes", async ({
  page,
}) => {
  await page.goto("/watch/the-last-light");
  await page.getByRole("button", { name: "Play Video", exact: true }).click();
  const video = page.locator("video");
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
  await page.getByLabel("Quality").selectOption("360");
  await expect(page.getByLabel("Quality")).toHaveValue("360");
  await page.getByRole("button", { name: "Captions", exact: true }).hover();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(
    page
      .locator(".vjs-subs-caps-button [role=menuitemradio]")
      .filter({ hasText: "English" }),
  ).toHaveAttribute("aria-checked", "true");
  await video.evaluate((v) => {
    const el = v as HTMLVideoElement;
    el.currentTime = 8;
    el.pause();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("stillframe:demo:v1") || "{}")
            .progress?.["00000000-0000-4000-8000-000000000001"]?.position,
      ),
    )
    .toBeGreaterThanOrEqual(7);
  await page.goto("/watch/the-last-light");
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((v) => (v as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThanOrEqual(7);
  await page.goto("/history");
  await expect(page.locator(".cardtitle")).toHaveText("The Last Light");
});
test("mobile navigation, metadata, search and fresh offline fallback", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Movies", exact: true }).click();
  await expect(page).toHaveURL(/\/movies$/);
  await page.getByLabel("Details for Blue Hours").click();
  await expect(page).toHaveTitle(/Blue Hours/);
  expect(
    await page.locator('script[type="application/ld+json"]').textContent(),
  ).toContain("Blue Hours");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.goto("/movies");
  await expect(page.getByText("You’re offline")).toBeVisible();
});
test("personal preferences, ratings, report preparation and local export", async ({
  page,
}) => {
  await page.goto("/profile");
  await page.getByLabel("Display name").fill("Cinema guest");
  await page.getByText("Save preferences").click();
  await expect(page.locator("h1")).toHaveText("Cinema guest");
  await page.goto("/movie/above-the-clouds");
  await page.getByLabel("Rate 4 stars").click();
  await expect(page.getByRole("status")).toHaveText("Rating saved");
  await page.goto("/support");
  await page.getByLabel("Details").fill("The stream paused.");
  const report = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  expect((await report).suggestedFilename()).toBe("netfly-report.json");
  await page.goto("/admin");
  await expect(page.getByText(/provisioned staff account/)).toBeVisible();
});

test("browse on a constrained mobile connection without preloading movies", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const devtools = await context.newCDPSession(page);
  await devtools.send("Network.enable");
  await devtools.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 100,
    downloadThroughput: 220000,
    uploadThroughput: 70000,
  });
  const media: string[] = [];
  page.on("request", (request) => {
    if (/\.(ts|m3u8|mp4)$/.test(request.url())) media.push(request.url());
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "The Last Light", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  expect(media).toEqual([]);
  await page.getByRole("link", { name: "Search movies" }).click();
  await page.getByRole("textbox", { name: "Search films" }).fill("ocean");
  await expect(
    page.getByRole("heading", { name: "No matching films" }),
  ).toBeVisible();
});
