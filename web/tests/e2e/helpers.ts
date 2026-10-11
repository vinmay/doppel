import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import path from "node:path";

export const FIXTURES = path.join(import.meta.dirname, "../fixtures");
export const fixture = (rel: string) => path.join(FIXTURES, rel);

/** Zero serious or critical axe violations on the current screen. */
export async function expectAccessible(page: Page, screen: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${screen}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** No horizontal page scroll. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
}
