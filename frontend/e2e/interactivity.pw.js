import { expect, test } from "@playwright/test";

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
      await expect.poll(() => requests.length, { timeout: 3_000 }).toBe(start + 2);
      requests.slice(start, start + 2).forEach(({ release }) => release());
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
  await page.locator(".source-textarea").fill(SOURCE);
  await page.locator("#explanation").fill(explanation);
}

async function submitImmediately(page) {
  await fillSubmission(page);
  await page.getByRole("button", { name: "Check my explanation", exact: true }).click();
  await expect(page.locator(".results")).toBeVisible();
}

async function observeSubmitSequence(button, idleLabel) {
  await button.evaluate((element) => {
    window.__submitLabelEvents = [];
    window.__submitLabelObserver?.disconnect();
    const record = () => {
      const label = element.textContent.trim();
      const previous = window.__submitLabelEvents.at(-1);
      if (!previous || previous.label !== label) {
        window.__submitLabelEvents.push({ label, at: performance.now() });
      }
    };
    window.__submitLabelObserver = new MutationObserver(record);
    window.__submitLabelObserver.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    record();
  });

  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveText("Reading the source", { timeout: 3_000 });
  await expect.poll(() => button.textContent(), { timeout: 2_000 }).toBe("Comparing your words");
  await expect.poll(() => button.textContent(), { timeout: 2_000 }).toBe("Almost there.");

  const events = await button.evaluate(() => window.__submitLabelEvents);
  const relevant = events.filter(({ label }) =>
    [
      idleLabel,
      "Reading the source",
      "Comparing your words",
      "Almost there.",
    ].includes(label),
  );
  expect(relevant.map(({ label }) => label)).toEqual([
    idleLabel,
    "Reading the source",
    "Comparing your words",
    "Almost there.",
  ]);

  const reading = relevant.find(({ label }) => label === "Reading the source");
  const comparing = relevant.find(({ label }) => label === "Comparing your words");
  const almost = relevant.find(({ label }) => label === "Almost there.");
  for (const cadence of [comparing.at - reading.at, almost.at - comparing.at]) {
    expect(cadence).toBeGreaterThanOrEqual(720);
    expect(cadence).toBeLessThanOrEqual(1_200);
  }

  const stages = button.page().locator(".stages");
  await expect(stages).not.toHaveAttribute("aria-live", /.+/);
  await expect(stages.locator("li.active")).toContainText("Almost there.");
  const status = button.page().locator('.sr-only[role="status"]');
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(status).toHaveText("Almost there.");
  await button.page().waitForTimeout(900);
  await expect(button).toBeDisabled();
  await expect(button).toHaveText("Almost there.");
}

async function expectResultFocusThenScroll(page, behavior) {
  const calls = await page.evaluate(() => window.__interactivityCalls);
  const focusIndex = calls.findIndex(
    (call) => call.kind === "focus" && call.classes.includes("results"),
  );
  const scrollIndex = calls.findIndex(
    (call) => call.kind === "scroll" && call.classes.includes("result-region--overlay"),
  );
  expect(focusIndex).toBeGreaterThanOrEqual(0);
  expect(scrollIndex).toBeGreaterThan(focusIndex);
  expect(calls[focusIndex].options).toMatchObject({ preventScroll: true });
  expect(calls[scrollIndex].options).toMatchObject({ block: "start", behavior });
}

function milliseconds(value) {
  const first = value.split(",")[0].trim();
  return first.endsWith("ms") ? Number.parseFloat(first) : Number.parseFloat(first) * 1_000;
}

function durationsAreZero(value) {
  return value
    .split(",")
    .map((duration) => milliseconds(duration))
    .every((duration) => duration === 0);
}

