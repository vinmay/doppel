import { describe, expect, it } from "vitest";
import { revealView } from "../../src/ui/screens";

const pair = (bonus: number) => ({
  first: { id: "a", ts: 0, label: "tire" },
  twin: { id: "b", ts: 0, label: "donut" },
  result: { sim: 0.8, score: 70 + bonus, visual: 70, bonus, band: "cousins" as const, shared: ["round"], verdict: "x" },
});

describe("reveal: stretch line", () => {
  it("shows the bonus line only when earned", () => {
    expect(revealView(1, pair(8), false)).toContain("<b>+8</b> Stretch: these have nothing in common.");
    expect(revealView(1, pair(0), false)).not.toContain("Stretch");
  });
});

describe("band meter (fills left to right)", () => {
  it("Strangers ■□□□ through Uncanny ■■■■", async () => {
    const { bandMarks } = await import("../../src/ui/screens");
    const on = (h: string) => (h.match(/class="on"/g) ?? []).length;
    expect([on(bandMarks("strangers")), on(bandMarks("distant")), on(bandMarks("cousins")), on(bandMarks("uncanny"))]).toEqual([1, 2, 3, 4]);
    expect(bandMarks("distant")).toMatch(/^<span class="marks" aria-hidden="true"><i class="on"><\/i><i class="on"><\/i><i><\/i><i><\/i><\/span>$/);
  });
});
