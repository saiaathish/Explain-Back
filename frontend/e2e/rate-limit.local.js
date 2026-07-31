import { expect, test, signIn } from "./fixtures/local-auth.js";

const SOURCE = [
  "Cell membranes preserve concentration gradients with active transport proteins.",
  "The sodium-potassium pump uses ATP-driven shape changes to move sodium out of",
  "the cell and potassium into it, supporting membrane potential and cell function.",
].join(" ");

const EXPLANATION = "The pump uses ATP to move ions across the membrane.";

function analysisResponse() {
  const anchor = "ATP-driven shape changes";
  const anchorStart = SOURCE.indexOf(anchor);
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
    flags: [],
    follow_up: "Connect the ATP-driven shape change to ion movement.",
    coverage: { covered: ["energy"], partial: [], missing: [] },
  };
}

/* The budget itself is enforced and tested server-side; this drives what the
 * learner sees when the server says no. */
async function installAnalysis(page, { refuseAfter, retryAfter = 5 }) {
  const calls = [];
  await page.route("**/api/analyze", async (route) => {
    calls.push(route.request().postDataJSON());
    if (calls.length > refuseAfter) {
      await route.fulfill({
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(retryAfter),
          /* The browser is a different origin here, exactly as in production,
             so the header is only readable because the server exposes it. */
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "Retry-After",
        },
        body: JSON.stringify({
          detail: "You can start one new source a minute.",
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(analysisResponse()),
    });
  });
  return calls;
}

async function submit(page) {
  await page.locator("#source").fill(SOURCE);
  await page.locator("#explanation").fill(EXPLANATION);
  await page
    .getByRole("button", { name: "Check my explanation", exact: true })
    .click();
}

test("a refused analysis counts down on the button instead of failing silently", async ({
  page,
}) => {
  const calls = await installAnalysis(page, { refuseAfter: 0, retryAfter: 4 });
  await signIn(page, "/");
  await submit(page);

  await expect(page.locator(".error")).toContainText(
    "You can start one new source a minute",
  );

  const button = page.getByRole("button", { name: /Try again in \d+s/ });
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();

  /* The countdown runs down rather than sitting on the server's number. */
  const first = Number((await button.textContent()).match(/(\d+)/)[1]);
  await expect
    .poll(async () => {
      const label = await page
        .getByRole("button", { name: /Try again in \d+s/ })
        .textContent()
        .catch(() => "");
      const match = label.match(/(\d+)/);
      return match ? Number(match[1]) : 0;
    })
    .toBeLessThan(first);

  /* Clicking during the cooldown must not reach the server. */
  const callsDuringCooldown = calls.length;
  await page.locator("#source").click();
  expect(calls).toHaveLength(callsDuringCooldown);

  await expect(
    page.getByRole("button", { name: "Check my explanation", exact: true }),
  ).toBeEnabled({ timeout: 15_000 });
});

test("revising the same source is not blocked by the new-source budget", async ({
  page,
}) => {
  /* The server allows the revision loop; the UI must not add a block of its own. */
  const calls = await installAnalysis(page, { refuseAfter: 99 });
  await signIn(page, "/");
  await submit(page);
  await expect(page.locator(".results")).toBeVisible();

  await page
    .getByRole("button", { name: "Revise your explanation", exact: true })
    .click();
  await page
    .locator("#revision-explanation")
    .fill("The pump spends ATP to push sodium out and pull potassium in.");
  await page
    .getByRole("button", { name: "Check my revision", exact: true })
    .click();

  await expect(page.locator(".results")).toHaveAttribute("data-result-run", "2");
  expect(calls).toHaveLength(2);
  await expect(page.locator(".error")).toHaveCount(0);
});
