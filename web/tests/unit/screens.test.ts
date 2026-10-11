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
