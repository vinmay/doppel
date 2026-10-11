import { expect, test } from "@playwright/test";
import path from "node:path";

const fixture = path.join(import.meta.dirname, "../../public/test-images/hydrant.jpg");

test("capture: upload a photo, get a temperature and rank, store a <=512px thumbnail", async ({ page }) => {
  await page.goto("/?embedder=fake#/");
  await expect(page.getByText("Test mode")).toBeVisible();
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture);
  const result = page.getByRole("region", { name: "Shot result" });
  await expect(result.getByTestId("temperature")).toHaveText(/^\d{1,3}°$/);
  await expect(page.getByTestId("rank")).toHaveText(/^#\d+$/);
  await expect(result).toContainText(/OF \d{3}/);
  const side = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => (indexedDB.open("warmr").onsuccess = (e) => r((e.target as IDBOpenDBRequest).result)));
    const shots = await new Promise<{ thumbBlob: Blob }[]>((r) => (db.transaction("shots").objectStore("shots").getAll().onsuccess = (e) => r((e.target as IDBRequest).result)));
    const bmp = await createImageBitmap(shots[0].thumbBlob);
    return Math.max(bmp.width, bmp.height);
  });
  expect(side).toBeLessThanOrEqual(512);
});
