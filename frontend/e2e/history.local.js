import { expect, test, signIn, startSession, enterSource, enterExplanation, submitForAnalysis, openSection } from "./fixtures/local-auth.js";

const SOURCE = [
  "Cell membranes preserve concentration gradients with active transport proteins.",
  "The sodium-potassium pump uses ATP-driven shape changes to move sodium out of",
  "the cell and potassium into it, supporting membrane potential and cell function.",
].join(" ");

const EXPLANATION = "The pump uses ATP to move ions across the membrane.";
const REVISED_EXPLANATION =
  "The pump spends ATP to push sodium out and pull potassium in, holding the gradient.";

function analysisResponse(source, explanation) {
  const anchor = "ATP-driven shape changes";
  const anchorStart = source.indexOf(anchor);
  const revised = explanation.includes("holding the gradient");
  return {
    concepts: [
      {
        id: "energy",
        label: "ATP energy",
        anchor,
        anchor_start: anchorStart,
        anchor_end: anchorStart + anchor.length,
      },
    ],
    flags: [
      {
        id: "energy-claim",
        state: revised ? "green" : "yellow",
        claim: explanation,
        anchor,
        anchor_start: anchorStart,
        anchor_end: anchorStart + anchor.length,
        hint: "Name the direction each ion moves.",
      },
    ],
    follow_up: "Connect the ATP-driven shape change to ion movement.",
    coverage: { covered: ["energy"], partial: [], missing: [] },
  };
}

async function installAnalysis(page) {
  await page.route("**/api/analyze", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(analysisResponse(body.source, body.explanation)),
    });
  });
}

async function enterWorkspace(page, authApi) {
  await signIn(page, "/");
  await startSession(page);
}

test("one topic's analysis and revision persist as a single owner-scoped session", async ({
  page,
  authApi,
  restApi,
}) => {
  await installAnalysis(page);
  await enterWorkspace(page, authApi);
  await enterSource(page, SOURCE);
  await enterExplanation(page, EXPLANATION);
  await submitForAnalysis(page);
  await expect(page.locator(".results")).toBeVisible();

  await expect.poll(() => restApi.rows.explanation_attempts.length).toBe(1);
  await expect(page.locator(".history-save-error")).toHaveCount(0);
  expect(restApi.rows.sessions).toHaveLength(1);
  expect(restApi.rows.sessions[0]).toMatchObject({
    user_id: "3f501cb4-3783-4b55-9d75-d732f9555b5f",
    source_text: SOURCE,
  });
  expect(restApi.rows.explanation_attempts[0]).toMatchObject({
    session_id: restApi.rows.sessions[0].id,
    attempt_number: 1,
    explanation_text: EXPLANATION,
  });
  expect(restApi.rows.explanation_attempts[0].flags[0].state).toBe("yellow");

  await page
    .getByRole("button", { name: /Explain it again|Revise your explanation/, exact: false })
    .click();
  await enterExplanation(page, REVISED_EXPLANATION);
  await submitForAnalysis(page);
  await expect(page.locator(".results")).toHaveAttribute("data-result-run", "2");

  await expect.poll(() => restApi.rows.explanation_attempts.length).toBe(2);
  await expect(page.locator(".history-save-error")).toHaveCount(0);
  expect(restApi.rows.sessions).toHaveLength(1);
  expect(restApi.rows.explanation_attempts[1]).toMatchObject({
    session_id: restApi.rows.sessions[0].id,
    attempt_number: 2,
    explanation_text: REVISED_EXPLANATION,
  });
  expect(restApi.rows.explanation_attempts[1].flags[0].state).toBe("green");

  expect(
    restApi.requests.filter(({ method }) => method === "POST"),
  ).not.toHaveLength(0);

  /* Visiting saved history and going back leaves the live session intact. */
  await openSection(page, "Past sessions");
  await expect(page.locator(".history-attempts > li")).toHaveCount(2);
  await page.goBack();
  await expect(page.locator(".results")).toHaveAttribute("data-result-run", "2");
});

test("past sessions survive a reload and exclude another learner's rows", async ({
  page,
  authApi,
  restApi,
}) => {
  await installAnalysis(page);
  const foreign = restApi.seedForeignSession({
    sourceText: "Another learner's private source about tax policy.",
  });
  await enterWorkspace(page, authApi);
  await enterSource(page, SOURCE);
  await enterExplanation(page, EXPLANATION);
  await submitForAnalysis(page);
  await expect(page.locator(".results")).toBeVisible();
  await expect.poll(() => restApi.rows.explanation_attempts.length).toBe(2);

  await page.reload();
  await expect(page.locator(".landing-shell")).toHaveCount(0);

  await openSection(page, "Past sessions");
  const savedSessions = page.locator(".history-sessions > li");
  await expect(savedSessions).toHaveCount(1);
  await expect(savedSessions.first()).toContainText("1 attempt");
  await expect(savedSessions.first()).toContainText("0/1 claims hold up");
  await expect(page.locator(".history-view")).not.toContainText("tax policy");
  await expect(page.locator(".history-detail")).toContainText(EXPLANATION);

  /* Requesting the other learner's session directly is refused by ownership. */
  const foreignRows = await page.evaluate(
    async ({ foreignId, apiKey }) => {
      const storageKey = Object.keys(localStorage).find((key) =>
        key.endsWith("-auth-token"),
      );
      const { access_token: accessToken } = JSON.parse(
        localStorage.getItem(storageKey),
      );
      const response = await fetch(
        `/__e2e-supabase/rest/v1/sessions?select=id&id=eq.${foreignId}`,
        {
          headers: {
            apikey: apiKey,
            authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return { status: response.status, body: await response.json() };
    },
    { foreignId: foreign.id, apiKey: "sb_publishable_e2e_local" },
  );
  expect(foreignRows).toEqual({ status: 200, body: [] });

  await startSession(page);
  await expect(page.locator("#source")).toHaveValue("");
  await expect(page.locator(".results")).toHaveCount(0);
});
