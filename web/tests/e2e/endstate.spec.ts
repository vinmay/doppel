import { expect, test, type Page } from "@playwright/test";
import { fixture } from "./helpers";

// A tab backgrounded mid-reveal: requestAnimationFrame stops and transitions may
// never finish. The reveal must still end on the real photos with the final score.
async function freezeAnimations(page: Page) {
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0; // never fires
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "*, *::before, *::after { transition-duration: 1000s !important; transition-delay: 0s !important; }";
      document.head.append(st);
    });
  });
}
async function expectOriginals(page: Page) {
  for (const k of ["a", "b"]) {
    const print = page.locator(`[data-stack="${k}"] .print`);
    await expect.poll(() => print.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).visibility].join(" ")), { timeout: 5000 }).toBe("0 hidden");
    const photo = page.locator(`[data-stack="${k}"] .photo`);
    expect(await photo.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    const slot = page.locator(`[data-stack="${k}"]`).locator("xpath=ancestor::figure");
    expect(await slot.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  }
  const score = page.getByTestId("score");
  await expect(score.locator(".n")).toHaveText((await score.getAttribute("data-value"))!);
}

test("demo reveal ends on the originals even with animations frozen", async ({ page }) => {
  await freezeAnimations(page);
  await page.goto("/?embedder=fake#/demo");
  await page.getByRole("button", { name: "Show its twin" }).click();
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
  await expectOriginals(page);
});

test("real reveal ends on the originals even with animations frozen", async ({ page }) => {
  await freezeAnimations(page);
  await page.clock.install({ time: new Date("2026-10-11T15:00:00-04:00") });
  await page.goto("/?embedder=fake#/");
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture("twins/05-pinecone.jpg"));
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await page.clock.fastForward(46_000);
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture("twins/05-artichoke.jpg"));
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
  await page.clock.runFor(2000);
  await expectOriginals(page);
});
