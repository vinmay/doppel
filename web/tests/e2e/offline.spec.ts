import { expect, test } from "@playwright/test";
import path from "node:path";

const fixture = path.join(import.meta.dirname, "../../public/test-images/mushroom.jpg");

test("works offline after one online load", async ({ page, context }) => {
  await page.goto("/?embedder=fake#/");
  await expect(page.getByText("Take a shot")).toBeVisible();
  // Wait until the service worker has installed (precached the shell) and controls the page.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".hud").first()).toContainText("WARMR");

  // a full shot offline: vocab vectors come from the precache
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture);
  await expect(page.getByRole("region", { name: "Shot result" }).getByTestId("temperature")).toHaveText(/^\d{1,3}°$/);
  await expect(page.getByTestId("rank")).toHaveText(/^#\d+$/);

  await page.goto("/?embedder=fake#/history");
  await expect(page.locator(".day canvas")).toHaveCount(1);
});

// One missing precache entry makes the service worker install fail, and
// `vite preview` hides that by answering unknown paths with index.html (200).
// So check status AND content type for every entry.
test("every precache entry exists and isn't an HTML fallback", async ({ request }) => {
  const sw = await (await request.get("/sw.js")).text();
  const list: string[] = JSON.parse(sw.match(/const __PRECACHE__ = (\[[^\]]*\]);/)![1]);
  expect(list.length).toBeGreaterThan(5);
  for (const path of list) {
    const res = await request.get(path === "index.html" ? "/" : `/${path}`);
    expect(res.status(), path).toBe(200);
    if (path !== "index.html") expect(res.headers()["content-type"] ?? "", path).not.toContain("text/html");
  }
});
