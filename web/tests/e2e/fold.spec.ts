import { expect, test } from "@playwright/test";
import path from "node:path";
import { expectAccessible, fixture } from "./helpers";

const MEDIA = path.join(import.meta.dirname, "../../../docs/media");

// F3: the capture button sits fully inside the viewport on every shot screen,
// at 390x844 and at 375x667, and nothing important hides behind it.
for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`capture button is always above the fold at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.clock.install({ time: new Date("2026-10-11T15:00:00-04:00") });
    await page.goto("/?embedder=fake#/");
    const btn = page.locator(".btn-shoot");
    await expect(btn).toBeInViewport({ ratio: 1 }); // first run (practice reveal, the longest screen)
    await page.screenshot({ path: path.join(MEDIA, `f3-first-run-${size.width}.png`) });
    await expectAccessible(page, `first-run ${size.width}`);
    // scrolled to the end, the last line sits above the dock, not under it
    await page.mouse.wheel(0, 5000);
    const last = page.locator(".ideas summary");
    const [lb, db] = [await last.boundingBox(), await page.locator(".dock").boundingBox()];
    expect(lb!.y + lb!.height).toBeLessThanOrEqual(db!.y + 1);

    await expect(page.locator("#photo")).toBeEnabled();
    await page.locator("#photo").setInputFiles(fixture("twins/02-tire.jpg"));
    await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
    await page.clock.fastForward(46_000);
    await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
    await expect(btn).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: path.join(MEDIA, `f3-twin-${size.width}.png`) });
    await expectAccessible(page, `twin ${size.width}`);
    await expect(page.locator("#photo")).toBeEnabled();
    await page.locator("#photo").setInputFiles(fixture("twins/02-donut.jpg"));
    await expect(page.getByRole("button", { name: "Next pair" })).toBeInViewport({ ratio: 1 });
    await page.clock.runFor(1500);
    const filled = { STRANGERS: 1, DISTANT: 2, COUSINS: 3, UNCANNY: 4 }[(await page.getByTestId("band").textContent())!]!;
    await expect(page.locator(".reveal .marks i.on")).toHaveCount(filled); // fills left to right
    await expect(page.locator(".reveal .marks i")).toHaveCount(4);
    await page.screenshot({ path: path.join(MEDIA, `f3-reveal-${size.width}.png`) });
    await expectAccessible(page, `reveal ${size.width}`);
  });
}
