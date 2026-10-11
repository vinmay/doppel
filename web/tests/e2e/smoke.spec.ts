import { expect, test } from "@playwright/test";
import { dayKey, secretFor } from "../../src/game";
import { PACKS_FOR_NODE, VOCAB_FOR_NODE } from "./packs-node";

test("today shows the HUD, a hidden secret and the shoot button", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.locator(".hud").first()).toContainText("WARMR");
  await expect(page.getByText("SECRET", { exact: true })).toBeVisible();
  await expect(page.getByText("Take a shot")).toBeVisible();
  // The secret's text must not be anywhere in the DOM before the game ends.
  const s = secretFor(dayKey(Date.now()), PACKS_FOR_NODE, VOCAB_FOR_NODE);
  expect(await page.content()).not.toContain(s.text);
});

test("history route renders", async ({ page }) => {
  await page.goto("/#/history");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("History");
});

test("no horizontal scroll at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const route of ["/#/", "/#/history"]) {
    await page.goto(route);
    await expect(page.locator("main")).not.toBeEmpty();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, route).toBe(0);
  }
});
