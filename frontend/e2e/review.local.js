import { expect, test, signIn, startSession, enterSource, enterExplanation, submitForAnalysis, openSection } from "./fixtures/local-auth.js";

const SOURCE = [
  "Cell membranes preserve concentration gradients with active transport proteins.",
  "The sodium-potassium pump uses ATP-driven shape changes to move sodium out of",
  "the cell and potassium into it, supporting membrane potential and cell function.",
].join(" ");

const EXPLANATION =
  "The pump moves potassium out and sodium in. The gradients support the membrane.";

const ANCHOR = "Sodium leaves the cell and potassium enters.";

function analysisResponse(explanation) {
  const claims = explanation.split(". ").map((part) => part.trim());
  const redClaim = claims[0];
  const yellowClaim = claims[1];
  return {
    concepts: [{ id: "direction", label: "Transport direction", anchor: ANCHOR }],
    flags: [
      {
        prop_id: "direction",
        state: "red",
        start: explanation.indexOf(redClaim),
        end: explanation.indexOf(redClaim) + redClaim.length,
        claim: redClaim,
        anchor: ANCHOR,
        hint: "Reverse the ion directions.",
        misconception: "The transport direction is reversed.",
        refutation: "The pump exports sodium and imports potassium.",
        similarity: 0.2,
      },
      {
        prop_id: "gradients",
        state: "yellow",
        start: explanation.indexOf(yellowClaim),
        end: explanation.indexOf(yellowClaim) + yellowClaim.length,
        claim: yellowClaim,
        anchor: "Gradients hold the membrane potential.",
        hint: "Say why the gradient matters.",
        similarity: 0.8,
      },
    ],
    follow_up: "Which ion actually leaves the cell?",
    coverage: { covered: [], partial: ["direction"], missing: [] },
  };
}

async function recordGaps(page, authApi) {
  await page.route("**/api/analyze", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(analysisResponse(route.request().postDataJSON().explanation)),
    });
  });
  await signIn(page, "/");
  await startSession(page);
  await enterSource(page, SOURCE);
  await enterExplanation(page, EXPLANATION);
  await submitForAnalysis(page);
  await expect(page.locator(".results")).toBeVisible();
}

async function expectTopPrompt(page, prompt) {
  await expect(page.locator(".review-card.is-top")).toHaveCount(1);
  await expect(page.locator(".review-card.is-top .review-prompt")).toHaveText(prompt);
}

test("a cleared gap never comes back, and later sessions stack on their own", async ({
  page,
  authApi,
  restApi,
}) => {
  await recordGaps(page, authApi);
  await expect.poll(() => restApi.rows.explanation_attempts.length).toBe(1);

  await openSection(page, "Review gaps");
  await expect(page.locator(".review-progress").first()).toHaveText("2 cards left");

  await page.getByRole("button", { name: "Still shaky", exact: true }).click();
  await expectTopPrompt(page, "Explain: Gradients hold the membrane potential.");
  await expect(page.locator(".review-progress").first()).toHaveText("2 cards left");
  expect(restApi.rows.cleared_gaps).toHaveLength(0);

  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await expect(page.locator(".review-progress").first()).toHaveText("1 card left");
  await expect.poll(() => restApi.rows.cleared_gaps.length).toBe(1);
  expect(restApi.rows.cleared_gaps[0]).toMatchObject({
    prop_id: "gradients",
    session_id: restApi.rows.sessions[0].id,
  });

  await startSession(page);
  await openSection(page, "Review gaps");
  await expect(page.locator(".review-progress").first()).toHaveText("1 card left");
  await expectTopPrompt(page, `Explain: ${ANCHOR}`);

  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await expect(page.locator(".review-done")).toBeVisible();
  await expect(page.locator(".review-done h2")).toHaveText("Nothing left to explain");
  await expect.poll(() => restApi.rows.cleared_gaps.length).toBe(2);

  await startSession(page);
  await openSection(page, "Review gaps");
  await expect(page.locator(".review-done")).toBeVisible();
  await expect(page.locator(".review-card")).toHaveCount(0);

  await page.reload();
  await openSection(page, "Review gaps");
  await expect(page.locator(".review-done")).toBeVisible();
  await expect(page.locator(".review-card")).toHaveCount(0);

  await startSession(page);
  await enterSource(page, `${SOURCE} Osmosis moves water instead of ions.`);
  await enterExplanation(page, EXPLANATION);
  await submitForAnalysis(page);
  await expect(page.locator(".results")).toBeVisible();
  await expect.poll(() => restApi.rows.sessions.length).toBe(2);

  await openSection(page, "Review gaps");
  await expect(page.locator(".review-progress").first()).toHaveText("2 cards left");
  await expect(page.locator(".review-progress--muted")).toHaveText(
    "0 of 2 explained this round",
  );
});

