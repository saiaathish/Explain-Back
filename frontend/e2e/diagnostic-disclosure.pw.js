import { expect, test, signIn } from "./fixtures/local-auth.js";

async function mockBiologyAnalysis(page) {
  await page.route("**/api/analyze", async (route) => {
    const explanation = route.request().postDataJSON().explanation;
    const yellowText =
      "The pump maintains different sodium and potassium concentrations across the cell membrane.";
    const redText =
      "It moves three potassium ions out of the cell and two sodium ions into the cell.";
    const yellowStart = explanation.indexOf(yellowText);
    const redStart = explanation.indexOf(redText);
    const flags = [
      {
        prop_id: "biology-yellow",
        state: "yellow",
        start: yellowStart,
        end: yellowStart + yellowText.length,
        concept_id: "gradients",
        anchor: "The pump maintains sodium and potassium gradients.",
        hint: "Explain what the gradients support.",
        misconception: null,
        refutation: "The claim is directionally right but needs its consequence.",
        similarity: 0.8,
      },
      {
        prop_id: "biology-red",
        state: "red",
        start: redStart,
        end: redStart + redText.length,
        concept_id: "transport",
        anchor: "Three sodium ions leave while two potassium ions enter.",
        hint: "Reverse the ion directions and numbers.",
        misconception: "The ion directions are reversed.",
        refutation: "The pump exports sodium and imports potassium.",
        similarity: 0.2,
      },
    ];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        concepts: [
          { id: "gradients", label: "Ion gradients", anchor: "The pump maintains gradients." },
          { id: "transport", label: "Active transport", anchor: "The pump uses ATP." },
        ],
        flags: flags.filter((flag) => flag.start >= 0),
        follow_up: "Explain why the gradients matter.",
        coverage: { covered: [], partial: ["gradients"], missing: ["transport"] },
      }),
    });
  });
}

test("diagnostic disclosure supports pointer, keyboard, and touch", async ({ page }, testInfo) => {
  await mockBiologyAnalysis(page);
  await signIn(page, "/");
  await page.getByRole("button", { name: "Biology", exact: true }).click();
  await expect(page.locator("#explanation")).not.toHaveValue("");
  await page.getByRole("button", { name: "Check my explanation", exact: true }).click();
  await expect(page.locator(".results")).toBeVisible();

  const diagnostic = page.locator(".diagnostic:not(.diagnostic--green)").first();
  await expect(diagnostic).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(diagnostic).toHaveAttribute("role", "button");
  await expect(diagnostic).toHaveAttribute("tabindex", "0");
  await expect(diagnostic).toHaveAttribute("aria-expanded", "false");
  const tooltipId = await diagnostic.getAttribute("aria-controls");
  expect(tooltipId).toBeTruthy();
  const tooltip = page.locator(`#${tooltipId}`);
  await expect(tooltip).toHaveAttribute("role", "tooltip");
  await expect(tooltip).toBeHidden();

  await diagnostic.focus();
  await expect(diagnostic).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(diagnostic).toHaveAttribute("aria-expanded", "false");
  await expect(tooltip).toBeHidden();

  await page.keyboard.press("Enter");
  await expect(diagnostic).toHaveAttribute("aria-expanded", "true");
  await expect(tooltip).toBeVisible();
  await page.keyboard.press(" ");
  await expect(diagnostic).toHaveAttribute("aria-expanded", "false");
  await expect(tooltip).toBeHidden();
  await page.keyboard.press(" ");
  await expect(diagnostic).toHaveAttribute("aria-expanded", "true");
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(diagnostic).toHaveAttribute("aria-expanded", "false");

  if (testInfo.project.name === "desktop-chrome") {
    await diagnostic.hover();
    await expect(diagnostic).toHaveAttribute("aria-expanded", "true");
    await expect(tooltip).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(diagnostic).toHaveAttribute("aria-expanded", "false");
    await expect(tooltip).toBeHidden();
  } else if (testInfo.project.name === "iphone-14") {
    await diagnostic.tap();
    await expect(diagnostic).toHaveAttribute("aria-expanded", "true");
    await expect(tooltip).toBeVisible();
    await diagnostic.tap();
    await expect(diagnostic).toHaveAttribute("aria-expanded", "false");
    await expect(tooltip).toBeHidden();
  }
});
