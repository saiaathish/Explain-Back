import { expect, test, signIn, startSession, enterSource, enterExplanation, submitForAnalysis } from "./fixtures/local-auth.js";

const SOURCE = [
  "Cell membranes preserve concentration gradients with active transport proteins.",
  "The sodium-potassium pump uses ATP-driven shape changes to move sodium out of",
  "the cell and potassium into it, supporting membrane potential and cell function.",
].join(" ");

const INITIAL_EXPLANATION = [
  "The pump uses ATP to move ions.",
  "The gradients support membrane function.",
  "The directions are reversed.",
].join(" ");

const REVISED_EXPLANATION = [
  "The pump uses ATP to move ions.",
  "The gradients support membrane function.",
  "The corrected cycle exports sodium and imports potassium.",
].join(" ");

const FOCUSED_EXPLANATION = [
  "This focused explanation connects ATP to transport.",
  "It describes the shape change clearly.",
].join(" ");

const PRESET_FIXTURES = {
  "/samples/source_sodium_pump.txt": SOURCE,
  "/samples/demo_video.txt": INITIAL_EXPLANATION,
};

function flagsFor(explanation, states, prefix = "claim") {
  const sentences = explanation.match(/[^.]+(?:\.|$)/g) || [];
  return sentences.slice(0, states.length).map((sentence, index) => {
    const text = sentence.trim();
    const start = explanation.indexOf(text);
    const state = states[index];
    return {
      prop_id: `${prefix}-${index + 1}`,
      state,
      start,
      end: start + text.length,
      concept_id: index === 0 ? "energy" : index === 1 ? "gradients" : "outcome",
      anchor: `Source anchor for ${text}`,
      hint: `Strengthen ${text.toLowerCase()}`,
      misconception: state === "red" ? "The transport direction is incorrect." : null,
      refutation: state === "red" ? "Sodium leaves and potassium enters the cell." : null,
    };
  });
}

function anchoredConcept(source, id, label, anchor) {
  const anchorStart = source.indexOf(anchor);
  if (anchorStart < 0) {
    throw new Error(`Fixture anchor not found in source: ${anchor}`);
  }
  return {
    id,
    label,
    anchor,
    anchor_start: anchorStart,
    anchor_end: anchorStart + anchor.length,
  };
}

function analysisResponse(body) {
  if (body.focused) {
    return {
      concepts: [
        anchoredConcept(body.source, "outcome", "Membrane outcome", body.source),
      ],
      flags: flagsFor(body.explanation, ["yellow"], "focused"),
      follow_up: "Connect the shape change to the ion movement.",
      coverage: { covered: [], partial: ["outcome"], missing: [] },
    };
  }

  const revised = body.explanation.includes("corrected cycle");
  return {
    concepts: [
      anchoredConcept(body.source, "energy", "ATP energy", "ATP-driven shape changes"),
      anchoredConcept(
        body.source,
        "gradients",
        "Ion gradients",
        "concentration gradients",
      ),
      anchoredConcept(
        body.source,
        "outcome",
        "Membrane outcome",
        "membrane potential and cell function",
      ),
    ],
    flags: flagsFor(
      body.explanation,
      revised ? ["green", "green", "yellow"] : ["green", "yellow", "red"],
    ),
    follow_up: "Explain how ATP-driven transport supports membrane potential.",
    coverage: revised
      ? { covered: ["energy", "gradients"], partial: ["outcome"], missing: [] }
      : { covered: ["energy"], partial: ["gradients"], missing: ["outcome"] },
  };
}

async function installImmediateAnalysis(page) {
  await page.route("**/api/analyze", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(analysisResponse(body)),
    });
  });
}

async function installControlledAnalysis(page) {
  const calls = [];
  await page.route("**/api/analyze", async (route) => {
    const body = route.request().postDataJSON();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const call = { body, release };
    calls.push(call);
    await gate;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(analysisResponse(body)),
    });
  });

  return {
    async next(index) {
      await expect.poll(() => calls.length, { timeout: 3_000 }).toBeGreaterThan(index);
      return calls[index];
    },
  };
}

async function installPausedBiologyPreset(page) {
  const requests = [];
  await page.route(/\/samples\/(?:source_sodium_pump|demo_video)\.txt(?:\?.*)?$/, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    requests.push({ pathname, release });
    await gate;
    await route.fulfill({
      contentType: "text/plain",
      body: PRESET_FIXTURES[pathname],
    });
  });

  return {
    async releaseBatch(start) {
      await expect.poll(() => requests.length, { timeout: 3_000 }).toBe(start + 1);
      requests.slice(start, start + 1).forEach(({ release }) => release());
    },
  };
}

