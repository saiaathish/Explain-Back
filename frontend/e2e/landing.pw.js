import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing page explains the product and enters the workspace in one click", async ({
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
  await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    "https://github.com/saiaathish/Explain-Back",
  );

  const findings = await new AxeBuilder({ page }).analyze();
  expect(findings.violations).toEqual([]);

  await page.getByRole("button", { name: "Try it", exact: true }).click();
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

  const tryButton = page.getByRole("button", { name: "Try it", exact: true });
  await expect(tryButton).toBeVisible();
  const box = await tryButton.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
});
