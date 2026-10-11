import { expect, test } from "@playwright/test";

// IndexedDB held by another tab must never leave Doppel blank.
test("an old tab holding an older DB version: message, Today frame, retry, then recovery", async ({ context }) => {
  const old = await context.newPage();
  await old.goto("/?embedder=fake#/history"); // same origin
  // simulate an old Doppel tab: holds "doppel" at version 1 and ignores versionchange
  await old.evaluate(() => new Promise<void>((r) => {
    indexedDB.deleteDatabase("doppel").onsuccess = () => {
      const q = indexedDB.open("doppel", 1);
      q.onsuccess = () => ((window as any).__held = q.result, r());
    };
  }));
  await old.evaluate(() => location.hash = "#/how"); // keep the page, not the app's own DB use
  const page = await context.newPage();
  await page.clock.install();
  await page.goto("/?embedder=fake#/");
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.getByRole("region", { name: "Loading today" })).toBeVisible(); // not blank
  await expect(page.locator(".app-notice")).toContainText("Close other Doppel tabs, then reload.");
  await page.clock.fastForward(5_100);
  await expect(page.getByTestId("storage-retry")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  // the old tab lets go: the waiting open completes and Today fills in by itself
  await old.evaluate(() => (window as any).__held.close());
  await expect(page.getByRole("region", { name: "First photo" })).toBeVisible();
});

test("a newer Doppel in another tab: this tab closes its DB and asks to reload", async ({ context }) => {
  const page = await context.newPage();
  await page.goto("/?embedder=fake#/");
  await expect(page.getByRole("region", { name: "First photo" })).toBeVisible();
  const newer = await context.newPage();
  await newer.goto("/?embedder=fake#/how");
  const opened = await newer.evaluate(() => new Promise<string>((r) => {
    const q = indexedDB.open("doppel", 99);
    q.onblocked = () => r("blocked");
    q.onsuccess = () => (q.result.close(), r("opened"));
  }));
  expect(opened).toBe("opened"); // our tab closed its connection, so the upgrade wasn't blocked
  await expect(page.locator(".app-notice")).toContainText("Doppel was updated. Reload to continue.");
  await expect(page.getByRole("region", { name: "First photo" })).toBeVisible(); // still not blank
});
