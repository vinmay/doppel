import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { expectAccessible, expectNoHorizontalScroll, fixture } from "./helpers";

const MEDIA = path.join(import.meta.dirname, "../../../docs/media");
const START = new Date("2026-10-11T15:00:00-04:00"); // mid-afternoon, well after sunrise

async function open(page: Page, url = "/?embedder=fake#/") {
  await page.clock.install({ time: START });
  await page.goto(url);
}

async function shoot(page: Page, rel: string) {
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture(rel));
}

/** Let the 45 s timer run out (no GPS permission -> timer fallback). */
async function walkByTimer(page: Page) {
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await page.clock.fastForward(46_000);
  await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
}

async function snap(page: Page, name: string, shots: boolean) {
  await expectAccessible(page, name);
  await expectNoHorizontalScroll(page);
  if (shots) await page.screenshot({ path: path.join(MEDIA, `${name}.png`) });
}

async function playPair(page: Page, a: string, b: string, shots = false, n = 1) {
  await expect(page.getByTestId("pair-n")).toHaveText(String(n));
  await shoot(page, a);
  await walkByTimer(page);
  if (shots) await snap(page, "4-twin", shots);
  await shoot(page, b);
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
  await page.clock.runFor(1500); // slide + count-up
  await expect(page.getByTestId("score")).toHaveText(/^\d{1,3}\/100$/);
  const score = Number(await page.getByTestId("score").getAttribute("data-value"));
  await expect(page.getByTestId("score").locator(".n")).toHaveText(String(score));
  return score;
}

test("first run: the first screen explains the game, shows the privacy line and asks for no permission @small", async ({ page, context }) => {
  const asked: string[] = [];
  await context.exposeFunction("__permAsked", (p: string) => asked.push(p));
  await page.addInitScript(() => {
    const geo = navigator.geolocation;
    const orig = geo.watchPosition.bind(geo);
    geo.watchPosition = (...a: Parameters<typeof orig>) => ((window as any).__permAsked("geolocation"), orig(...a));
  });
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find two different things that look the same. Outside.");
  await expect(page.getByTestId("practice")).toBeVisible();
  await expect(page.getByText("Photos never leave your phone.")).toBeVisible();
  await expect(page.getByText("Photograph something")).toBeVisible();
  await page.clock.runFor(2000);
  expect(asked).toEqual([]);
});

test("full day: 3 pairs, reveal, best pair, done for today", async ({ page }) => {
  await open(page);
  await page.clock.runFor(1500);
  await expect(page.locator(".practice .score .n")).toHaveText("85");
  await snap(page, "0-first-run-fake", false);
  // after the first accepted shot the practice reveal is gone for good
  await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.open("doppel"); q.onsuccess = () => { const tx = q.result.transaction("meta", "readwrite"); tx.objectStore("meta").put(true, "played"); tx.oncomplete = () => r(); }; }));
  await page.reload();
  await snap(page, "1-first", true);
  await page.getByText("Need an idea?").click();
  await expect(page.getByTestId("ideas").locator("li")).toHaveCount(3);
  await snap(page, "2-ideas", true);
  await page.getByText("Need an idea?").click();

  await shoot(page, "twins/02-tire.jpg");
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await expect(page.getByTestId("sees")).toHaveText(/^tire( \/ [a-z ]+)?$/);
  await expect(page.getByTestId("walk-left")).toHaveText(/^0:4\d$/); // no GPS permission -> timer
  await expect(page.getByTestId("look-for")).toHaveText(/^Look for something .+\.$/);
  await expect(page.getByTestId("tries")).toHaveText(/^Try [a-z ]+( · [a-z ]+){2}$/);
  await page.clock.runFor(500);
  await snap(page, "3-walk", true);
  await page.clock.fastForward(46_000);
  await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
  await snap(page, "4-twin", true);
  await shoot(page, "twins/02-donut.jpg");
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
  await page.clock.runFor(1500);
  await expect(page.getByTestId("labels")).toContainText("tire");
  await expect(page.getByTestId("labels")).toContainText("donut");
  await expect(page.getByTestId("band")).toHaveText(/UNCANNY|COUSINS|DISTANT|STRANGERS/);
  await expect(page.getByTestId("walked")).toHaveText("WALKED BY TIMER");
  await expect(page.getByTestId("verdict")).not.toBeEmpty();
  await expect(page.getByTestId("shared")).toContainText(/Both: |Not much, honestly\./);
  await snap(page, "5-reveal-fullday", false);
  const s1 = Number(await page.getByTestId("score").getAttribute("data-value"));
  await page.getByRole("button", { name: "Next pair" }).click();

  const s2 = await playPair(page, "twins/01-cloud.jpg", "twins/01-cotton.jpg", false, 2);
  await page.getByRole("button", { name: "Next pair" }).click();
  const s3 = await playPair(page, "twins/05-pinecone.jpg", "twins/05-artichoke.jpg", false, 3);
  await page.getByRole("button", { name: "See today" }).click();

  await expect(page.getByRole("region", { name: "Done for today" })).toBeVisible();
  await expect(page.locator(".pairs li")).toHaveCount(3);
  const best = Math.max(s1, s2, s3);
  await expect(page.locator(".done .band")).toContainText(`${best}/100`);
  await expect(page.getByTestId("walked")).toHaveText("WALKED BY TIMER"); // no GPS: never "0 M WALKED"
  await expect(page.getByTestId("next-day")).not.toBeEmpty();
  await page.clock.runFor(500);
  await snap(page, "6-done", true);

  await page.goto("/?embedder=fake#/history");
  await expect(page.locator(".pairs li")).toHaveCount(1);
  await snap(page, "7-history-fullday", false);
});

