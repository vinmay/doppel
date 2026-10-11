import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { expectAccessible, expectNoHorizontalScroll, fixture } from "./helpers";

// One app shell: the same header on every phase and route, one HUD row on every
// game screen, and photo frames that start at the same y (no layout jump).
const MEDIA = path.join(import.meta.dirname, "../../../docs/media/phases");

async function shoot(page: Page, rel: string) {
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture(rel));
}

for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`header, HUD and frames line up through a whole day at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(size);
    await page.clock.install({ time: new Date("2026-10-11T15:00:00-04:00") });
    await page.goto("/?embedder=fake#/");
    const headerY: number[] = [], frameY: Record<string, number> = {};
    let n = 0;

    const check = async (phase: string, opts: { hud?: boolean; frame?: boolean } = {}) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      const header = page.locator(".topbar");
      await expect(header).toBeVisible();
      await expect(header.getByRole("link", { name: "DOPPEL" })).toBeVisible();
      await expect(header.getByRole("link", { name: "Today" })).toBeVisible();
      await expect(header.getByRole("link", { name: "History" })).toBeVisible();
      const help = header.getByRole("link", { name: "How to play" });
      await expect(help).toBeVisible();
      await expect(help).toHaveText("?");
      const hb2 = (await help.boundingBox())!;
      expect(hb2.width, phase).toBeGreaterThanOrEqual(44);
      expect(hb2.height, phase).toBeGreaterThanOrEqual(44);
      const hb = (await header.boundingBox())!;
      headerY.push(hb.y);
      expect(hb.y, phase).toBe(0);
      expect(Math.round(hb.height), phase).toBe(56); // fixed height (border-box, rule included)
      const current = await header.locator("[aria-current]").getAttribute("data-nav");
      expect(current, phase).toBe(phase === "history" ? "history" : phase === "how" ? "how" : "today");
      if (opts.hud !== false) {
        await expect(page.locator(".hud"), phase).toHaveCount(1);
        await expect(page.locator(".hud").getByText(/^PAIR \d OF 3$/), phase).toBeVisible();
      } else await expect(page.locator(".hud"), phase).toHaveCount(0);
      if (opts.frame) frameY[phase] = (await page.locator(".pair .frame").first().boundingBox())!.y;
      await expectAccessible(page, phase);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: path.join(MEDIA, `${size.width}-${String(++n).padStart(2, "0")}-${phase}.png`) });
    };

    // the template starts at "85" and the count-up resets it to 0: wait for the developed state first
    await expect(page.locator("#practice-pair")).toHaveClass(/developed/);
    await page.clock.runFor(1500);
    await expect(page.locator(".practice .score .n")).toHaveText("85");
    // the first-run headline is fully above the dock, even on a short phone
    const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!, dock = (await page.locator(".dock").boundingBox())!;
    expect(h1.y + h1.height).toBeLessThanOrEqual(dock.y);
    await check("first-run", { frame: true });
    await expect(page.locator(".practice").getByRole("link", { name: "How to play" })).toBeVisible();
    await shoot(page, "twins/02-tire.jpg");
    await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
    await check("walk", { frame: true });
    expect(await page.locator(".topbar").evaluate((el) => getComputedStyle(el).opacity)).toBe("0.72"); // dimmed, phone away
    await page.clock.fastForward(46_000);
    await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
    await check("twin", { frame: true });
    await shoot(page, "twins/02-donut.jpg");
    await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
    await page.clock.runFor(2000);
    await expect(page.getByTestId("score").locator(".n")).toHaveText((await page.getByTestId("score").getAttribute("data-value"))!);
    await check("reveal", { frame: true });
    await page.getByRole("button", { name: /Try another twin/ }).click();
    await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
    await check("retry-walk", { frame: true });
    await page.clock.fastForward(46_000);
    await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
    await check("retry-twin", { frame: true });
    await shoot(page, "strangers/03-lake.jpg");
    await expect(page.getByTestId("best-of")).toBeVisible();
    await page.clock.runFor(2000);
    await expect(page.getByTestId("score").locator(".n")).toHaveText((await page.getByTestId("score").getAttribute("data-value"))!);
    await check("retry-reveal", { frame: true });
    await page.getByRole("button", { name: "Next pair" }).click();
    await check("first", { frame: true });
    for (const [a, b] of [["twins/01-cloud.jpg", "twins/01-cotton.jpg"], ["twins/05-pinecone.jpg", "twins/05-artichoke.jpg"]]) {
      await shoot(page, a);
      await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
      await page.clock.fastForward(46_000);
      await expect(page.getByRole("region", { name: "Twin photo" })).toBeVisible();
      await shoot(page, b);
      await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
      await page.clock.runFor(2000);
      await page.getByRole("button", { name: /Next pair|See today/ }).click();
    }
    await expect(page.getByRole("region", { name: "Done for today" })).toBeVisible();
    await page.clock.runFor(500);
    await check("done");
    await page.getByRole("link", { name: "History" }).click();
    await expect(page.getByRole("heading", { name: "Past Doppels" })).toBeVisible();
    await check("history", { hud: false });
    await page.getByRole("link", { name: "How to play" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "How to play" })).toBeVisible();
    await expect(page.getByText(/About 50 m, measured by GPS\. Without location, or with weak GPS, a 45-second timer instead\./)).toBeVisible();
    await expect(page.getByTestId("github")).toHaveAttribute("href", "https://github.com/vinmay/doppel");
    await expect(page.getByTestId("dev-post")).toBeVisible();
    await expect(page.getByText(/EmbeddingGemma 2/)).toBeVisible();
    for (const c of ["practice/CREDITS.md", "demo/CREDITS.md"]) expect((await page.request.get(`/${c}`)).status(), c).toBe(200);
    await check("how", { hud: false });

    expect(new Set(headerY).size).toBe(1);
    const ys = Object.values(frameY);
    expect(Math.max(...ys) - Math.min(...ys), JSON.stringify(frameY)).toBeLessThanOrEqual(0.5);
  });
}
