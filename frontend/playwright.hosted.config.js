import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const PRODUCTION_FRONTEND = "https://explain-back.vercel.app";
const PRODUCTION_BACKEND = "https://explain-back.onrender.com";
const FRONTEND_PREVIEW_HOST =
  /^explain-back-[a-z0-9-]+-sai-aathish-karthiks-projects\.vercel\.app$/;
const BACKEND_PREVIEW_HOST = /^explain-back-pr-\d+\.onrender\.com$/;

function requiredPreviewUrl(name, productionOrigin, allowedHost) {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    throw new Error(
      `${name} is required. Hosted authentication tests never default to production.`,
    );
  }

  const url = new URL(rawValue);

  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS. Received ${url.origin}.`);
  }

  if (url.origin === productionOrigin) {
    throw new Error(
      `${name} points at production (${productionOrigin}). Use an isolated preview.`,
    );
  }

  if (!allowedHost.test(url.hostname)) {
    throw new Error(
      `${name} must match the isolated Explain-Back preview host pattern. Received ${url.hostname}.`,
    );
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an origin-only URL with a trailing slash.`);
  }

  return url;
}

const frontendUrl = requiredPreviewUrl(
  "E2E_BASE_URL",
  PRODUCTION_FRONTEND,
  FRONTEND_PREVIEW_HOST,
);
const backendUrl = requiredPreviewUrl(
  "E2E_API_URL",
  PRODUCTION_BACKEND,
  BACKEND_PREVIEW_HOST,
);

if (process.env.E2E_CONFIRM_NON_PRODUCTION !== "YES") {
  throw new Error(
    "Set E2E_CONFIRM_NON_PRODUCTION=YES after verifying both preview deployments and SHAs.",
  );
}

if (frontendUrl.origin === backendUrl.origin) {
  throw new Error(
    "E2E_BASE_URL and E2E_API_URL must identify separate frontend and backend previews.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/auth.hosted.js",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  forbidOnly: !!process.env.CI,
  reporter: "list",
  outputDir:
    process.env.E2E_OUTPUT_DIR ||
    path.join(os.tmpdir(), "explain-back-playwright-hosted"),
  use: {
    baseURL: `${frontendUrl.origin}/`,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "hosted-desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