async function installInteractionInstrumentation(page) {
  await page.addInitScript(() => {
    window.__interactivityCalls = [];
    window.__animationEvents = [];
    const nativeFocus = HTMLElement.prototype.focus;
    const nativeScrollIntoView = HTMLElement.prototype.scrollIntoView;

    HTMLElement.prototype.focus = function instrumentedFocus(options) {
      window.__interactivityCalls.push({
        kind: "focus",
        id: this.id,
        classes: Array.from(this.classList),
        options: options || null,
      });
      return nativeFocus.call(this, options);
    };

    HTMLElement.prototype.scrollIntoView = function instrumentedScroll(options) {
      window.__interactivityCalls.push({
        kind: "scroll",
        id: this.id,
        classes: Array.from(this.classList),
        options: options || null,
      });
      return nativeScrollIntoView?.call(this, options);
    };

    document.addEventListener(
      "animationstart",
      (event) => {
        if (!(event.target instanceof Element)) return;
        const target = event.target;
        const results = target.closest(".results");
        let kind = "";
        let ordinal = -1;
        if (target.matches(".result-group--concepts > h2")) kind = "concepts";
        if (target.matches(".result-group--overlay")) kind = "overlay";
        if (target.matches(".result-group--forward")) kind = "forward";
        if (target.matches(".result-region--overlay > .overlay .diagnostic")) {
          kind = "diagnostic";
          ordinal = Array.from(
            target.parentElement?.querySelectorAll(".diagnostic") || [],
          ).indexOf(target);
        }
        if (target.matches(".focused-result .diagnostic")) {
          kind = "focused-diagnostic";
          ordinal = Array.from(
            target.parentElement?.querySelectorAll(".diagnostic") || [],
          ).indexOf(target);
        }
        if (!kind) return;
        window.__animationEvents.push({
          animationName: event.animationName,
          at: performance.now(),
          kind,
          ordinal,
          run: results?.dataset.resultRun || null,
        });
      },
      true,
    );
  });
}

async function installFakeRecording(page) {
  await page.addInitScript(() => {
    const stream = {
      getTracks: () => [{ stop() {} }],
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => stream,
      },
    });
    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      constructor() {
        this.mimeType = "audio/webm";
        this.state = "inactive";
      }

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        queueMicrotask(() => this.onstop?.());
      }
    }
    window.MediaRecorder = FakeMediaRecorder;
  });
}

async function fillSubmission(page, explanation = INITIAL_EXPLANATION) {
  await startSession(page);
  await enterSource(page, SOURCE);
  await enterExplanation(page, explanation);
}

async function submitImmediately(page) {
  await fillSubmission(page);
  await submitForAnalysis(page);
  await expect(page.locator(".results")).toBeVisible();
}

async function resolvedColor(locator, variable) {
  return locator.evaluate((element, name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    element.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, variable);
}

function colorChannels(value) {
  const srgb = value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/);
  if (srgb) return srgb.slice(1).map((channel) => Number(channel).toFixed(5));

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgb) {
    return rgb
      .slice(1)
      .map((channel) => (Number(channel) / 255).toFixed(5));
  }
  throw new Error(`Unsupported computed color serialization: ${value}`);
}

async function settledColor(locator) {
  return locator.evaluate(async (element) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 180));
    const read = () => getComputedStyle(element).color;
    let previous = read();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      const current = read();
      if (current === previous) return current;
      previous = current;
    }
    return previous;
  });
}

