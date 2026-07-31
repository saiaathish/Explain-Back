import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, signIn, startSession, enterExplanation, submitForAnalysis } from "./fixtures/local-auth.js";

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(E2E_DIR, "..");
const REPO_ROOT = path.resolve(FRONTEND_DIR, "..");
const RESULTS_PATH = path.resolve(
  process.env.TIMING_RESULTS_PATH || path.join(REPO_ROOT, "docs", "timing-sweep-automated.json"),
);
const REVISED_EXPLANATION = fs.readFileSync(
  path.join(FRONTEND_DIR, "public/samples/demo_video_revised.txt"),
  "utf8",
).trim();
const paceMs = Number.parseInt(process.env.TIMING_PACE_MS || "0", 10);

function readRecords() {
  try {
    const parsed = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : parsed.records || [];
  } catch {
    return [];
  }
}

function writeRecord(record) {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  const records = readRecords().filter(
    (current) => !(current.project === record.project && current.run === record.run),
  );
  records.push(record);
  fs.writeFileSync(
    RESULTS_PATH,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2)}\n`,
  );
}

function viewportLabel(testInfo) {
  const viewport = testInfo.project.use.viewport;
  return viewport ? `${viewport.width}x${viewport.height}` : "unknown";
}

test.describe("production demo path", () => {
  test.afterEach(async ({}, testInfo) => {
    const record = testInfo._demoRecord;
    if (!record) return;
    record.status = testInfo.status;
    record.expectedStatus = testInfo.expectedStatus;
    record.durationMs = testInfo.duration;
    record.retry = testInfo.retry;
    writeRecord(record);
  });

  test("biology analysis and revise loop", async ({ page }, testInfo) => {
    const record = {
      project: testInfo.project.name,
      viewport: viewportLabel(testInfo),
      run: Number.parseInt(process.env.TIMING_RUN || "", 10) || testInfo.repeatEachIndex + 1,
      retry: testInfo.retry,
      initialMs: null,
      reviseMs: null,
      initialCounts: null,
      revisedCounts: null,
      assertions: [],
      errors: [],
      status: "unknown",
    };
    testInfo._demoRecord = record;

    if (paceMs > 0) await page.waitForTimeout(paceMs);

    await signIn(page, "/");
    await startSession(page);
    await expect(page.getByRole("button", { name: "Biology", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Biology", exact: true }).click();
    await expect(page.locator(".source-textarea")).toHaveValue(/sodium/i);

    await page.getByRole("button", { name: "Next: explain it back", exact: true }).click();
    await enterExplanation(
      page,
      "The pump uses ATP to move sodium out and potassium in, maintaining concentration gradients across the membrane.",
    );

    const initialStart = Date.now();
    await submitForAnalysis(page);
    try {
      await expect(page.locator(".results")).toBeVisible();
      await expect(page.locator(".diagnostic").first()).toBeVisible();
      record.initialMs = Date.now() - initialStart;
      record.initialCounts = await page.locator(".diagnostic").evaluateAll((nodes) =>
        Object.fromEntries(
          ["green", "yellow", "red", "grey"].map((state) => [
            state,
            nodes.filter((node) => node.classList.contains(`diagnostic--${state}`)).length,
          ]),
        ),
      );
      for (const state of ["yellow", "red"]) {
        const count = await page.locator(`.diagnostic--${state}`).count();
        if (count === 0) {
          record.assertions.push(`initial ${state}: fail`);
          record.errors.push(`initial ${state}: no visible diagnostic span`);
        } else {
          record.assertions.push(`initial ${state}: pass`);
        }
      }
    } catch (error) {
      record.errors.push(`initial overlay: ${error.message}`);
    }

    try {
      await page.getByRole("button", { name: /Explain it again|Revise your explanation/, exact: false }).click();
      await enterExplanation(page, REVISED_EXPLANATION);
      const reviseStart = Date.now();
      await submitForAnalysis(page);
      await expect(page.locator(".diff-strip")).toBeVisible();
      record.reviseMs = Date.now() - reviseStart;
      record.revisedCounts = await page.locator(".diagnostic").evaluateAll((nodes) =>
        Object.fromEntries(
          ["green", "yellow", "red", "grey"].map((state) => [
            state,
            nodes.filter((node) => node.classList.contains(`diagnostic--${state}`)).length,
          ]),
        ),
      );
      const diffText = (await page.locator(".diff-strip").innerText()).toLowerCase();
      if (!(diffText.includes("gap closed") || diffText.includes("coverage"))) {
        record.assertions.push("revision diff wording: fail");
        record.errors.push(`revision diff did not contain gap closed or coverage: ${diffText}`);
      } else {
        record.assertions.push("revision diff wording: pass");
      }
    } catch (error) {
      record.errors.push(`revision path: ${error.message}`);
    }

    if (record.errors.length) throw new Error(record.errors.join("\n"));
  });
});
