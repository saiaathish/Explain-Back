import { expect, test } from "./fixtures/local-auth.js";

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
  await page.goto("/");
  await page.getByRole("button", { name: "Try it", exact: true }).click();
  await expect.poll(() => authApi.signupRequests.length).toBe(1);
  await page.locator("#source").fill(SOURCE);
  await page.locator("#explanation").fill(EXPLANATION);
  await page
    .getByRole("button", { name: "Check my explanation", exact: true })
    .click();
  await expect(page.locator(".results")).toBeVisible();
}


/* The leaving card stays in the DOM until its exit animation ends, so settle
 * the deck before reading the top card. */
async function expectTopPrompt(page, prompt) {
  await expect(page.locator(".review-card.is-top")).toHaveCount(1);
  await expect(page.locator(".review-card.is-top .review-prompt")).toHaveText(prompt);
}

test("a round counts down to zero and never remembers it", async ({
  page,
  authApi,
  restApi,
}) => {
  const analysisCalls = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) analysisCalls.push(request.url());
  });

  await recordGaps(page, authApi);
  await expect.poll(() => restApi.rows.explanation_attempts.length).toBe(1);
  const callsAfterAnalysis = analysisCalls.length;

  await page.getByRole("button", { name: "Review gaps", exact: true }).click();
  await expect(page.locator(".review-progress").first()).toHaveText("2 cards left");
  /* Red sorts before yellow: a contradiction is worth explaining first. */
  await expectTopPrompt(page, `Explain: ${ANCHOR}`);
  await expect(page.locator(".review-card.is-top")).toContainText(
    "Contradicted the source",
  );
  await expect(page.locator(".review-back")).toHaveCount(0);

  await page.locator(".review-card.is-top .review-front").click();
  const back = page.locator(".review-back");
  await expect(back).toContainText("The pump moves potassium out and sodium in");
  await expect(back).toContainText("The transport direction is reversed.");
  await expect(back).toContainText(ANCHOR);
  await expect(back).toContainText("Reverse the ion directions.");

  /* Still shaky keeps the card in the round: the count must not move. */
  await page.getByRole("button", { name: "Still shaky", exact: true }).click();
  await expectTopPrompt(page, "Explain: Gradients hold the membrane potential.");
  await expect(page.locator(".review-progress").first()).toHaveText("2 cards left");
  await expect(page.locator(".review-progress--muted")).toHaveText(
    "0 of 2 explained this round",
  );

  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await expect(page.locator(".review-progress").first()).toHaveText("1 card left");
  /* The shaky card came back around. */
  await expectTopPrompt(page, `Explain: ${ANCHOR}`);

  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  const done = page.locator(".review-done");
  await expect(done).toBeVisible();
  await expect(page.locator(".review-done-count")).toHaveText("0");
  await expect(done).toContainText("Deck clear");
  await expect(page.locator(".review-card")).toHaveCount(0);

  /* Nothing about the round was written anywhere. */
  expect(Object.keys(restApi.rows)).toEqual(["sessions", "explanation_attempts"]);
  expect(
    restApi.requests.filter(({ table }) => table !== "sessions" && table !== "explanation_attempts"),
  ).toEqual([]);
  expect(analysisCalls).toHaveLength(callsAfterAnalysis);

  /* Leaving and coming back starts a clean round with the full deck. */
  await page.locator("header").getByRole("button", { name: "Back to workspace" }).click();
  await page.getByRole("button", { name: "Review gaps", exact: true }).click();
  await expect(page.locator(".review-progress").first()).toHaveText("2 cards left");

  await page.reload();
  await page.getByRole("button", { name: "Try it", exact: true }).click();
  await expect(page.locator("#source")).toBeVisible();
  await page.getByRole("button", { name: "Review gaps", exact: true }).click();
  await expect(page.locator(".review-progress").first()).toHaveText("2 cards left");
  await expect(page.locator(".review-done")).toHaveCount(0);
});

test("studying again refills the deck without touching storage", async ({
  page,
  authApi,
  restApi,
}) => {
  await recordGaps(page, authApi);
  await expect.poll(() => restApi.rows.explanation_attempts.length).toBe(1);
  await page.getByRole("button", { name: "Review gaps", exact: true }).click();

  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await expect(page.locator(".review-done")).toBeVisible();

  await page.getByRole("button", { name: "Study them again", exact: true }).click();
  await expect(page.locator(".review-progress").first()).toHaveText("2 cards left");
  await expect(page.locator(".review-card.is-top")).toBeVisible();
});

test("the grid layout shows the whole deck at once", async ({
  page,
  authApi,
  restApi,
}) => {
  await recordGaps(page, authApi);
  await expect.poll(() => restApi.rows.explanation_attempts.length).toBe(1);
  await page.getByRole("button", { name: "Review gaps", exact: true }).click();

  await expect(page.locator(".review-deck--stack")).toBeVisible();
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await expect(page.locator(".review-deck--grid")).toBeVisible();
  await expect(page.locator(".review-card")).toHaveCount(2);
  await expect(page.locator(".review-card.is-top")).toHaveCount(0);

  /* Any card can be opened in grid, not just the top of the stack. */
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
  await page.goto("/");
  await page.getByRole("button", { name: "Try it", exact: true }).click();
  await page.locator("#source").fill(SOURCE);
  await page.locator("#explanation").fill(EXPLANATION);
  await page
    .getByRole("button", { name: "Check my explanation", exact: true })
    .click();
  await expect(page.locator(".results")).toBeVisible();

  await page
    .getByRole("button", { name: "Revise your explanation", exact: true })
    .click();
  await page
    .locator("#revision-explanation")
    .fill("The pump moves sodium out and potassium in. The gradients support the membrane.");
  await page
    .getByRole("button", { name: "Check my revision", exact: true })
    .click();
  await expect(page.locator(".results")).toHaveAttribute("data-result-run", "2");
  await expect.poll(() => restApi.rows.explanation_attempts.length).toBe(2);

  await page.getByRole("button", { name: "Review gaps", exact: true }).click();
  await expectTopPrompt(page, `Explain: ${ANCHOR}`);
  await page.locator(".review-card.is-top .review-front").click();
  const back = page.locator(".review-back");
  await expect(back).toContainText("What you said, attempt 1");
  await expect(back).toContainText("The pump moves potassium out and sodium in");
  await expect(back).toContainText("You closed this in a later attempt.");
});
