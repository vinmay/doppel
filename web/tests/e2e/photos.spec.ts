import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import { expectAccessible, fixture } from "./helpers";

const MEDIA = path.join(import.meta.dirname, "../../../docs/media");

/** Number of distinct colors on a canvas: a print has 3 inks, a photo hundreds. */
const colors = (c: Locator) =>
  c.evaluate((el: HTMLCanvasElement) => {
    const d = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
    const s = new Set<number>();
    for (let i = 0; i < d.length; i += 4) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return s.size;
  });
const opacity = (l: Locator) => l.evaluate((el) => getComputedStyle(el).opacity);

async function toReveal(page: Page) {
  await page.clock.install({ time: new Date("2026-10-11T15:00:00-04:00") });
  await page.goto("/?embedder=fake#/");
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture("twins/03-tree-bark.jpg"));
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
}

test("confirmation shows the real photo; the reveal turns photos into prints; hold shows the photo", async ({ page }) => {
  await toReveal(page);
  const first = page.locator("#photo-a");
  await expect.poll(() => colors(first)).toBeGreaterThan(200); // untinted
  await page.clock.runFor(500);
  await page.screenshot({ path: path.join(MEDIA, "f5-confirmation-original.png") });
  await page.clock.fastForward(46_000);
  await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
  await expect.poll(() => colors(page.locator("#photo-a"))).toBeGreaterThan(200);
  await page.locator("#photo").setInputFiles(fixture("twins/03-elephant-skin.jpg"));
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();

  const a = page.locator('[data-stack="a"]');
  await expect.poll(() => colors(a.locator(".print"))).toBeLessThanOrEqual(3);
  await expect.poll(() => colors(a.locator(".photo"))).toBeGreaterThan(200);
  expect(await opacity(a.locator(".print"))).toBe("0"); // photos first
  await page.clock.runFor(2000);
  await expect.poll(() => opacity(a.locator(".print"))).toBe("1"); // then the print
  await page.screenshot({ path: path.join(MEDIA, "f5-reveal-print.png") });
  await expectAccessible(page, "reveal");

  const box = (await a.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => opacity(a.locator(".print"))).toBe("0");
  await page.screenshot({ path: path.join(MEDIA, "f5-hold-original.png") });
  await page.mouse.up();
  await expect.poll(() => opacity(a.locator(".print"))).toBe("1");

  // keyboard: hold Space on the focused print
  await a.focus();
  await page.keyboard.down(" ");
  await expect.poll(() => opacity(a.locator(".print"))).toBe("0");
  await page.keyboard.up(" ");
  await expect.poll(() => opacity(a.locator(".print"))).toBe("1");

  // History: same hold
  await page.getByRole("button", { name: "Next pair" }).click();
  await page.goto("/?embedder=fake#/history");
  await expect(page.locator(".pairs li")).toHaveCount(1);
  const h = page.locator('[data-stack="0-a"]');
  await expect.poll(() => colors(h.locator(".print"))).toBeLessThanOrEqual(3);
  await expect.poll(() => opacity(h.locator(".print"))).toBe("1");
  const hb = (await h.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await expect.poll(() => opacity(h.locator(".print"))).toBe("0");
  await page.mouse.up();
  await expect.poll(() => opacity(h.locator(".print"))).toBe("1");
  await expectAccessible(page, "history");
});

test("reduced motion: the reveal goes straight to the print", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toReveal(page);
  await page.clock.fastForward(46_000);
  await page.locator("#photo").setInputFiles(fixture("twins/03-elephant-skin.jpg"));
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
  await page.clock.runFor(50);
  await expect.poll(() => opacity(page.locator('[data-stack="a"] .print'))).toBe("1");
});
