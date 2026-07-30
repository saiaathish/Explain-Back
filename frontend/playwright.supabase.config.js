import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/*
 * Real Supabase, locally served frontend. This is not the hosted gate — that
 * still needs a Vercel preview origin, which playwright.hosted.config.js
 * enforces. What this config proves is the browser half of Phases 2 and 3
 * against an actual Supabase project: anonymous sign-in, saved history writes
 * under row-level security, reload survival, and canonical identity linking.
 *
 * The default origin is http://localhost:5173/ because that exact value is the
 * only local entry in the project's redirect allowlist. Set E2E_PORT when that
 * port is already taken; identity linking is then only verified up to the
 * request the browser makes, not through a provider round trip.
 */

function requiredEnv(name, pattern) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. This suite never invents credentials.`);
  }
  if (pattern && !pattern.test(value)) {
    throw new Error(`${name} does not look like the expected value.`);
  }
  return value;
}

const supabaseUrl = requiredEnv(
  "E2E_SUPABASE_URL",
  /^https:\/\/[a-z0-9]+\.supabase\.co$/,
);
const publishableKey = requiredEnv(
  "E2E_SUPABASE_PUBLISHABLE_KEY",
  /^(sb_publishable_|eyJ)/,
);

if (/service[_-]?role|sb_secret_/i.test(publishableKey)) {
  throw new Error("Refusing to run with a Supabase secret or service-role key.");
}

const port = Number(process.env.E2E_PORT || 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error("E2E_PORT must be a valid unprivileged port.");
}
const origin = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.supabase.js",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  reporter: "list",
  outputDir:
    process.env.E2E_OUTPUT_DIR ||
    path.join(os.tmpdir(), "explain-back-playwright-supabase"),
  use: {
    baseURL: `${origin}/`,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "supabase-desktop-chrome" }],
  webServer: {
    command: `npm run dev -- --host localhost --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    },
  },
});
