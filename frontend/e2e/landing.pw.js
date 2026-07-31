import AxeBuilder from "@axe-core/playwright";
import { expect, test, startSession } from "./fixtures/local-auth.js";

test("landing page explains the product and leads to the login screen", async ({
  page,
}) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Every AI tutor explains to you. This one makes you explain.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Hedges' g = 0.56")).toBeVisible();
  await expect(page.getByText("Actual diagnostic overlay")).toBeVisible();
  const typography = await page.evaluate(() => {
    const family = (selector) =>
      getComputedStyle(document.querySelector(selector)).fontFamily;
    return {
      title: family("#landing-title"),
      lede: family(".landing-lede"),
      evidence: family(".landing-evidence"),
      preview: family(".landing-preview .overlay"),
      eyebrow: family(".landing-eyebrow"),
      callToAction: family(".landing-cta"),
    };
  });
  expect(typography.lede).toBe(typography.title);
  expect(typography.evidence).toBe(typography.title);
  expect(typography.preview).toBe(typography.title);
  expect(typography.eyebrow).not.toBe(typography.title);
  expect(typography.callToAction).not.toBe(typography.title);
  await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/saiaathish/Explain-Back",
  );

  const findings = await new AxeBuilder({ page }).analyze();
  expect(findings.violations).toEqual([]);

  /* An account is required, so the landing page hands off to the login screen. */
  await page.getByRole("button", { name: "Sign in to start", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to start explaining" }),
  ).toBeVisible();
  await expect(page.locator("#source")).toHaveCount(0);
  const loginFindings = await new AxeBuilder({ page }).analyze();
  expect(loginFindings.violations).toEqual([]);
  const loginTypography = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector("#login-title")).fontFamily,
    lede: getComputedStyle(document.querySelector(".login-lede")).fontFamily,
    eyebrow: getComputedStyle(document.querySelector(".login-eyebrow")).fontFamily,
  }));
  expect(loginTypography.lede).toBe(loginTypography.title);
  expect(loginTypography.eyebrow).not.toBe(loginTypography.title);

  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page.locator(".dashboard")).toBeVisible();
  await startSession(page);
  await expect(page.locator("#source")).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Biology", exact: true }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("landing page stays within a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

  const signInButton = page.getByRole("button", {
    name: "Sign in to start",
    exact: true,
  });
  await expect(signInButton).toBeVisible();
  const box = await signInButton.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);

  /* The login screen is the next thing a phone sees, so it must fit too. */
  await signInButton.click();
  await expect(page.locator(".login-shell")).toBeVisible();
  const loginMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(loginMetrics.scrollWidth).toBeLessThanOrEqual(loginMetrics.clientWidth);
  const googleBox = await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .boundingBox();
  expect(googleBox?.height).toBeGreaterThanOrEqual(44);
});
