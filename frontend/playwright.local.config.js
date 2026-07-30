import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = 4174;
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/*.pw.js", "**/*.local.js"],
  testIgnore: "**/demo-path.pw.js",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  forbidOnly: !!process.env.CI,
  reporter: "list",
  outputDir:
    process.env.E2E_OUTPUT_DIR ||
    path.join(os.tmpdir(), "explain-back-playwright-local"),
  use: {
    baseURL: `${origin}/`,
    localAuthFixture: true,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: `${origin}/__e2e-supabase`,
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_local",
    },
  },
});