test("each refusal shows its message and doesn't spend the shot", async ({ page }) => {
  await open(page);
  const refusal = page.locator("#refusal");
  for (const [file, msg] of [
    ["reject/phone-screen.jpg", "Take it outside."],
    ["reject/indoor-room.jpg", "Take it outside."],
    ["reject/document.jpg", "Take it outside."],
    ["reject/dark-blurry-photo.jpg", "Doppel can't tell what that is."],
  ]) {
    await shoot(page, file);
    await expect(refusal).toContainText(msg);
    await expect(refusal).toContainText("Not counted.");
    await expect(page.getByRole("region", { name: "First photo" })).toBeVisible();
  }
  await snap(page, "8-refused", true);

  await shoot(page, "same-kind/01-rock-a.jpg");
  await walkByTimer(page);
  await shoot(page, "same-kind/01-rock-a.jpg");
  await expect(refusal).toContainText("That's the same thing twice.");
  await shoot(page, "same-kind/01-rock-b.jpg");
  await expect(refusal).toContainText("That's the same kind of thing.");
  await shoot(page, "reject/phone-screen.jpg");
  await expect(refusal).toContainText("Take it outside.");
  await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
  await expect(page.getByTestId("pair-n")).toHaveText("1"); // nothing spent
  await shoot(page, "twins/04-moss.jpg");
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
});

test("reload during the walk and during the twin shot restores state; the timer keeps running", async ({ page }) => {
  await open(page);
  await shoot(page, "twins/03-tree-bark.jpg");
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await page.clock.fastForward(20_000);
  await page.reload();
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await expect(page.getByTestId("walk-left")).toHaveText(/^0:2\d$/); // ~25 s left, not 45
  await page.clock.fastForward(26_000);
  await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
  await expect(page.getByTestId("sees")).toHaveText(/^tree bark( \/ [a-z ]+)?$/);
  await shoot(page, "twins/03-elephant-skin.jpg");
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
});

test("walking 50 m with GPS unlocks the twin and counts the distance", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  const at = (m: number) => ({ latitude: 35.2 + m / 111_195, longitude: -80.84, accuracy: 5 });
  await context.setGeolocation(at(0));
  await open(page);
  await shoot(page, "twins/06-brick-wall.jpg");
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  for (const m of [10, 20, 30, 40]) {
    await context.setGeolocation(at(m));
    await page.clock.runFor(1000);
  }
  await expect(page.getByTestId("walk-left")).toHaveText(/^1\d m$/);
  await context.setGeolocation(at(55));
  await page.clock.runFor(1000);
  await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
  await expect(page.getByTestId("walked")).toHaveText(/^5\d M WALKED$/); // real distance shows as metres
});

test("Need an idea? shows 3 hints, the same all day, different the next day; the daily theme shows", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("theme")).toHaveText(/^Today: (Textures|Round things|Stripes and lines|Soft things|Rough things|Shiny things)$/);
  const theme = await page.getByTestId("theme").textContent();
  await page.reload();
  await expect(page.getByTestId("theme")).toHaveText(theme!);
  await page.getByText("Need an idea?").click();
  const today = await page.getByTestId("ideas").locator("li").allTextContents();
  expect(today).toHaveLength(3);
  await page.reload();
  await page.getByText("Need an idea?").click();
  expect(await page.getByTestId("ideas").locator("li").allTextContents()).toEqual(today);
  await page.clock.fastForward("24:00:00");
  await page.reload();
  await page.getByText("Need an idea?").click();
  expect(await page.getByTestId("ideas").locator("li").allTextContents()).not.toEqual(today);
});

test("small phone: a whole pair fits without horizontal scroll @small", async ({ page }) => {
  await open(page);
  await expectNoHorizontalScroll(page);
  await playPair(page, "twins/07-honeycomb.jpg", "twins/07-hexagonal-tiles.jpg");
  await expectNoHorizontalScroll(page);
  await expect(page.getByRole("button", { name: "Next pair" })).toBeInViewport();
});
