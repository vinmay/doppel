import { expect, test, type Page } from "@playwright/test";

// Nothing readable may sit under the dock (the primary button), at any size or
// scroll position: the visible part of every text element (after clipping by
// its scroll area) must not intersect the dock.
async function textUnderDock(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const dock = document.querySelector(".dock")!.getBoundingClientRect();
    const out: string[] = [];
    const walker = document.createTreeWalker(document.querySelector("main")!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement!;
      if (!n.textContent!.trim() || el.closest(".dock") || getComputedStyle(el).visibility === "hidden") continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        let top = r.top, bottom = r.bottom;
        for (let a = el.parentElement; a; a = a.parentElement) {
          const o = getComputedStyle(a).overflowY;
          if (o === "auto" || o === "scroll" || o === "hidden") {
            const c = a.getBoundingClientRect();
            top = Math.max(top, c.top);
            bottom = Math.min(bottom, c.bottom);
          }
        }
        if (bottom - top > 0.5 && top < dock.bottom && bottom > dock.top) out.push(`"${n.textContent!.trim().slice(0, 30)}" ${Math.round(top)}-${Math.round(bottom)} vs dock ${Math.round(dock.top)}`);
      }
    }
    return out;
  });
}

const sizes = [
  { width: 375, height: 812, mobile: true },
  { width: 375, height: 667, mobile: true },
  { width: 1280, height: 800, mobile: false },
];
for (const { width, height, mobile } of sizes) {
  test.describe(`${width}x${height}`, () => {
    test.use({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    test(`no visible text under the dock on Today (first visit and returning), top and bottom of scroll`, async ({ page }) => {
      await page.goto("/?embedder=fake#/");
      for (const visit of ["first", "returning"]) {
        await expect(page.locator(".dock")).toBeVisible();
        for (const pos of ["top", "bottom"]) {
          await page.evaluate((p) => {
            const el = document.querySelector(".scroll") ?? document.scrollingElement!; // (page scroll in the old sticky layout)
            el.scrollTop = p === "top" ? 0 : el.scrollHeight;
          }, pos);
          expect(await textUnderDock(page), `${visit} visit, ${pos}`).toEqual([]);
        }
        if (visit === "first") {
          await page.evaluate(() => new Promise<void>((r) => { const q = indexedDB.open("doppel"); q.onsuccess = () => { const tx = q.result.transaction("meta", "readwrite"); tx.objectStore("meta").put(true, "played"); tx.oncomplete = () => r(); }; }));
          await page.reload();
        }
      }
    });
  });
}