test.describe("interactivity pass", () => {
  test.describe.configure({ timeout: 45_000 });

  test("preset loading is local to the selected chip and edits clear selection", async ({
    page,
  }) => {
    const preset = await installPausedBiologyPreset(page);
    await signIn(page, "/");
    await startSession(page);

    const biology = page.locator(".preset-button").first();
    const economics = page.getByRole("button", { name: "Economics", exact: true });
    const photosynthesis = page.getByRole("button", {
      name: "Photosynthesis",
      exact: true,
    });
    await expect(biology).toHaveAttribute("aria-pressed", "false");
    await biology.click();
    await expect(biology).toBeVisible();
    await expect(biology).toHaveText("Loading...");
    await expect(biology).toHaveAccessibleName("Loading Biology…");
    await expect(page.getByRole("button", { name: /^Loading .+…$/ })).toHaveCount(1);
    await expect(page.locator('.preset-button[aria-label^="Loading "]')).toHaveCount(1);
    await expect(economics).toHaveText("Economics");
    await expect(economics).toHaveAccessibleName("Economics");
    await expect(photosynthesis).toHaveText("Photosynthesis");
    await expect(photosynthesis).toHaveAccessibleName("Photosynthesis");
    await expect(economics).toBeDisabled();
    await expect(photosynthesis).toBeDisabled();
    await preset.releaseBatch(0);

    const loadedBiology = page.getByRole("button", { name: "Biology", exact: true });
    await expect(loadedBiology).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".source-textarea")).toHaveValue(SOURCE);

    await page.locator(".source-textarea").fill(`${SOURCE} Edited.`);
    await expect(loadedBiology).toHaveAttribute("aria-pressed", "false");
    await loadedBiology.click();
    await preset.releaseBatch(1);
    await expect(loadedBiology).toHaveAttribute("aria-pressed", "true");
  });

  test("character counters interpolate visually without becoming live regions", async ({
    page,
  }) => {
    await signIn(page, "/");
    await startSession(page);
    await enterSource(page, SOURCE);
    const explanation = page.locator("#explanation");
    const counter = page.locator(".field--explanation .character-counter");
    const understood = await resolvedColor(counter, "--understood");
    const amber = await resolvedColor(counter, "--unjustified");
    const inkSoft = await resolvedColor(counter, "--ink-soft");

    const emptyColor = await settledColor(counter);
    expect(colorChannels(emptyColor)).toEqual(colorChannels(inkSoft));

    await explanation.fill("x".repeat(20));
    const halfwayColor = await settledColor(counter);
    expect(colorChannels(halfwayColor)).not.toEqual(colorChannels(inkSoft));
    expect(colorChannels(halfwayColor)).not.toEqual(colorChannels(understood));

    await explanation.fill("x".repeat(39));
    const nearlyHealthyColor = await settledColor(counter);
    expect(colorChannels(nearlyHealthyColor)).not.toEqual(colorChannels(inkSoft));
    expect(colorChannels(nearlyHealthyColor)).not.toEqual(colorChannels(understood));
    expect(colorChannels(nearlyHealthyColor)).not.toEqual(colorChannels(halfwayColor));

    await explanation.fill("x".repeat(40));
    await expect(counter).toHaveClass(/is-healthy/);
    await expect.poll(async () => colorChannels(await settledColor(counter))).toEqual(
      colorChannels(understood),
    );

    await explanation.fill("x".repeat(3_599));
    await expect(counter).toHaveClass(/is-healthy/);
    await expect(counter).not.toHaveClass(/is-warning/);
    await expect.poll(async () => colorChannels(await settledColor(counter))).toEqual(
      colorChannels(understood),
    );

    await explanation.fill("x".repeat(3_600));
    await expect(counter).toHaveClass(/is-warning/);
    await expect.poll(async () => colorChannels(await settledColor(counter))).toEqual(
      colorChannels(amber),
    );
    await expect(counter).toHaveText("Near limit — 3600 / 4,000 characters");
    await expect(counter).not.toHaveAttribute("aria-live", /.+/);
    await expect(counter).not.toHaveAttribute("role", /.+/);
  });

  test("existing button names remain concise and stable", async ({ page }) => {
    await signIn(page, "/");
    await startSession(page);
    await expect(page.locator(".source-tools button")).toHaveAccessibleName(
      "Add image source",
      { timeout: 3_000 },
    );
    for (const name of [
      "Biology",
      "Economics",
      "Photosynthesis",
    ]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
  });

  test("focused drill-down reveals immediately", async ({ page }) => {
    await installInteractionInstrumentation(page);
    await installImmediateAnalysis(page);
    await signIn(page, "/");
    await submitImmediately(page);
    await page.getByRole("button", { name: "Membrane outcome", exact: true }).click();
    await page.locator(".drill-down textarea").fill(FOCUSED_EXPLANATION);
    const animationEventStart = await page.evaluate(() => window.__animationEvents.length);
    await page.getByRole("button", { name: "Check this concept", exact: true }).click();

    const focused = page.locator(".focused-result");
    await expect(focused).toBeVisible();
  });
});
