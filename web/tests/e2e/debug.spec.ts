import { expect, test } from "@playwright/test";

test("?debug=1 panel shows backend and timings (fake embedder)", async ({ page }) => {
  await page.goto("/?embedder=fake&debug=1#/");
  const panel = page.getByRole("region", { name: "Debug" });
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("dbg-backend")).toHaveText("fake");
  await expect(page.getByTestId("dbg-load")).toHaveText("1234 ms");
  await page.getByText("Run self-test").click();
  await expect(page.locator("#dbg-out")).toContainText("SELFTEST_PASS backend=fake");
  await expect(page.getByTestId("dbg-image")).toHaveText("42 ms");
});

test("no debug panel without ?debug", async ({ page }) => {
  await page.goto("/?embedder=fake#/");
  await expect(page.getByText("Take a shot")).toBeVisible();
  await expect(page.getByRole("region", { name: "Debug" })).toHaveCount(0);
});
