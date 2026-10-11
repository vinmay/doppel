// P5: a full fixture game at 390x844 on a fake clock: shot, result, pocket
// cooldown (survives a reload), hints, a winning shot, the found screen,
// share text, history. Screenshots go to ../docs/media/ (local only).
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const img = (f: string) => readFileSync(path.join(import.meta.dirname, "../../public/test-images", f));
const media = (f: string) => path.join(import.meta.dirname, "../../../docs/media", f);
const START = new Date("2026-10-10T14:00:00-04:00"); // Sat Oct 10, 2 pm in New York: Warmr #3

async function shoot(page: Page, name: string, file: string) {
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles({ name, mimeType: "image/jpeg", buffer: img(file) });
  await expect(page.getByRole("region", { name: "Shot result" })).toBeVisible();
}

test("full game: shots, pocket cooldown, hints, win, share, history", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: START });
  await page.goto("/?embedder=fake#/");
  await expect(page.locator(".hud").first()).toContainText("№3");
  await expect(page.getByText("unlocks after shot 3")).toBeVisible();
  await page.screenshot({ path: media("p5-today.png") });

  // shot 1: result screen with a thermal print, temperature and rank
  await shoot(page, "maple.jpg", "maple.jpg");
  const temp = page.getByRole("region", { name: "Shot result" }).getByTestId("temperature");
  await expect(temp).toHaveText(/^\d{1,3}°$/);
  await expect(page.getByTestId("rank")).toHaveText(/^#\d+$/);
  await expect.poll(() => page.locator("#thermal").evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0);
  await page.screenshot({ path: media("p5-result.png") });

  // after ~8 s: the pocket screen; no shooting until the cooldown ends
  await page.clock.runFor(8_500);
  await expect(page.getByText("Walk.")).toBeVisible();
  await expect(page.getByTestId("cooldown")).toHaveText(/^0:3[67]$/);
  await expect(page.locator(".topbar")).toBeHidden();
  await page.screenshot({ path: media("p5-pocket.png") });

  // the cooldown survives a reload (wall-clock timestamps)
  await page.reload();
  await expect(page.getByTestId("cooldown")).toHaveText(/^0:3[4-7]$/);
  await page.clock.runFor(40_000);
  await expect(page.getByTestId("shot-count")).toHaveText("01");
  await expect(page.locator(".strip .chip")).toHaveCount(1);

  // shots 2 and 3 unlock the first hint
  for (const f of ["mushroom.jpg", "hydrant.jpg"]) {
    await shoot(page, f, f);
    await page.clock.runFor(46_000);
  }
  await expect(page.getByText("HINT 1")).toBeVisible();
  await expect(page.locator(".hint.open")).toHaveCount(1);
  await page.screenshot({ path: media("p5-hints.png"), fullPage: true });

  // shot 4 "is" the secret (test mode: win*.jpg) -> found
  await shoot(page, "win.jpg", "hydrant.jpg");
  await expect(temp).toHaveText("100°");
  await page.clock.runFor(8_500);
  await expect(page.getByText("FOUND IN 4", { exact: true })).toBeVisible();
  await expect(page.getByTestId("secret")).not.toBeEmpty();
  await expect(page.getByTestId("share-text")).toHaveText(/^Warmr #3 · 4 shots · \S+🔥/);
  await expect(page.locator("#prints canvas")).toHaveCount(4);
  await page.screenshot({ path: media("p5-found.png"), fullPage: true });

  // share falls back to the clipboard where navigator.share is missing
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => void ((window as unknown as { copied: string }).copied = t) }, configurable: true });
  });
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByText("Copied to the clipboard.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toMatch(/^Warmr #3 · 4 shots/);

  // history: one day, found in 4, with four printed shots
  await page.goto("/?embedder=fake#/history");
  await expect(page.getByText("FOUND IN 4", { exact: true })).toBeVisible();
  await expect(page.locator(".day canvas")).toHaveCount(4);
  await page.screenshot({ path: media("p5-history.png"), fullPage: true });
});

test("give up reveals the secret", async ({ page }) => {
  await page.clock.install({ time: START });
  await page.goto("/?embedder=fake#/");
  await shoot(page, "maple.jpg", "maple.jpg");
  await page.clock.runFor(46_000);
  page.once("dialog", (d) => d.accept());
  await page.getByText("Give up and see the secret").click();
  await expect(page.getByText("GAVE UP AFTER 1", { exact: true })).toBeVisible();
  await expect(page.getByTestId("share-text")).toHaveText(/^Warmr #3 · gave up after 1 · /);
});
