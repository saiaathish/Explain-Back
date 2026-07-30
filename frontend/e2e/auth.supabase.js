import { expect, test } from "@playwright/test";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL.trim();
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY.trim();

const SOURCE = [
  "Cell membranes preserve concentration gradients with active transport proteins.",
  "The sodium-potassium pump uses ATP-driven shape changes to move sodium out of",
  "the cell and potassium into it, supporting membrane potential and cell function.",
].join(" ");
const EXPLANATION = "The pump uses ATP to move ions across the membrane.";
const REVISED =
  "The pump spends ATP to push sodium out and pull potassium in, holding the gradient.";

function analysisResponse(source, explanation) {
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
    flags: [
      {
        prop_id: "energy",
        state: explanation.includes("holding the gradient") ? "green" : "yellow",
        start: 0,
        end: Math.min(24, explanation.length),
        anchor,
        anchor_start: anchorStart,
        anchor_end: anchorStart + anchor.length,
        hint: "Name the direction each ion moves.",
        similarity: 0.8,
      },
    ],
    follow_up: "Connect the ATP-driven shape change to ion movement.",
    coverage: { covered: [], partial: ["energy"], missing: [] },
  };
}

/* The analysis service is stubbed on purpose: this suite is about identity and
 * storage, and a preview backend only admits its own Vercel origin. */
async function stubAnalysis(page) {
  await page.route("**/api/analyze", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(analysisResponse(body.source, body.explanation)),
    });
  });
}

async function storedSession(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) =>
      name.endsWith("-auth-token"),
    );
    return key ? JSON.parse(localStorage.getItem(key)) : null;
  });
}

function subjectOf(accessToken) {
  return JSON.parse(
    Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
  ).sub;
}

async function readRows(accessToken, path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${accessToken}` },
  });
  expect(response.status).toBe(200);
  return response.json();
}

async function enterWorkspace(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try it", exact: true }).click();
  await expect(page.locator("#source")).toBeFocused();
}

async function analyze(page, explanation, control) {
  await page.locator("#source").fill(SOURCE);
  await page.locator(control === "revision" ? "#revision-explanation" : "#explanation").fill(explanation);
  await page
    .getByRole("button", {
      name: control === "revision" ? "Check my revision" : "Check my explanation",
      exact: true,
    })
    .click();
}

test("anonymous entry writes owner-scoped history that survives a reload", async ({
  page,
}) => {
  const authRequests = [];
  page.on("request", (request) => {
    if (request.url().startsWith(`${SUPABASE_URL}/auth/v1/`)) {
      authRequests.push(`${request.method()} ${request.url().slice(SUPABASE_URL.length)}`);
    }
  });

  await stubAnalysis(page);
  await page.goto("/");
  /* Auth is deferred until the judge path actually starts. */
  await expect(page.getByRole("button", { name: "Try it", exact: true })).toBeEnabled();
  expect(authRequests).toEqual([]);

  await page.getByRole("button", { name: "Try it", exact: true }).click();
  await expect(page.locator("#source")).toBeFocused();
  const session = await storedSession(page);
  expect(session?.user?.is_anonymous).toBe(true);
  expect(authRequests.filter((entry) => entry.includes("/signup"))).toHaveLength(1);
  const userId = subjectOf(session.access_token);
  expect(userId).toBe(session.user.id);

  await analyze(page, EXPLANATION);
  await expect(page.locator(".results")).toBeVisible();
  await expect(page.locator(".history-save-error")).toHaveCount(0);

  const savedQuery =
    "sessions?select=id,user_id,source_text,explanation_attempts(attempt_number,explanation_text)";
  await expect
    .poll(
      async () => {
        const rows = await readRows(session.access_token, savedQuery);
        return rows.length === 1 ? rows[0].explanation_attempts.length : 0;
      },
      { timeout: 15_000 },
    )
    .toBe(1);
  const [saved] = await readRows(session.access_token, savedQuery);
  expect(saved.user_id).toBe(userId);
  expect(saved.source_text).toBe(SOURCE);
  expect(saved.explanation_attempts).toHaveLength(1);

  await page.getByRole("button", { name: "Revise your explanation", exact: true }).click();
  await analyze(page, REVISED, "revision");
  await expect(page.locator(".results")).toHaveAttribute("data-result-run", "2");
  await expect
    .poll(
      async () =>
        (
          await readRows(
            session.access_token,
            `explanation_attempts?select=attempt_number&session_id=eq.${saved.id}`,
          )
        ).length,
      { timeout: 15_000 },
    )
    .toBe(2);

  await page.reload();
  await page.getByRole("button", { name: "Try it", exact: true }).click();
  await expect(page.locator("#source")).toBeFocused();
  const restored = await storedSession(page);
  expect(subjectOf(restored.access_token)).toBe(userId);
  expect(authRequests.filter((entry) => entry.includes("/signup"))).toHaveLength(1);

  await page.getByRole("button", { name: "Past sessions", exact: true }).click();
  const rows = page.locator(".history-sessions > li");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("2 attempts");
  await expect(page.locator(".history-detail")).toContainText(REVISED);
});

/*
 * Supabase does not validate `redirect_to` when authorization starts — it was
 * observed accepting an unrelated origin there, and only refuses to honor an
 * unvalidated destination at the callback, which falls back to the site URL.
 * The control that matters is therefore the app's own: it pins the destination
 * to its current origin with the query string and fragment stripped.
 */
test("identity linking asks Supabase for one canonical Google authorization", async ({
  page,
  baseURL,
}) => {
  const authorizeRequests = [];
  await page.route(`${SUPABASE_URL}/auth/v1/user/identities/authorize**`, async (route) => {
    authorizeRequests.push(new URL(route.request().url()));
    await route.continue();
  });
  /* Stop at Supabase's redirect: completing Google sign-in is the owner's to do. */
  await page.route("**://accounts.google.com/**", (route) => route.abort());

  await stubAnalysis(page);
  await enterWorkspace(page);
  const session = await storedSession(page);
  expect(session.user.is_anonymous).toBe(true);

  await page
    .getByRole("button", {
      name: "Continue with Google to keep this session across devices",
      exact: true,
    })
    .click();

  await expect.poll(() => authorizeRequests.length).toBe(1);
  await page.waitForTimeout(300);
  expect(authorizeRequests).toHaveLength(1);
  const [authorize] = authorizeRequests;
  expect(authorize.searchParams.get("provider")).toBe("google");
  expect(authorize.searchParams.get("redirect_to")).toBe(baseURL);
  expect(authorize.searchParams.has("next")).toBe(false);
});
