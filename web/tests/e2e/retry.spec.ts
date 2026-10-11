import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { expectAccessible, fixture } from "./helpers";

const MEDIA = path.join(import.meta.dirname, "../../../docs/media");
async function shoot(page: Page, rel: string) {
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture(rel));
}

test("Try another twin: one more walk, keeps the higher score, once per pair, survives reload", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T15:00:00-04:00") });
  await page.goto("/?embedder=fake#/");
  await shoot(page, "twins/02-tire.jpg");
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await page.clock.fastForward(46_000);
  await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
  await shoot(page, "twins/02-donut.jpg");
  await page.clock.runFor(2000);
  const first = Number(await page.getByTestId("score").getAttribute("data-value"));
  await expect(page.getByRole("button", { name: "Next pair" })).toBeVisible(); // still the primary action
  await page.getByRole("button", { name: /Try another twin/ }).click();

  await expect(page.getByRole("heading", { name: "Find another twin. Walk." })).toBeVisible();
  await page.reload(); // mid-retry walk
  await expect(page.getByRole("heading", { name: "Find another twin. Walk." })).toBeVisible();
  await page.clock.fastForward(46_000);
  await expect(page.getByRole("heading", { name: "Now another twin." })).toBeVisible();
  await shoot(page, "strangers/03-lake.jpg"); // a worse twin
  await page.clock.runFor(2000);
  await expect(page.getByTestId("best-of")).toContainText("Best of 2");
  const kept = Number(await page.getByTestId("score").getAttribute("data-value"));
  expect(kept).toBeGreaterThanOrEqual(first);
  if (kept === first) await expect(page.getByTestId("best-of")).toContainText("first twin scored higher");
  await expect(page.getByRole("button", { name: /Try another twin/ })).toHaveCount(0); // used up
  await expectAccessible(page, "reveal best of 2");
  await expect(page.getByTestId("score").locator(".n")).toHaveText(String(kept));
  await expect.poll(() => page.locator('[data-stack="a"] .print').evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await page.screenshot({ path: path.join(MEDIA, "g3-best-of-2.png") });
  await page.reload();
  await expect(page.getByTestId("best-of")).toContainText("Best of 2");
  await expect(page.getByRole("button", { name: /Try another twin/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Next pair" }).click();
  await expect(page.getByTestId("pair-n")).toHaveText("2");
});
