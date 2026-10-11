import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, fixture } from "./helpers";

async function shoot(page: Page, rel: string) {
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture(rel));
}

test("Retake first photo from the walk and the twin screen, then finish the pair", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T15:00:00-04:00") });
  await page.goto("/?embedder=fake#/");
  await shoot(page, "twins/05-pinecone.jpg");
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await expectAccessible(page, "walk with retake");
  await page.getByRole("button", { name: "Retake first photo" }).click();
  await expect(page.getByRole("region", { name: "First photo" })).toBeVisible();
  await expect(page.getByTestId("pair-n")).toHaveText("1"); // nothing spent

  await shoot(page, "twins/05-artichoke.jpg");
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await page.clock.fastForward(46_000);
  await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
  await page.getByRole("button", { name: "Retake first photo" }).click();
  await expect(page.getByRole("region", { name: "First photo" })).toBeVisible();

  await shoot(page, "twins/04-moss.jpg");
  await expect(page.getByTestId("sees")).toHaveText(/^moss/);
  await page.clock.fastForward(46_000);
  await shoot(page, "twins/04-broccoli.jpg");
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
  await expect(page.getByTestId("labels")).toContainText("moss");
  await expect(page.getByRole("button", { name: "Retake first photo" })).toHaveCount(0); // hidden once the twin is taken
});
