import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import { expectAccessible, fixture } from "./helpers";

// F6: players always see their real photos. The two-ink print only flashes for
// ~400 ms at a reveal; the Wada inks live in the mat around each photo.
const MEDIA = path.join(import.meta.dirname, "../../../docs/media");

/** Distinct colors on a canvas: a print has 3 inks, a photo hundreds. */
const colors = (c: Locator) =>
  c.evaluate((el: HTMLCanvasElement) => {
    const d = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
    const s = new Set<number>();
    for (let i = 0; i < d.length; i += 4) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return s.size;
  });
const opacity = (l: Locator) => l.evaluate((el) => getComputedStyle(el).opacity);

async function shoot(page: Page, rel: string) {
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture(rel));
}

test("practice pair, reveal and history end on the real photos, in Wada mats", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T15:00:00-04:00") });
  await page.goto("/?embedder=fake#/");
  // practice pair: developing flash, then originals
  const pa = page.locator('[data-stack="practice-a"]');
  await expect.poll(() => colors(pa.locator(".photo"))).toBeGreaterThan(200);
  await page.clock.runFor(1500);
  await expect(page.locator(".practice .score .n")).toHaveText("85");
  await expect.poll(() => opacity(pa.locator(".print"))).toBe("0");
  await page.screenshot({ path: path.join(MEDIA, "0-first-run.png") });

  await shoot(page, "twins/03-tree-bark.jpg");
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await expect.poll(() => colors(page.locator("#photo-a"))).toBeGreaterThan(200);
  await page.clock.fastForward(46_000);
  await shoot(page, "twins/03-elephant-skin.jpg");
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();

  const a = page.locator('[data-stack="a"]'), b = page.locator('[data-stack="b"]');
  await expect.poll(() => colors(a.locator(".print"))).toBeLessThanOrEqual(3); // the flash layer
  expect(await opacity(a.locator(".print"))).toBe("1"); // developing...
  await page.clock.runFor(2000);
  await expect.poll(() => opacity(a.locator(".print"))).toBe("0"); // ...resolved to the originals
  await expect.poll(() => opacity(b.locator(".print"))).toBe("0");
  expect(await colors(a.locator(".photo"))).toBeGreaterThan(200);
  expect(await colors(b.locator(".photo"))).toBeGreaterThan(200);
  const score = await page.getByTestId("score").getAttribute("data-value");
  await expect(page.getByTestId("score").locator(".n")).toHaveText(score!);
  await expect(page.locator(".reveal .frame.mat")).toHaveCount(2);
  await page.screenshot({ path: path.join(MEDIA, "5-reveal.png") });
  await expectAccessible(page, "reveal");
  // no press-and-hold any more
  await expect(page.locator(".stack[tabindex]")).toHaveCount(0);

  await page.getByRole("button", { name: "Next pair" }).click();
  await page.goto("/?embedder=fake#/history");
  await expect(page.locator(".pairs li")).toHaveCount(1);
  for (const k of ["0-a", "0-b"]) {
    const h = page.locator(`[data-stack="${k}"]`);
    await expect.poll(() => colors(h.locator(".photo"))).toBeGreaterThan(100);
    await expect(h.locator(".print")).toHaveCount(0); // never tinted outside a reveal
  }
  await page.screenshot({ path: path.join(MEDIA, "7-history.png") });
  await expectAccessible(page, "history");
});

test("reduced motion: the reveal shows the originals at once, no flash", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-10-11T15:00:00-04:00") });
  await page.goto("/?embedder=fake#/");
  await shoot(page, "twins/03-tree-bark.jpg");
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await page.clock.fastForward(46_000);
  await shoot(page, "twins/03-elephant-skin.jpg");
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
  await expect(page.locator('[data-stack="a"] .print')).toBeHidden();
  await expect.poll(() => colors(page.locator('[data-stack="a"] .photo'))).toBeGreaterThan(200);
});
