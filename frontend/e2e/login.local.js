import { expect, test } from "./fixtures/local-auth.js";

/*
 * The required order is landing → login → Google → app.
 * It must never be landing → login → Google → landing → app.
 */

test("signing in goes straight from Google into the workspace", async ({
  page,
  authApi,
}) => {
  const screens = [];
  const record = async () => {
    screens.push(
      await page.evaluate(() => ({
        landing: Boolean(document.querySelector(".landing-shell")),
        login: Boolean(document.querySelector(".login-shell")),
        workspace: Boolean(document.querySelector("#source")),
      })),
    );
  };

  await page.goto("/");
  await record();
  expect(screens.at(-1)).toMatchObject({ landing: true, workspace: false });
  /* Nothing is signed in until the learner asks for it. */
  expect(authApi.signInRequests).toHaveLength(0);

  await page.getByRole("button", { name: "Sign in to start", exact: true }).click();
  await expect(page.locator(".login-shell")).toBeVisible();
  await record();
  expect(screens.at(-1)).toMatchObject({ landing: false, login: true });
  await expect(
    page.getByRole("heading", { name: "Sign in to start explaining" }),
  ).toBeVisible();

  /*
   * The return from Google is a fresh document, so the watcher is installed as
   * an init script and records every paint on the page the provider returns to.
   */
  await page.addInitScript(() => {
    window.__landingSeen = false;
    const watch = () => {
      const observer = new MutationObserver(() => {
        if (document.querySelector(".landing-shell")) window.__landingSeen = true;
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    };
    if (document.documentElement) watch();
    else document.addEventListener("DOMContentLoaded", watch);
  });

  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();

  await expect(page.locator("#source")).toBeVisible();
  await record();
  expect(screens.at(-1)).toMatchObject({
    landing: false,
    login: false,
    workspace: true,
  });
  /* The landing page never reappeared on the way back from the provider. */
  expect(await page.evaluate(() => window.__landingSeen)).toBe(false);

  expect(authApi.signInRequests).toHaveLength(1);
  expect(authApi.signInRequests[0].searchParams.provider).toBe("google");
  expect(authApi.signInRequests[0].searchParams.redirect_to).toBe(
    new URL("/", page.url()).toString(),
  );
  expect(authApi.codeExchangeRequests).toHaveLength(1);
  expect(new URL(page.url()).search).toBe("");

  const session = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) =>
      name.endsWith("-auth-token"),
    );
    return key ? JSON.parse(localStorage.getItem(key)) : null;
  });
  expect(session.user.is_anonymous).toBe(false);
  expect(session.user.identities.map((identity) => identity.provider)).toEqual([
    "google",
  ]);
});

test("the workspace is unreachable without signing in", async ({
  page,
  authApi,
}) => {
  await page.goto("/");
  await expect(page.locator(".landing-shell")).toBeVisible();
  await expect(page.locator("#source")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Try it", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".landing-assurance")).toContainText(
    "Google sign-in",
  );
  expect(authApi.signInRequests).toHaveLength(0);
  expect(authApi.codeExchangeRequests).toHaveLength(0);
});

test("a stored session reopens the workspace without the landing page", async ({
  page,
  authApi,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in to start", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  await expect(page.locator("#source")).toBeVisible();

  await page.reload();
  await expect(page.locator("#source")).toBeVisible();
  await expect(page.locator(".landing-shell")).toHaveCount(0);
  /* Restoring a session must not ask Google again. */
  expect(authApi.signInRequests).toHaveLength(1);
});

test("a refused sign-in explains itself on the login screen", async ({
  page,
}) => {
  await page.goto(
    "/?error=access_denied&error_description=The+learner+cancelled+sign-in",
  );
  await expect(page.locator(".login-error, .landing-auth-error")).toContainText(
    "The learner cancelled sign-in",
  );
  expect(new URL(page.url()).search).toBe("");
  await expect(page.locator("#source")).toHaveCount(0);
});

test("signing out returns to the landing page and locks the workspace", async ({
  page,
  authApi,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in to start", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  await expect(page.locator("#source")).toBeVisible();

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".landing-shell")).toBeVisible();
  await expect(page.locator("#source")).toHaveCount(0);
  await expect.poll(() => authApi.signOutRequests.length).toBe(1);
  expect(authApi.signOutRequests[0].presentedUserToken).toBe(true);
  await expect(
    page.getByRole("button", { name: "Sign in to start", exact: true }),
  ).toBeVisible();
});
