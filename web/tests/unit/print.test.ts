import { describe, expect, it } from "vitest";
import { inksFor, levelRange, printPixels } from "../../src/print";

const gray = (vals: number[]) => Uint8ClampedArray.from(vals.flatMap((v) => [v, v, v, 255]));

describe("print auto-level", () => {
  it("finds the 2nd-98th percentile luminance", () => {
    const vals = Array.from({ length: 100 }, (_, i) => 150 + i); // 150..249, a pale low-contrast image
    const [lo, hi] = levelRange(gray(vals));
    expect(Math.round(lo * 255)).toBe(151);
    expect(Math.round(hi * 255)).toBe(247);
  });
  it("a low-contrast image still prints with the darkest and the lightest ink", () => {
    const vals = Array.from({ length: 256 }, (_, i) => 180 + (i % 40)); // narrow, pale
    const px = gray(vals);
    printPixels(px, 16, "uncanny");
    const inks = inksFor("uncanny").map((c) => c.join(","));
    const used = new Set<string>();
    for (let i = 0; i < px.length; i += 4) used.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
    expect(used.has(inks[0])).toBe(true);
    expect(used.has(inks[2])).toBe(true);
  });
  it("uses only ink colors and survives a flat image", () => {
    const px = gray(Array(64).fill(128));
    printPixels(px, 8, "neutral");
    const inks = new Set(inksFor("neutral").map((c) => c.join(",")));
    for (let i = 0; i < px.length; i += 4) expect(inks.has(`${px[i]},${px[i + 1]},${px[i + 2]}`)).toBe(true);
  });
});
