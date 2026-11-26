import { test, expect } from "@playwright/test";
// The bundled sample films were removed, so these tests cover the empty,
// no-backend preview: navigation, empty states, local profile and offline fallback.
test("empty preview shows navigation and a clear empty state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("The program is being prepared")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const name of ["Home", "Movies", "New & Popular", "My List"])
    await expect(nav.getByText(name, { exact: true })).toBeVisible();
  await nav.getByText("My List").click();
  await expect(page.getByText("Your list is empty")).toBeVisible();
  await page.goto("/search");
  await page.getByRole("textbox", { name: "Search films" }).fill("blue");
  await expect(page.getByText("No matching films")).toBeVisible();
});
test("unknown film link shows a not-found page", async ({ page }) => {
  await page.goto("/movie/does-not-exist");
  await expect(page.getByText("Page not found")).toBeVisible();
});
test("mobile navigation, no horizontal overflow and offline fallback", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Movies", exact: true }).click();
  await expect(page).toHaveURL(/\/movies$/);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.goto("/movies");
  await expect(page.getByText("You’re offline")).toBeVisible();
});
test("local profile preferences and support report export", async ({ page }) => {
  await page.goto("/profile");
  await page.getByLabel("Display name").fill("Cinema guest");
  await page.getByText("Save preferences").click();
  await expect(page.locator("h1")).toHaveText("Cinema guest");
  await page.goto("/support");
  await page.getByLabel("Details").fill("The stream paused.");
  const report = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  expect((await report).suggestedFilename()).toBe("netfly-report.json");
  await page.goto("/admin");
  await expect(page.getByText(/provisioned staff account/)).toBeVisible();
});
test("series page shows an empty state and hides the nav item without series", async ({ page }) => {
  await page.goto("/series");
  await expect(page.getByText("No series yet")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByText("TV Series")).toHaveCount(0);
  await page.goto("/series/missing");
  await expect(page.getByText("Series not found")).toBeVisible();
});
test("profile picker needs an account", async ({ page }) => {
  await page.goto("/who");
  // Without Supabase the app is in local preview mode, so there is no account to pick a profile for.
  await expect(page).toHaveURL(/\/login/);
});
