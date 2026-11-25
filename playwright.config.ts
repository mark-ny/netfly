import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 40000,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:4186",
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4186 --strictPort",
    url: "http://127.0.0.1:4186",
    reuseExistingServer: false,
  },
});
