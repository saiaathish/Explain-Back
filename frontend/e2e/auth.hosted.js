import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

const FRONTEND_ORIGIN = new URL(process.env.E2E_BASE_URL).origin;
const API_ORIGIN = new URL(process.env.E2E_API_URL).origin;
const RUN_GOOGLE_LINK = process.env.E2E_GOOGLE_LINK === "1";
const VERCEL_BYPASS_SECRET =
  process.env.E2E_VERCEL_BYPASS_SECRET?.trim() || null;

const SOURCE = [
  "Cell membranes preserve concentration gradients with active transport proteins.",
  "The sodium-potassium pump uses ATP-driven shape changes to move sodium out of",
  "the cell and potassium into it, supporting membrane potential and cell function.",
].join(" ");

const EXPLANATION = [
  "The pump uses ATP to change shape and move sodium and potassium ions.",
  "Those ion gradients support the membrane potential needed for cell function.",
].join(" ");

const VALIDATION_ONLY_BODY = {
  source: "Intentionally too short for model execution.",
  explanation:
    "This explanation is long enough to pass its own length requirement.",
  focused: false,
};

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
    follow_up: "Connect ATP-driven shape change to ion movement.",
    coverage: {
      covered: ["energy"],
      partial: [],
      missing: [],
    },
  };
}

async function readStoredAuth(page) {
  return page.evaluate(() => {
    const storageKey = Object.keys(localStorage).find((key) =>
      key.endsWith("-auth-token"),
    );

    if (!storageKey) {
      return null;
    }

    const session = JSON.parse(localStorage.getItem(storageKey));

    if (!session?.access_token || !session?.user?.id) {
      return null;
    }

    return {
      accessToken: session.access_token,
      userId: session.user.id,
      isAnonymous: Boolean(session.user.is_anonymous),
      providers: (session.user.identities || []).map(
        (identity) => identity.provider,
      ),
    };
  });
}

async function waitForStoredAuth(page) {
  await expect
    .poll(async () => (await readStoredAuth(page))?.userId || null)
    .not.toBeNull();

  return readStoredAuth(page);
}

async function waitForLinkedAuth(page, expectedUserId) {
  await expect
    .poll(async () => {
      const session = await readStoredAuth(page);

      return Boolean(
        session &&
          session.userId === expectedUserId &&
          !session.isAnonymous &&
          session.providers.includes("google"),
      );
    })
    .toBe(true);

  return readStoredAuth(page);
}

async function enterAnonymousWorkspace(page, path = "/") {
  await page.goto(path);

  const tryIt = page.getByRole("button", { name: "Try it", exact: true });
  await expect(tryIt).toBeEnabled();
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);

  await tryIt.click();
  await expect(page.locator("#source")).toBeFocused();

  return waitForStoredAuth(page);
}

function uidHash(userId) {
  return createHash("sha256").update(userId).digest("hex");
}

function bearerFingerprint(authorization) {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return createHash("sha256")
    .update(authorization.slice("Bearer ".length))
    .digest("hex");
}

