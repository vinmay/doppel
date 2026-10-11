import { expect, test } from "@playwright/test";

// A browser that can't run the model: one clear message with a way forward, the practice still plays.
test("without WebGPU: one friendly message, a dimmed button, the practice still plays @small", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "gpu", { get: () => undefined, configurable: true }));
  await page.addInitScript(() => delete (Navigator.prototype as any).gpu);
  await page.goto("/#/");
  await expect(page.getByTestId("practice").locator(".score .n")).toHaveText("85", { timeout: 20_000 });
  const status = page.locator("#model-status");
  await expect(status).toContainText("This device can't run Doppel's model.");
  await expect(status).toContainText("Try Chrome on Android");
  await expect(page.locator("#status")).toBeEmpty();
  await expect(page.locator(".btn-shoot")).toHaveAttribute("aria-disabled", "true");
});
