import { expect, test } from "./fixtures/local-auth.js";

const SOURCE = [
  "Cell membranes preserve concentration gradients with active transport proteins.",
  "The sodium-potassium pump uses ATP-driven shape changes to move sodium out of",
  "the cell and potassium into it, supporting membrane potential and cell function.",
].join(" ");

const EXPLANATION = [
  "The pump uses ATP to move ions.",
  "The gradients support membrane function.",
].join(" ");

function analysisResponse(source) {
  const anchor = "ATP-driven shape changes";
  const anchorStart = source.indexOf(anchor);
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
    coverage: {
      covered: ["energy"],
      partial: [],
      missing: [],
    },
  };
}

test("anonymous auth is deferred, restored, and refreshed once", async ({
  page,
  authApi,
}) => {
  const analysisRequests = [];

  await page.route("**/api/analyze", async (route) => {
    const request = route.request();
    analysisRequests.push({
      authorization: await request.headerValue("authorization"),
      body: request.postDataJSON(),
    });

    if (analysisRequests.length === 1) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Token expired." }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(analysisResponse(request.postDataJSON().source)),
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Try it", exact: true }),
  ).toBeEnabled();
  expect(authApi.signupRequests).toHaveLength(0);
  expect(authApi.refreshRequests).toHaveLength(0);

  await page.getByRole("button", { name: "Try it", exact: true }).click();
  await expect.poll(() => authApi.signupRequests.length).toBe(1);
  await expect(page.locator("#source")).toBeFocused();
  expect(authApi.signupRequests).toHaveLength(1);
  expect(authApi.accessTokens).toHaveLength(1);
  const storedAccessToken = await page.evaluate(() => {
    const storageKey = Object.keys(localStorage).find((key) =>
      key.endsWith("-auth-token"),
    );
    return storageKey
      ? JSON.parse(localStorage.getItem(storageKey)).access_token
      : null;
  });
  expect(storedAccessToken).toBe(authApi.accessTokens[0]);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Try it", exact: true }),
  ).toBeEnabled();
  const restoredAccessToken = await page.evaluate(() => {
    const storageKey = Object.keys(localStorage).find((key) =>
      key.endsWith("-auth-token"),
    );
    return storageKey
      ? JSON.parse(localStorage.getItem(storageKey)).access_token
      : null;
  });
  expect(restoredAccessToken).toBe(storedAccessToken);
  await page.getByRole("button", { name: "Try it", exact: true }).click();
  await expect(page.locator("#source")).toBeFocused();
  expect(authApi.signupRequests).toHaveLength(1);
  expect(authApi.refreshRequests).toHaveLength(0);

  await page.locator("#source").fill(SOURCE);
  await page.locator("#explanation").fill(EXPLANATION);
  await page
    .getByRole("button", { name: "Check my explanation", exact: true })
    .click();

  await expect(page.locator(".results")).toBeVisible();
  await expect.poll(() => analysisRequests.length).toBe(2);
  expect(authApi.refreshRequests).toHaveLength(1);
  expect(authApi.refreshRequests[0].body).toEqual({
    refresh_token: "e2e-refresh-token",
  });
  expect(authApi.accessTokens).toHaveLength(2);
  expect(authApi.accessTokens[1]).not.toBe(authApi.accessTokens[0]);
  expect(analysisRequests.map(({ authorization }) => authorization)).toEqual([
    `Bearer ${authApi.accessTokens[0]}`,
    `Bearer ${authApi.accessTokens[1]}`,
  ]);
  expect(analysisRequests[1].body).toEqual(analysisRequests[0].body);
});
