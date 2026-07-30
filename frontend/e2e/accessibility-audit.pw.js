import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures/local-auth.js";
import AxeBuilder from "@axe-core/playwright";

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(E2E_DIR, "..");
const REPO_ROOT = path.resolve(FRONTEND_DIR, "..");
const REPORT_PATH = path.join(REPO_ROOT, "docs", "accessibility-audit.json");
const REVISED_EXPLANATION = fs.readFileSync(
  path.join(REPO_ROOT, "samples/explanations/06_correct.txt"),
  "utf8",
).trim();

function readReport() {
  try {
    const parsed = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : parsed.records || [];
  } catch {
    return [];
  }
}

function writeReport(record) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const records = readReport().filter(
    (current) => !(current.project === record.project && current.viewport === record.viewport),
  );
  records.push(record);
  fs.writeFileSync(
    REPORT_PATH,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2)}\n`,
  );
}

async function mockAnalysis(page) {
  await page.route("**/api/analyze", async (route) => {
    const explanation = route.request().postDataJSON().explanation;
    const flags = [];
    const addFlag = (prop_id, state, text, anchor, hint, extra = {}) => {
      const start = explanation.indexOf(text);
      if (start < 0) return;
      flags.push({ prop_id, state, start, end: start + text.length, anchor, hint, similarity: state === "red" ? 0.2 : 0.8, ...extra });
    };
    addFlag(
      "audit-yellow",
      "yellow",
      "The pump exports three sodium ions and imports two potassium ions per cycle.",
      "Three sodium ions leave while two potassium ions enter.",
      "Add the ATP-driven shape change.",
    );
    addFlag(
      "audit-red",
      "red",
      "It moves three potassium ions out of the cell and two sodium ions into the cell.",
      "Three sodium ions leave while two potassium ions enter.",
      "Reverse the ion directions and numbers.",
      { misconception: "The ion directions are reversed.", refutation: "The pump exports sodium and imports potassium." },
    );
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        concepts: [{ id: "transport", label: "Active transport", anchor: "The pump uses ATP." }],
        flags,
        follow_up: "Explain why ATP is necessary.",
        coverage: { covered: [], partial: ["transport"], missing: [] },
      }),
    });
  });
}

async function axeState(page, state) {
  try {
    await page.evaluate(async () => {
      const animations = document
        .getAnimations()
        .filter((animation) => {
          const endTime = animation.effect?.getComputedTiming().endTime;
          return animation.playState !== "finished" && Number.isFinite(endTime);
        });
      await Promise.allSettled(animations.map((animation) => animation.finished));
    });
    const result = await new AxeBuilder({ page }).analyze();
    return {
      state,
      status: "complete",
      violations: result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          html: node.html,
          failureSummary: node.failureSummary,
        })),
      })),
    };
  } catch (error) {
    return { state, status: "failed", error: error.message, violations: [] };
  }
}

async function contrastState(page, phase) {
  return page.locator(".diagnostic").evaluateAll((nodes, currentPhase) => {
    const parse = (value) => {
      const match = value.match(/rgba?\\(([^)]+)\\)/);
      if (!match) return null;
      const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
      if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
      return [parts[0], parts[1], parts[2]];
    };
    const luminance = (rgb) => {
      if (!rgb) return null;
      const channels = rgb.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const ratio = (foreground, background) => {
      const fg = luminance(foreground);
      const bg = luminance(background);
      if (fg == null || bg == null) return null;
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    };
    const pageBackground = parse(getComputedStyle(document.body).backgroundColor);
    return ["green", "yellow", "red", "grey"].map((state) => {
      const node = nodes.find((candidate) => candidate.classList.contains(`diagnostic--${state}`));
      if (!node) return { phase: currentPhase, state, available: false };
      const style = getComputedStyle(node);
      const foreground = parse(style.color);
      const wash = parse(style.backgroundColor);
      return {
        phase: currentPhase,
        state,
        available: true,
        foreground: style.color,
        wash: style.backgroundColor,
        pageBackground: getComputedStyle(document.body).backgroundColor,
        textOnWash: ratio(foreground, wash),
        textOnPage: ratio(foreground, pageBackground),
        underThreshold: [ratio(foreground, wash), ratio(foreground, pageBackground)].some(
          (value) => value != null && value < 4.5,
        ),
      };
    });
  }, phase);
}

async function activeElement(page) {
  return page.evaluate(() => ({
    tag: document.activeElement?.tagName || "",
    id: document.activeElement?.id || "",
    text: (document.activeElement?.innerText || document.activeElement?.getAttribute("aria-label") || "").slice(0, 120),
  }));
}

async function keyboardWalkthrough(page, record) {
  const steps = [];
  const note = (action, extra = {}) => steps.push({ action, ...extra });
  await page.goto("/");
  await page.getByRole("button", { name: "Try it", exact: true }).click();
  await page.keyboard.press("Tab");
  let presetFocused = false;
  for (let index = 0; index < 40; index += 1) {
    const focus = await activeElement(page);
    note("Tab", { focus });
    if (focus.text === "Biology") {
      await page.keyboard.press("Enter");
      note("Enter Biology", { focus: await activeElement(page) });
      presetFocused = true;
      break;
    }
    await page.keyboard.press("Tab");
  }
  if (!presetFocused) {
    record.keyboard = { status: "failed", steps, error: "Biology preset was not reachable with Tab" };
    return;
  }
  await expect(page.locator("#explanation")).not.toHaveValue("");
  for (let index = 0; index < 60; index += 1) {
    const focus = await activeElement(page);
    if (focus.text === "Check my explanation") {
      await page.keyboard.press("Enter");
      note("Enter analysis", { focus: await activeElement(page) });
      break;
    }
    await page.keyboard.press("Tab");
    note("Tab", { focus: await activeElement(page) });
  }
  await expect(page.locator(".results")).toBeVisible();
  await page.keyboard.press("Tab");
  let openedFlag = false;
  for (let index = 0; index < 80; index += 1) {
    const focus = await activeElement(page);
    note("Tab", { focus });
    if (focus.tag === "SPAN" && focus.id === "") {
      await page.keyboard.press("Enter");
      note("Enter diagnostic", { focus: await activeElement(page) });
      openedFlag = true;
      await page.keyboard.press("Escape");
      note("Escape diagnostic", { focus: await activeElement(page) });
      break;
    }
    await page.keyboard.press("Tab");
  }
  for (let index = 0; index < 100; index += 1) {
    const focus = await activeElement(page);
    if (focus.text === "Revise your explanation") {
      await page.keyboard.press("Enter");
      note("Enter revise", { focus: await activeElement(page) });
      break;
    }
    await page.keyboard.press("Tab");
  }
  const revision = page.locator("#revision-explanation");
  if (await revision.isVisible()) {
    await revision.focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(REVISED_EXPLANATION);
    note("Type revision", { focus: await activeElement(page) });
    await page.keyboard.press("Tab");
    for (let index = 0; index < 10; index += 1) {
      const focus = await activeElement(page);
      if (focus.text === "Check my revision") {
        await page.keyboard.press("Enter");
        note("Enter revision", { focus: await activeElement(page) });
        break;
      }
      await page.keyboard.press("Tab");
    }
    await expect(page.locator(".diff-strip")).toBeVisible();
  }
  record.keyboard = {
    status: openedFlag ? "complete" : "partial",
    steps,
    error: openedFlag ? null : "No diagnostic span was reached with keyboard focus",
  };
}

test("accessibility states, keyboard walkthrough, and contrast", async ({ page }, testInfo) => {
  const viewport = testInfo.project.use.viewport;
  const record = {
    project: testInfo.project.name,
    viewport: viewport ? `${viewport.width}x${viewport.height}` : "unknown",
    axe: [],
    contrast: [],
    keyboard: null,
    errors: [],
  };
  await mockAnalysis(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Try it", exact: true }).click();
  record.axe.push(await axeState(page, "empty"));
  await page.getByRole("button", { name: "Biology", exact: true }).click();
  await expect(page.locator("#explanation")).not.toHaveValue("");
  record.axe.push(await axeState(page, "preset-loaded"));
  await page.getByRole("button", { name: "Check my explanation", exact: true }).click();
  await expect(page.locator(".results")).toBeVisible();
  record.axe.push(await axeState(page, "analyzed"));
  record.axe.push(await axeState(page, "calibration-map-visible"));
  record.contrast.push(...(await contrastState(page, "initial")));
  await page.getByRole("button", { name: "Revise your explanation", exact: true }).click();
  record.axe.push(await axeState(page, "revising"));
  const missing = page.locator(".concept-action").first();
  if (await missing.count()) {
    await missing.click();
    record.axe.push(await axeState(page, "drill-down-open"));
  } else {
    record.axe.push({ state: "drill-down-open", status: "unavailable", violations: [], error: "No missing concept button rendered" });
  }
  await page.locator("#revision-explanation").fill(REVISED_EXPLANATION);
  await page.getByRole("button", { name: "Check my revision", exact: true }).click();
  await expect(page.locator(".diff-strip")).toBeVisible();
  record.contrast.push(...(await contrastState(page, "revised")));
  await page.getByRole("button", { name: "Past sessions", exact: true }).click();
  await expect(page.locator(".history-view")).toBeVisible();
  const history = await axeState(page, "saved-history");
  record.axe.push(history);
  expect(history.status).toBe("complete");
  expect(history.violations).toEqual([]);
  await page.getByRole("button", { name: "Back to workspace", exact: true }).click();
  await expect(page.locator(".results")).toBeVisible();
  if (testInfo.project.name === "desktop-chrome") {
    try {
      await keyboardWalkthrough(page, record);
    } catch (error) {
      record.keyboard = { status: "failed", steps: [], error: error.message };
    }
  } else {
    record.keyboard = { status: "not-run", steps: [], error: "Run on desktop project only" };
  }
  writeReport(record);
});