test.describe("hosted Phase 2 authentication gate", () => {
  test.beforeEach(async ({ page }) => {
    if (!VERCEL_BYPASS_SECRET) {
      return;
    }

    const response = await page.context().request.get(`${FRONTEND_ORIGIN}/`, {
      headers: {
        "x-vercel-protection-bypass": VERCEL_BYPASS_SECRET,
        "x-vercel-set-bypass-cookie": "samesitenone",
      },
      maxRedirects: 0,
    });

    const status = response.status();
    if (status === 307) {
      const headers = response.headers();
      const setsBypassCookie = Boolean(
        headers["set-cookie"]?.split(";", 1)[0]?.startsWith("_vercel_jwt="),
      );

      expect(headers.location).toBe("/");
      expect(setsBypassCookie).toBe(true);
      return;
    }

    expect(status).toBe(200);
  });

  test("real anonymous session restores and the backend verifies its JWT", async ({
    page,
    request,
  }, testInfo) => {
    const firstSession = await enterAnonymousWorkspace(page);
    expect(firstSession.isAnonymous).toBe(true);

    const preflight = await request.fetch(`${API_ORIGIN}/api/analyze`, {
      method: "OPTIONS",
      headers: {
        Origin: FRONTEND_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    expect(preflight.status()).toBe(200);
    expect(preflight.headers()["access-control-allow-origin"]).toBe(
      FRONTEND_ORIGIN,
    );
    expect(
      preflight.headers()["access-control-allow-headers"].toLowerCase(),
    ).toContain("authorization");

    const rejectedOrigin = await request.fetch(`${API_ORIGIN}/api/analyze`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    expect(rejectedOrigin.status()).toBe(400);
    expect(rejectedOrigin.headers()["access-control-allow-origin"]).toBeFalsy();

    const malformedToken = await request.post(`${API_ORIGIN}/api/analyze`, {
      headers: {
        Authorization: "Bearer malformed.hosted.acceptance.token",
        Origin: FRONTEND_ORIGIN,
      },
      data: VALIDATION_ONLY_BODY,
    });

    expect(malformedToken.status()).toBe(401);

    const verifiedToken = await request.post(`${API_ORIGIN}/api/analyze`, {
      headers: {
        Authorization: `Bearer ${firstSession.accessToken}`,
        Origin: FRONTEND_ORIGIN,
      },
      data: VALIDATION_ONLY_BODY,
    });

    expect(verifiedToken.status()).toBe(400);
    expect(verifiedToken.headers()["access-control-allow-origin"]).toBe(
      FRONTEND_ORIGIN,
    );
    expect((await verifiedToken.json()).detail).toMatch(/Source too short/i);

    await page.reload();
    await expect(
      page.getByRole("button", { name: "Try it", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Try it", exact: true }).click();
    await expect(page.locator("#source")).toBeFocused();

    const restoredSession = await waitForStoredAuth(page);
    expect(restoredSession.userId).toBe(firstSession.userId);
    expect(restoredSession.isAnonymous).toBe(true);

    await testInfo.attach("phase2-anonymous-hosted-evidence", {
      body: JSON.stringify(
        {
          frontendOrigin: FRONTEND_ORIGIN,
          backendOrigin: API_ORIGIN,
          uidHash: uidHash(firstSession.userId),
          uidStableAfterReload:
            restoredSession.userId === firstSession.userId,
          anonymousAfterReload: restoredSession.isAnonymous,
          preflightStatus: preflight.status(),
          malformedTokenStatus: malformedToken.status(),
          verifiedTokenReachedValidation: verifiedToken.status() === 400,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
  });

  test("one 401 causes one refresh and one replay", async ({
    page,
  }, testInfo) => {
    const analysisRequests = [];
    const refreshRequests = [];

    page.on("request", (request) => {
      const url = new URL(request.url());

      if (
        url.pathname.endsWith("/auth/v1/token") &&
        url.searchParams.get("grant_type") === "refresh_token"
      ) {
        refreshRequests.push(request.url());
      }
    });

    await page.route(`${API_ORIGIN}/api/analyze`, async (route) => {
      const request = route.request();
      const authorization = await request.headerValue("authorization");

      analysisRequests.push({
        hasBearer: Boolean(bearerFingerprint(authorization)),
        bearerFingerprint: bearerFingerprint(authorization),
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

    await enterAnonymousWorkspace(page);
    await page.locator("#source").fill(SOURCE);
    await page.locator("#explanation").fill(EXPLANATION);
    await page
      .getByRole("button", { name: "Check my explanation", exact: true })
      .click();

    await expect(page.locator(".results")).toBeVisible();
    await expect.poll(() => analysisRequests.length).toBe(2);
    await expect.poll(() => refreshRequests.length).toBe(1);

    expect(analysisRequests[0].hasBearer).toBe(true);
    expect(analysisRequests[1].hasBearer).toBe(true);
    expect(analysisRequests[1].bearerFingerprint).not.toBe(
      analysisRequests[0].bearerFingerprint,
    );
    expect(analysisRequests[1].body).toEqual(analysisRequests[0].body);

    await testInfo.attach("phase2-refresh-replay-evidence", {
      body: JSON.stringify(
        {
          analysisRequestCount: analysisRequests.length,
          refreshRequestCount: refreshRequests.length,
          bearerChanged:
            analysisRequests[1].bearerFingerprint !==
            analysisRequests[0].bearerFingerprint,
          replayBodyMatched:
            JSON.stringify(analysisRequests[1].body) ===
            JSON.stringify(analysisRequests[0].body),
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
  });

  test("Google links to the existing anonymous UID and returns cleanly", async ({
    page,
  }, testInfo) => {
    test.skip(
      !RUN_GOOGLE_LINK,
      "Set E2E_GOOGLE_LINK=1 and run headed for the manual Google step.",
    );
    test.setTimeout(6 * 60_000);

    const identityLinkRequests = [];

    page.on("request", (request) => {
      const url = new URL(request.url());

      if (url.pathname.endsWith("/auth/v1/user/identities/authorize")) {
        identityLinkRequests.push({
          provider: url.searchParams.get("provider"),
          redirectTo: url.searchParams.get("redirect_to"),
          next: url.searchParams.get("next"),
        });
      }
    });

    const before = await enterAnonymousWorkspace(
      page,
      "/?next=https://evil.example",
    );

    await page
      .getByRole("button", {
        name: "Continue with Google to keep this session across devices",
        exact: true,
      })
      .click();

    await expect.poll(() => identityLinkRequests.length).toBe(1);
    expect(identityLinkRequests[0]).toEqual({
      provider: "google",
      redirectTo: `${FRONTEND_ORIGIN}/`,
      next: null,
    });

    await page.waitForURL(
      (url) =>
        url.origin === FRONTEND_ORIGIN &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash,
      {
        timeout: 5 * 60_000,
      },
    );

    const after = await waitForLinkedAuth(page, before.userId);
    expect(page.url()).toBe(`${FRONTEND_ORIGIN}/`);

    await page.reload();
    const restored = await waitForLinkedAuth(page, before.userId);

    await testInfo.attach("phase2-google-link-evidence", {
      body: JSON.stringify(
        {
          uidHash: uidHash(before.userId),
          uidPreserved: after.userId === before.userId,
          anonymousConverted: !after.isAnonymous,
          googleIdentityPresent: after.providers.includes("google"),
          callbackUrlClean: page.url() === `${FRONTEND_ORIGIN}/`,
          reloadStable: restored.userId === before.userId,
          maliciousNextIgnored: identityLinkRequests[0].next === null,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
  });
});
