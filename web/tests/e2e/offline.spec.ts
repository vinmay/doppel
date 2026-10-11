import { expect, test } from "@playwright/test";
import { fixture } from "./helpers";

test("works offline after one online load: a whole round with no network", async ({ page, context }) => {
  await page.goto("/?embedder=fake#/");
  await expect(page.getByText("Photograph something")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("region", { name: "First photo" })).toBeVisible();
  // practice photos and vocab vectors come from the precache
  await expect(page.getByTestId("practice").locator(".score .n")).toHaveText("85", { timeout: 10_000 });
  await page.clock.install();
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture("twins/08-zebra.jpg"));
  await expect(page.getByRole("region", { name: "Walk" })).toBeVisible();
  await page.clock.fastForward(46_000);
  await page.locator("#photo").setInputFiles(fixture("twins/08-striped-awning.jpg"));
  await expect(page.getByRole("region", { name: "Reveal" })).toBeVisible();
  await expect(page.getByTestId("labels")).toContainText("zebra");
});

// One missing precache entry makes the service worker install fail, and
// `vite preview` hides that by answering unknown paths with index.html (200).
test("every precache entry exists and isn't an HTML fallback", async ({ request }) => {
  const sw = await (await request.get("/sw.js")).text();
  const list: string[] = JSON.parse(sw.match(/const __PRECACHE__ = (\[[^\]]*\]);/)![1]);
  expect(list).toContain("practice/cloud.jpg");
  for (const path of list) {
    const res = await request.get(path === "index.html" ? "/" : `/${path}`);
    expect(res.status(), path).toBe(200);
    if (path !== "index.html") expect(res.headers()["content-type"] ?? "", path).not.toContain("text/html");
  }
});