async function expectNoMotion(locator, pseudo = null) {
  const motion = await locator.evaluate(
    (element, pseudoElement) => {
      const style = getComputedStyle(element, pseudoElement);
      return {
        animationName: style.animationName,
        transitionDuration: style.transitionDuration,
      };
    },
    pseudo,
  );
  expect(motion.animationName.split(",").every((name) => name.trim() === "none")).toBe(true);
  expect(durationsAreZero(motion.transitionDuration)).toBe(true);
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

async function expectMainRevealOrdering(page, run) {
  const timings = await page.locator(".results").evaluate((results) => {
    const animation = (selector, name = "result-enter") => {
      const match = results
        .querySelector(selector)
        .getAnimations()
        .find((candidate) => candidate.animationName === name);
      if (!match) return null;
      const timing = match.effect.getTiming();
      return {
        delay: Number(timing.delay),
        duration: Number(timing.duration),
        name: match.animationName,
      };
    };
    return {
      concepts: animation(".result-region--concepts > h2"),
      overlay: animation(".result-region--overlay", "result-overlay-enter"),
      forward: animation(".result-region--forward"),
    };
  });
  expect(timings.concepts).toMatchObject({ name: "result-enter", delay: 0 });
  expect(timings.overlay).toMatchObject({
    name: "result-overlay-enter",
    delay: 300,
  });
  expect(timings.forward).toMatchObject({ name: "result-enter", delay: 700 });

  const diagnosticTimings = await page
    .locator(".result-region--overlay > .overlay .diagnostic")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const animation = node
          .getAnimations()
          .find((candidate) => candidate.animationName === "wash-in");
        if (!animation) return null;
        const timing = animation.effect.getTiming();
        return {
          delay: Number(timing.delay),
          duration: Number(timing.duration),
          name: animation.animationName,
        };
      }),
    );
  expect(diagnosticTimings).toHaveLength(3);
  expect(diagnosticTimings.every((timing) => timing?.name === "wash-in")).toBe(true);
  const diagnosticDelays = diagnosticTimings.map(({ delay }) => delay);
  expect(diagnosticDelays[0]).toBe(300);
  expect(diagnosticDelays.at(-1)).toBe(700);
  expect(diagnosticDelays).toEqual([...diagnosticDelays].sort((a, b) => a - b));
  expect(diagnosticDelays.every((delay) => delay >= 300 && delay <= 700)).toBe(true);

  await expect
    .poll(
      () =>
        page.evaluate(
          (runId) =>
            window.__animationEvents.some(
              (event) =>
                event.run === String(runId) &&
                event.kind === "forward" &&
                event.animationName === "result-enter",
            ),
          run,
        ),
      { timeout: 3_000 },
    )
    .toBe(true);
  const events = await page.evaluate(
    (runId) => window.__animationEvents.filter((event) => event.run === String(runId)),
    run,
  );
  const eventFor = (kind, animationName = "result-enter") =>
    events.find(
      (event) => event.kind === kind && event.animationName === animationName,
    );
  const concepts = eventFor("concepts");
  const overlay = eventFor("overlay", "result-overlay-enter");
  const forward = eventFor("forward");
  expect(concepts).toBeTruthy();
  expect(overlay).toBeTruthy();
  expect(forward).toBeTruthy();
  expect(concepts.at).toBeLessThanOrEqual(overlay.at);
  expect(overlay.at).toBeLessThanOrEqual(forward.at);

  const diagnosticEvents = events
    .filter((event) => event.kind === "diagnostic" && event.animationName === "wash-in")
    .sort((left, right) => left.ordinal - right.ordinal);
  expect(diagnosticEvents).toHaveLength(3);
  expect(diagnosticEvents.map(({ ordinal }) => ordinal)).toEqual([0, 1, 2]);
  expect(diagnosticEvents.map(({ at }) => at)).toEqual(
    [...diagnosticEvents].map(({ at }) => at).sort((left, right) => left - right),
  );
}

