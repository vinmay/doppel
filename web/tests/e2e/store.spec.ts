import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = path.join(import.meta.dirname, "../../public/test-images/maple.jpg");

test("a shot persists across reload, shows in history, exports, and deletes", async ({ page }) => {
  await page.goto("/?embedder=fake#/");
  await expect(page.locator("#photo")).toBeEnabled();
  await page.locator("#photo").setInputFiles(fixture);
  await expect(page.getByRole("region", { name: "Shot result" })).toBeVisible();
  await page.goto("/?embedder=fake#/history");
  await page.reload();
  await expect(page.locator(".day")).toHaveCount(1);
  await expect(page.locator(".day canvas")).toHaveCount(1);
  await expect(page.getByText("Secret still hidden.")).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByText("Export my shots").click()]);
  expect(download.suggestedFilename()).toMatch(/^warmr-shots-\d{4}-\d{2}-\d{2}\.zip$/);
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  expect(Object.keys(files).filter((f) => f.startsWith("thumbs/"))).toHaveLength(1);
  expect(JSON.parse(new TextDecoder().decode(files["shots.json"])).shots).toHaveLength(1);

  page.once("dialog", (d) => d.accept());
  await page.getByText("Delete everything").click();
  await expect(page.getByText("No shots yet.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("No shots yet.")).toBeVisible();
});
