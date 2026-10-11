import { expect, test } from "@playwright/test";

test("test build boots with the fake embedder @small", async ({ page }) => {
  await page.goto("/?embedder=fake#/");
  await expect(page.locator(".test-banner")).toContainText("fake embedder");
});
