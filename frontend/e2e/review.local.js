import { expect, test, signIn } from "./fixtures/local-auth.js";

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
  await page.locator("#source").fill(SOURCE);
  await page.locator("#explanation").fill(EXPLANATION);
  await page
    .getByRole("button", { name: "Check my explanation", exact: true })
    .click();
  await expect(page.locator(".results")).toBeVisible();
}

test("review cards come from stored gaps and marks survive a reload", async ({
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
  const front = page.locator(".review-front");
  await expect(front).toBeVisible();
  await expect(page.locator(".review-progress")).toContainText(
    "0 of 2 marked as understood",
  );
  /* The red gap sorts first: the prompt is framed from the source anchor. */
  await expect(page.locator(".review-prompt")).toHaveText(`Explain: ${ANCHOR}`);
  await expect(front).toContainText("Contradicted the source");
  await expect(page.locator(".review-back")).toBeHidden();

  await front.click();
  await expect(front).toHaveAttribute("aria-expanded", "true");
  const back = page.locator(".review-back");
  await expect(back).toContainText("The pump moves potassium out and sodium in");
  await expect(back).toContainText("The transport direction is reversed.");
  await expect(back).toContainText(ANCHOR);
  await expect(back).toContainText("Reverse the ion directions.");
  await expect(back).toContainText("still open at your last attempt");

  await page.getByRole("button", { name: "Got it now", exact: true }).click();
  await expect.poll(() => restApi.rows.flag_reviews.length).toBe(1);
  expect(restApi.rows.flag_reviews[0]).toMatchObject({
    prop_id: "direction",
    mastered: true,
    session_id: restApi.rows.sessions[0].id,
  });
  /* The next card appears face down, and no analysis request was made. */
  await expect(page.locator(".review-prompt")).toHaveText(
    "Explain: Gradients hold the membrane potential.",
  );
  await expect(page.locator(".review-front")).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  await page.getByRole("button", { name: "Still shaky", exact: true }).click();
  await expect.poll(() => restApi.rows.flag_reviews.length).toBe(2);
  expect(restApi.rows.flag_reviews[1]).toMatchObject({
    prop_id: "gradients",
    mastered: false,
  });
  expect(analysisCalls).toHaveLength(callsAfterAnalysis);

  await page.reload();
  /* The stored session reopens the workspace with no landing page. */
  await expect(page.locator("#source")).toBeVisible();
  await expect(page.locator(".landing-shell")).toHaveCount(0);
  await page.getByRole("button", { name: "Review gaps", exact: true }).click();
  await expect(page.locator(".review-progress")).toContainText(
    "1 of 2 marked as understood",
  );
  /* What is still shaky comes back before what they already know. */
  await expect(page.locator(".review-prompt")).toHaveText(
    "Explain: Gradients hold the membrane potential.",
  );
  await expect(page.locator(".review-mark")).toContainText(
    "Last marked still shaky",
  );

  await page
    .getByRole("button", { name: "Back to workspace", exact: true })
    .click();
  await expect(page.locator("#source")).toHaveValue("");
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
  await expect(page.locator(".review-prompt")).toHaveText(`Explain: ${ANCHOR}`);
  await page.locator(".review-front").click();
  const back = page.locator(".review-back");
  await expect(back).toContainText("What you said, attempt 1");
  await expect(back).toContainText("The pump moves potassium out and sodium in");
  await expect(back).toContainText("You closed this in a later attempt.");
});
