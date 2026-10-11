import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { expectAccessible, fixture } from "./helpers";

// The demo round is easy to find from Today, with emphasis by device.
const MEDIA = path.join(import.meta.dirname, "../../../docs/media");
const markPlayed = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.open("doppel"); q.onsuccess = () => { const tx = q.result.transaction("meta", "readwrite"); tx.objectStore("meta").put(true, "played"); tx.oncomplete = () => r(); }; }));
const coral = (page: Page) => page.locator(".dock .btn-shoot");

test.describe("desktop without touch", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  test("the demo is the primary button; Photograph something is secondary", async ({ page }) => {
    await page.goto("/?embedder=fake#/");
    await markPlayed(page);
    await page.reload();
    await expect(coral(page)).toHaveText("Try a demo round");
    await expect(coral(page)).toHaveAttribute("href", "#/demo");
    await expect(page.locator(".dock .btn-secondary")).toHaveText("Photograph something");
    await expect(page.locator("#photo")).toHaveCount(1); // still possible to upload a photo
    await expect(page.locator(".demo-line")).toHaveCount(0); // no duplicate line
    await expectAccessible(page, "today desktop");
    expect(await page.locator("main").evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
    await page.screenshot({ path: path.join(MEDIA, "today-desktop-1280.png") });
  });
});

test("phone with a camera: Photograph something stays primary, the demo line is above the fold @small", async ({ page }) => {
  await page.goto("/?embedder=fake#/");
  await markPlayed(page);
  await page.reload();
  await expect(coral(page)).toHaveText("Photograph something");
  const line = page.getByTestId("demo-link");
  await expect(line).toHaveText(/^No time to go outside\? Try a 30-second\s+demo\s+→$/);
  await expect(line).toBeInViewport({ ratio: 1 });
  // directly under the headline and subline
  const h = (await page.getByRole("heading", { level: 1 }).boundingBox())!, l = (await line.boundingBox())!;
  expect(l.y).toBeGreaterThan(h.y + h.height);
  expect(l.y - (h.y + h.height)).toBeLessThan(90);
  await expectAccessible(page, "today phone");
  await page.screenshot({ path: path.join(MEDIA, `today-phone-${page.viewportSize()!.width}.png`) });
  // first run: same line under the headline, above the fold
  await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.open("doppel"); q.onsuccess = () => { const tx = q.result.transaction("meta", "readwrite"); tx.objectStore("meta").delete("played"); tx.oncomplete = () => r(); }; }));
  await page.reload();
  await expect(page.getByTestId("demo-link")).toBeInViewport({ ratio: 1 });
});

test("phone without a camera: the demo becomes primary", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.enumerateDevices = async () => [];
  });
  await page.goto("/?embedder=fake#/");
  await expect(coral(page)).toHaveText("Try a demo round");
});

test("after one real pair the demo is a small link at the bottom of Today", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T15:00:00-04:00") });
  await page.goto("/?embedder=fake#/");
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture("twins/02-tire.jpg"));
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await page.clock.fastForward(46_000);
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture("twins/02-donut.jpg"));
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
  await page.getByRole("button", { name: "Next pair" }).click();
  await expect(page.getByTestId("pair-n")).toHaveText("2");
  await expect(page.locator(".demo-line")).toHaveCount(0);
  const small = page.locator(".small-link").getByTestId("demo-link");
  await expect(small).toHaveText("Try a demo round");
  // at the bottom: after the ideas
  const ideas = (await page.locator(".ideas").boundingBox())!, s = (await small.boundingBox())!;
  expect(s.y).toBeGreaterThan(ideas.y);
  await expect(coral(page)).toHaveText("Photograph something");
  await expectAccessible(page, "today after a pair");
  await page.screenshot({ path: path.join(MEDIA, "today-after-pair.png") });
});
