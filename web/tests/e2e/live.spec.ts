import { expect, test } from "@playwright/test";

// Live smoke (PW_BASE_URL=https://<deployment> npm run test:live).
test.skip(!process.env.PW_BASE_URL, "set PW_BASE_URL to the deployed URL");

test("live: page loads and the service worker registers", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Doppel");
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), { timeout: 15_000 }).toBe(true);
});
