import { expect, test } from "@playwright/test";
import path from "node:path";
import { expectAccessible } from "./helpers";

const MEDIA = path.join(import.meta.dirname, "../../../docs/media");
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, permissions: [] }); // desktop, no camera, no location

test("demo round on desktop: no camera, walk skipped, real reveal, nothing saved", async ({ page }) => {
  await page.goto("/?embedder=fake#/");
  await page.getByTestId("demo-link").click();
  await expect(page.getByRole("region", { name: "Demo round" })).toBeVisible();
  await expect(page.getByTestId("demo-note")).toContainText("walk skipped");
  await expect(page.getByTestId("sees")).toHaveText(/^pinecone/);
  await expect(page.getByTestId("tries")).toBeVisible();
  await expect(page.locator("#photo")).toHaveCount(0); // no camera input anywhere in the demo
  await expectAccessible(page, "demo first");
  await page.getByRole("button", { name: "Show its twin" }).click();
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
  await expect(page.getByTestId("labels")).toContainText("artichoke");
  await expect(page.getByTestId("demo-hud")).toHaveText("DEMO ROUND");
  await expect(page.getByTestId("score")).toHaveAttribute("data-value", /^\d+$/);
  await page.waitForTimeout(1500);
  await expectAccessible(page, "demo reveal");
  await page.screenshot({ path: path.join(MEDIA, "demo-reveal-1280.png") });

  await page.getByRole("button", { name: "Another demo pair" }).click();
  await expect(page.getByTestId("sees")).toHaveText(/^tree bark/);

  // never written: History is empty and IndexedDB has no days
  await page.goto("/?embedder=fake#/history");
  await expect(page.getByText("Nothing yet.")).toBeVisible();
  const days = await page.evaluate(() => new Promise<number>((r) => { const q = indexedDB.open("doppel"); q.onsuccess = () => { const c = q.result.transaction("days").objectStore("days").count(); c.onsuccess = () => r(c.result); }; }));
  expect(days).toBe(0);

  // also reachable from the ? page
  await page.getByRole("link", { name: "How to play" }).click();
  await page.getByTestId("demo-link").click();
  await expect(page.getByRole("region", { name: "Demo round" })).toBeVisible();
});

test("demo waits for the model: shows download progress and starts only when ready", async ({ page, context }) => {
  await context.route(/huggingface\.co|\.litertlm/, () => new Promise(() => {})); // download never finishes
  await page.goto("/#/demo"); // real embedder
  await expect(page.getByRole("region", { name: "Demo round" })).toBeVisible();
  await expect(page.locator("#model-status")).not.toBeEmpty({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Show its twin" })).toBeDisabled();
  await expect(page.getByTestId("demo-note")).toBeVisible();
});
