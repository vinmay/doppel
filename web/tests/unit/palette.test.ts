// P4b: every color in the app comes from Sanzo Wada's dictionary
// (data/wada/colors.json), and the chosen base passes WCAG AA.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import wada from "../../../data/wada/colors.json";
import palette from "../../../data/wada/palette.json";

const WADA = new Set(wada.map((c) => c.hex.toLowerCase()));
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("Wada palette", () => {
  it("uses only hex colors from the dictionary in web/src, index.html, the manifest and the icon", () => {
    const sources = [
      ...files("src").filter((f) => /\.(css|ts)$/.test(f)),
      "index.html",
      "public/manifest.webmanifest",
      "public/icon.svg",
    ];
    const bad: string[] = [];
    for (const f of sources) {
      for (const m of readFileSync(f, "utf8").matchAll(HEX)) {
        if (!WADA.has(m[0].toLowerCase())) bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("has no rgb()/hsl() color literals that could sneak past the hex check", () => {
    const css = files("src").filter((f) => f.endsWith(".css"));
    const bad = css.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/\b(rgba?|hsla?)\(/g)].map((m) => `${f}: ${m[0]}`));
    expect(bad).toEqual([]);
  });

  it("base text passes AA on the ground and the surface; the accent and the hot numeral pass 3:1", () => {
    const { bg, fg, surface, accent } = palette.base;
    expect(contrast(fg.hex, bg.hex)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fg.hex, surface.hex)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent.hex, bg.hex)).toBeGreaterThanOrEqual(3);
    // temp-3..5 color the big numeral; cooler stops only tint the photo.
    for (const stop of palette.ramp.slice(3)) expect(contrast(stop.hex, bg.hex)).toBeGreaterThanOrEqual(3);
  });

  it("ramp stops are dictionary colors rising in L*", () => {
    const L = palette.ramp.map((c) => c.lab[0]);
    expect(palette.ramp.every((c) => WADA.has(c.hex))).toBe(true);
    expect(L).toEqual([...L].sort((a, b) => a - b));
  });
});