test("a new gap on a cleared source appears on its own", async ({
  page,
  authApi,
  restApi,
}) => {
  await recordGaps(page, authApi);
  await openSection(page, "Review gaps");
  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await expect(page.locator(".review-done")).toBeVisible();
  await expect.poll(() => restApi.rows.cleared_gaps.length).toBe(2);

  await page.goBack();
  await page.unroute("**/api/analyze");
  await page.route("**/api/analyze", async (route) => {
    const explanation = route.request().postDataJSON().explanation;
    const response = analysisResponse(explanation);
    response.flags = [
      {
        prop_id: "energy",
        state: "yellow",
        start: 0,
        end: 12,
        claim: "ATP is used somehow.",
        anchor: "Each cycle spends one ATP molecule.",
        hint: "Say what the ATP is spent on.",
        similarity: 0.6,
      },
    ];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  await page
    .getByRole("button", { name: /Explain it again|Revise your explanation/, exact: false })
    .click();
  await enterExplanation(page, "The pump moves sodium out and potassium in. ATP is used somehow.");
  await submitForAnalysis(page);
  await expect(page.locator(".results")).toHaveAttribute("data-result-run", "2");
  await expect.poll(() => restApi.rows.explanation_attempts.length).toBe(2);

  await openSection(page, "Review gaps");
  await expect(page.locator(".review-progress").first()).toHaveText("1 card left");
  await expectTopPrompt(page, "Explain: Each cycle spends one ATP molecule.");
});

test("past reviews are practice and never reopen a cleared gap", async ({
  page,
  authApi,
  restApi,
}) => {
  await recordGaps(page, authApi);
  await openSection(page, "Review gaps");

  const historyToggle = page.getByRole("button", { name: /Past reviews/ });
  await historyToggle.click();
  await expect(page.locator(".review-history")).toContainText("Nothing cleared yet");
  await historyToggle.click();

  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await expect.poll(() => restApi.rows.cleared_gaps.length).toBe(2);

  await historyToggle.click();
  const entry = page.locator(".review-history-entry");
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("2 gaps cleared");

  await page.getByRole("button", { name: "Study again", exact: true }).click();
  await expect(page.locator("#review-title")).toHaveText("Practising a past review");
  await expect(page.locator(".review-progress").first()).toHaveText("2 cards left");

  const clearedBefore = restApi.rows.cleared_gaps.length;
  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await expect(page.locator(".review-done h2")).toHaveText("Practice complete");
  expect(restApi.rows.cleared_gaps).toHaveLength(clearedBefore);

  await page
    .locator(".review-done")
    .getByRole("button", { name: "Back to my gaps" })
    .click();
  await expect(page.locator("#review-title")).toHaveText("Review your gaps");
  await expect(page.locator(".review-done h2")).toHaveText("Nothing left to explain");
  await expect(page.locator(".review-card")).toHaveCount(0);
});

test("the grid layout shows the whole deck at once", async ({
  page,
  authApi,
  restApi,
}) => {
  await recordGaps(page, authApi);
  await expect.poll(() => restApi.rows.explanation_attempts.length).toBe(1);
  await openSection(page, "Review gaps");

  await expect(page.locator(".review-deck--stack")).toBeVisible();
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await expect(page.locator(".review-deck--grid")).toBeVisible();
  await expect(page.locator(".review-card")).toHaveCount(2);
  await expect(page.locator(".review-card.is-top")).toHaveCount(0);

  await page.locator(".review-card").nth(1).locator(".review-front").click();
  await expect(page.locator(".review-back")).toContainText(
    "Say why the gradient matters.",
  );

  await page.getByRole("button", { name: "Stack", exact: true }).click();
  await expect(page.locator(".review-deck--stack")).toBeVisible();
});

test("a revision that closes a gap keeps the card and reports it resolved", async ({
  page,
  authApi,
  restApi,
}) => {
  await page.route("**/api/analyze", async (route) => {
    const explanation = route.request().postDataJSON().explanation;
    const response = analysisResponse(explanation);
    if (explanation.includes("sodium out and potassium in")) {
      response.flags = response.flags.map((flag) =>
        flag.prop_id === "direction" ? { ...flag, state: "green" } : flag,
      );
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  await signIn(page, "/");
  await startSession(page);
  await enterSource(page, SOURCE);
  await enterExplanation(page, EXPLANATION);
  await submitForAnalysis(page);
  await expect(page.locator(".results")).toBeVisible();

  await page
    .getByRole("button", { name: /Explain it again|Revise your explanation/, exact: false })
    .click();
  await enterExplanation(page, "The pump moves sodium out and potassium in. The gradients support the membrane.");
  await submitForAnalysis(page);
  await expect(page.locator(".results")).toHaveAttribute("data-result-run", "2");
  await expect.poll(() => restApi.rows.explanation_attempts.length).toBe(2);

  await openSection(page, "Review gaps");
  await expectTopPrompt(page, `Explain: ${ANCHOR}`);
  await page.locator(".review-card.is-top .review-front").click();
  const back = page.locator(".review-back");
  await expect(back).toContainText("What you said, attempt 1");
  await expect(back).toContainText("The pump moves potassium out and sodium in");
  await expect(back).toContainText("You closed this in a later attempt.");
});
