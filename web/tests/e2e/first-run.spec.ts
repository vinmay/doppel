import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers";

// The real embedder (no ?embedder=fake), on a throttled network, with the
// 388 MB model download held open: the practice reveal must play anyway.
test("practice reveal and privacy line render before the model is ready @small", async ({ page, context }) => {
  await context.route(/huggingface\.co|\.litertlm/, () => new Promise(() => {})); // never answers
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 20_000 });
  await page.goto("/#/");
  const practice = page.getByTestId("practice");
  await expect(practice).toBeVisible({ timeout: 20_000 });
  await expect(practice.locator(".labels")).toHaveText(/cloud\s*↔\s*cotton/);
  await expect(practice.locator(".score .n")).toHaveText("85", { timeout: 20_000 });
  await expect(practice).toContainText("Both: fluffy · puffy · white");
  await expect(page.getByText("Photos never leave your phone.")).toBeVisible();
  // the model isn't ready: shooting is disabled and the status says why
  await expect(page.locator("#photo")).toBeDisabled();
  await expect(page.locator("#model-status")).not.toBeEmpty();
  await expect(page.locator(".test-banner")).toHaveCount(0);
  await expectAccessible(page, "first-run");
});