async function expectDiagnosticDisclosure(page, projectName) {
  const diagnostic = page
    .locator(".result-region--overlay > .overlay .diagnostic:not(.diagnostic--green)")
    .first();
  await expect(diagnostic).toHaveAttribute("role", "button");
  await expect(diagnostic).toHaveAttribute("tabindex", "0");
  await expect(diagnostic).toHaveAttribute("aria-expanded", "false");
  const tooltipId = await diagnostic.getAttribute("aria-controls");
  expect(tooltipId).toBeTruthy();
  const tooltip = page.locator(`#${tooltipId}`);
  await expect(tooltip).toHaveAttribute("role", "tooltip");
  await expect(tooltip).toBeHidden();

  if (projectName === "desktop-chrome") {
    await diagnostic.hover();
    await expect(tooltip).toBeVisible();
    await expect(diagnostic).toHaveAttribute("aria-expanded", "true");
    await expect(diagnostic).toHaveAttribute("aria-describedby", tooltipId);
    const connector = await tooltip.evaluate(
      (element) => getComputedStyle(element, "::before").borderTopWidth,
    );
    expect(Number.parseFloat(connector)).toBeGreaterThanOrEqual(1);
    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();
    await expect(diagnostic).toHaveAttribute("aria-expanded", "false");
  } else {
    await diagnostic.tap();
    await expect(tooltip).toBeVisible();
    await expect(diagnostic).toHaveAttribute("aria-expanded", "true");
    await expect(diagnostic).toHaveAttribute("aria-describedby", tooltipId);
    await diagnostic.tap();
    await expect(tooltip).toBeHidden();
    await expect(diagnostic).toHaveAttribute("aria-expanded", "false");
  }

  await diagnostic.focus();
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await expect(diagnostic).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(tooltip).toBeVisible();
  await expect(diagnostic).toHaveAttribute("aria-expanded", "true");
  await expect(diagnostic).toHaveAttribute("aria-describedby", tooltipId);
  await page.keyboard.press(" ");
  await expect(tooltip).toBeHidden();
  await expect(diagnostic).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await expect(diagnostic).toHaveAttribute("aria-expanded", "false");
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

test.describe("interactivity pass", () => {
  test.describe.configure({ timeout: 45_000 });

  test("preset loading is local to the selected chip and edits clear selection", async ({
    page,
  }) => {
    const preset = await installPausedBiologyPreset(page);
    await page.goto("/");

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
    await expect(page.locator("#explanation")).toHaveValue(INITIAL_EXPLANATION);

    await page.locator(".source-textarea").fill(`${SOURCE} Edited.`);
    await expect(loadedBiology).toHaveAttribute("aria-pressed", "false");
    await loadedBiology.click();
    await preset.releaseBatch(2);
    await expect(loadedBiology).toHaveAttribute("aria-pressed", "true");
    await page.locator("#explanation").fill(`${INITIAL_EXPLANATION} Edited.`);
    await expect(loadedBiology).toHaveAttribute("aria-pressed", "false");
  });

  test("character counters interpolate visually without becoming live regions", async ({
    page,
  }) => {
    await page.goto("/");
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
    await page.goto("/");
    await expect(page.locator(".source-tools button")).toHaveAccessibleName(
      "Add image source",
      { timeout: 3_000 },
    );
    for (const name of [
      "Biology",
      "Economics",
      "Photosynthesis",
      "Check my explanation",
    ]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
  });

  test("both submits keep exact staged copy, replay result reveal, and disclose diagnostics", async ({
    page,
  }, testInfo) => {
    await installInteractionInstrumentation(page);
    const analysis = await installControlledAnalysis(page);
    await page.goto("/");
    await fillSubmission(page);

    for (const name of ["Biology", "Economics", "Photosynthesis", "Check my explanation"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }

    await expect(
      page.getByRole("button", { name: "Check my explanation", exact: true }),
    ).toBeVisible();
    const initialButton = page.locator("#workspace-form > button.primary");
    await observeSubmitSequence(initialButton, "Check my explanation");
    const initialCall = await analysis.next(0);
    initialCall.release();
    await expect(page.locator(".results")).toBeVisible();
    await expect(page.locator(".results")).toHaveAttribute("data-result-run", "1");
    await expect(initialButton).toBeEnabled();
    await expect(initialButton).toHaveText("Check my explanation");
    await expectResultFocusThenScroll(page, "smooth");
    await expectMainRevealOrdering(page, 1);
    await expectDiagnosticDisclosure(page, testInfo.project.name);

    await expect(
      page.getByRole("button", { name: "Revise your explanation", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Revise your explanation", exact: true }).click();
    await page.locator("#revision-explanation").fill(REVISED_EXPLANATION);
    await page.evaluate(() => {
      window.__interactivityCalls = [];
    });

    await expect(
      page.getByRole("button", { name: "Check my revision", exact: true }),
    ).toBeVisible();
    const revisionButton = page.locator(".revise-panel > button.primary");
    await observeSubmitSequence(revisionButton, "Check my revision");
    const revisionCall = await analysis.next(1);
    revisionCall.release();
    await expect(page.locator(".results")).toHaveAttribute("data-result-run", "2");
    await expect(page.locator(".diff-strip")).toBeVisible();
    await expect(revisionButton).toHaveCount(0);
    await expectResultFocusThenScroll(page, "smooth");
    await expectMainRevealOrdering(page, 2);
    const improved = page.locator(
      ".result-region--overlay > .overlay .diagnostic.hl-improved",
    );
    await expect(improved).toHaveCount(1);
    const settleTimings = await improved.evaluateAll((nodes) =>
      nodes.map((node) => {
        const animation = node
          .getAnimations()
          .find((candidate) => candidate.animationName === "settle");
        if (!animation) return null;
        const timing = animation.effect.getTiming();
        return {
          delay: Number(timing.delay),
          duration: Number(timing.duration),
          name: animation.animationName,
        };
      }),
    );
    expect(settleTimings.every((timing) => timing?.name === "settle")).toBe(true);
    expect(settleTimings.every(({ delay }) => delay >= 300 && delay <= 700)).toBe(true);
    expect(settleTimings.every(({ duration }) => duration === 600)).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__animationEvents.filter(
              (event) =>
                event.run === "2" &&
                event.kind === "diagnostic" &&
                event.animationName === "settle",
            ).length,
        ),
      )
      .toBe(1);
  });

  test("focused drill-down reveals immediately", async ({ page }) => {
    await installInteractionInstrumentation(page);
    await installImmediateAnalysis(page);
    await page.goto("/");
    await submitImmediately(page);
    await page.getByRole("button", { name: "Membrane outcome", exact: true }).click();
    await page.locator(".drill-down textarea").fill(FOCUSED_EXPLANATION);
    const animationEventStart = await page.evaluate(() => window.__animationEvents.length);
    await page.getByRole("button", { name: "Check this concept", exact: true }).click();

    const focused = page.locator(".focused-result");
    await expect(focused).toBeVisible();
    const timings = await focused.locator(".diagnostic").evaluateAll((nodes) =>
      nodes.map((node) => {
        const animation = node
          .getAnimations()
          .find((candidate) => candidate.animationName === "wash-in");
        if (!animation) return null;
        const timing = animation.effect.getTiming();
        return {
          delay: Number(timing.delay),
          name: animation.animationName,
        };
      }),
    );
    expect(timings).not.toHaveLength(0);
    expect(timings.every((timing) => timing?.name === "wash-in")).toBe(true);
    expect(timings.every(({ delay }) => delay === 0)).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          (start) =>
            window.__animationEvents
              .slice(start)
              .filter(
                (event) =>
                  event.kind === "focused-diagnostic" &&
                  event.animationName === "wash-in",
              ).length,
          animationEventStart,
        ),
      )
      .toBe(timings.length);
  });

  test("focus rings and reduced motion disable every representative motion family", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFakeRecording(page);
    await installInteractionInstrumentation(page);
    await installImmediateAnalysis(page);
    await page.goto("/");

    const submit = page.getByRole("button", {
      name: "Check my explanation",
      exact: true,
    });
    await submit.focus();
    await expect(submit).toBeFocused();
    await expect.poll(() => submit.evaluate((element) => element.matches(":focus-visible"))).toBe(
      true,
    );
    const ring = await submit.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.outlineColor,
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth),
        transitionDurations: style.transitionDuration.split(",").map((value) => value.trim()),
      };
    });
    expect(ring.color).toBe(await resolvedColor(submit, "--understood"));
    expect(ring.style).toBe("solid");
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(ring.transitionDurations.every((duration) => milliseconds(duration) === 0)).toBe(true);

    await expectNoMotion(page.locator("header"), "::after");
    await expectNoMotion(page.locator(".character-counter").first());
    await expectNoMotion(page.locator(".preset-button").first());
    await expectNoMotion(submit);

    const record = page.getByRole("button", {
      name: "Record explanation",
      exact: true,
    });
    await record.click();
    const recordingIndicator = page.locator(".voice-button.is-recording .voice-indicator");
    await expect(recordingIndicator).toBeVisible();
    await expectNoMotion(recordingIndicator);

    await page.reload();
    await fillSubmission(page);
    const reloadedSubmit = page.getByRole("button", {
      name: "Check my explanation",
      exact: true,
    });
    await reloadedSubmit.click();
    await expect(page.locator(".results")).toBeVisible();
    await expectResultFocusThenScroll(page, "auto");

    for (const selector of [
      ".result-group--concepts > h2",
      ".result-group--concepts .coverage-chip",
      ".result-group--concepts > .concept-list",
      ".result-group--overlay",
      ".result-group--forward",
      ".result-region--overlay > .overlay .diagnostic",
    ]) {
      await expectNoMotion(page.locator(selector).first());
    }

    const disclosure = page
      .locator(".result-region--overlay > .overlay .diagnostic:not(.diagnostic--green)")
      .first();
    await disclosure.focus();
    await page.keyboard.press("Enter");
    const feedback = page.locator(`#${await disclosure.getAttribute("aria-controls")}`);
    await expect(feedback).toBeVisible();
    await expectNoMotion(feedback);
    await expectNoMotion(feedback, "::before");
    await expectNoMotion(feedback.locator(".feedback-source"));

    await page.getByRole("button", { name: "Revise your explanation", exact: true }).click();
    await page.locator("#revision-explanation").fill(REVISED_EXPLANATION);
    await page.getByRole("button", { name: "Check my revision", exact: true }).click();
    await expect(page.locator(".results")).toHaveAttribute("data-result-run", "2");
    const improved = page.locator(
      ".result-region--overlay > .overlay .diagnostic.hl-improved",
    );
    await expect(improved).toHaveCount(1);
    await expectNoMotion(improved.first());
  });

  test("the complete result and touch disclosure do not overflow 390x844", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installImmediateAnalysis(page);
    await page.goto("/");
    await submitImmediately(page);

    const diagnostic = page
      .locator(".result-region--overlay > .overlay .diagnostic:not(.diagnostic--green)")
      .first();
    await diagnostic.dispatchEvent("pointerup", {
      pointerType: "touch",
      isPrimary: true,
      bubbles: true,
    });
    const tooltip = page.locator(`#${await diagnostic.getAttribute("aria-controls")}`);
    await expect(tooltip).toBeVisible();

    const overflow = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      htmlClientWidth: document.documentElement.clientWidth,
      htmlScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      result: (() => {
        const box = document.querySelector(".results").getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      })(),
      tooltip: (() => {
        const element = document.querySelector(".feedback-card:not([hidden])");
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      })(),
      widest: Array.from(document.body.querySelectorAll("*"))
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 1 && box.height > 1 && getComputedStyle(element).display !== "none";
        })
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            className: String(element.className || ""),
            name: element.getAttribute("aria-label") || element.textContent.trim().slice(0, 80),
            right: box.right,
            scrollWidth: element.scrollWidth,
            width: box.width,
          };
        })
        .sort(
          (left, right) =>
            Math.max(right.width, right.scrollWidth) -
            Math.max(left.width, left.scrollWidth),
        )
        .slice(0, 10),
    }));
    expect(overflow.innerWidth).toBe(390);
    expect(overflow.htmlClientWidth).toBe(390);
    expect(overflow.htmlScrollWidth).toBe(390);
    expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(390);
    expect(overflow.result.left).toBeGreaterThanOrEqual(0);
    expect(overflow.result.right).toBeLessThanOrEqual(390);
    expect(overflow.result.width).toBeLessThanOrEqual(390);
    expect(overflow.tooltip.left).toBeGreaterThanOrEqual(0);
    expect(overflow.tooltip.right).toBeLessThanOrEqual(390);
    expect(overflow.tooltip.width).toBeLessThanOrEqual(390);
    expect(
      overflow.widest.every(
        ({ right, scrollWidth, width }) =>
          right <= 390 && scrollWidth <= 390 && width <= 390,
      ),
      JSON.stringify(overflow.widest, null, 2),
    ).toBe(true);

    const visibleButtons = page.getByRole("button");
    for (let index = 0; index < (await visibleButtons.count()); index += 1) {
      await expect(visibleButtons.nth(index)).toHaveAccessibleName(/.+/);
    }
    await expect(tooltip).toHaveAccessibleName(/Source:/);
  });
});
