import { describe, expect, it } from "vitest";
import data from "../../../data/twin-ideas.json";
import { IDEAS, ideasFor } from "../../src/ideas";

const STOP = new Set(["something", "and", "with", "a", "an", "the", "of", "that", "like", "looks", "in", "on", "or", "is", "it", "its", "but", "very"]);
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]+/g)!.filter((w) => !STOP.has(w)).map((w) => (w.length > 3 ? w.replace(/s$/, "") : w)));

describe("twin-ideas.json", () => {
  it("has the schema and at least 60 ideas", () => {
    expect(typeof data.source).toBe("string");
    expect(data.count).toBe(data.ideas.length);
    expect(IDEAS.length).toBeGreaterThanOrEqual(60);
    for (const t of IDEAS) {
      expect(t, t).toMatch(/^Something [A-Za-z ,'-]+$/);
      expect(t.split(" ").length, t).toBeLessThanOrEqual(7);
    }
  });
  it("has no near-duplicates (content-word Jaccard < 0.5, no subsets)", () => {
    for (let i = 0; i < IDEAS.length; i++) {
      for (let j = i + 1; j < IDEAS.length; j++) {
        const a = words(IDEAS[i]), b = words(IDEAS[j]);
        const inter = [...a].filter((w) => b.has(w)).length;
        const jac = inter / new Set([...a, ...b]).size;
        expect(jac < 0.5 && inter < Math.min(a.size, b.size), `${IDEAS[i]} ~ ${IDEAS[j]}`).toBe(true);
      }
    }
  });
  it("picks 3 a day, stable per date, different across dates", () => {
    expect(ideasFor("2026-10-11")).toEqual(ideasFor("2026-10-11"));
    expect(ideasFor("2026-10-11")).toHaveLength(3);
    expect(ideasFor("2026-10-12")).not.toEqual(ideasFor("2026-10-11"));
  });
});

describe("ideasFor diversity", () => {
  it("never repeats a content word across the day's 3 ideas (60 days checked)", () => {
    for (let d = 1; d <= 60; d++) {
      const day = `2026-${String(10 + Math.floor(d / 31)).padStart(2, "0")}-${String((d % 28) + 1).padStart(2, "0")}`;
      const ws = ideasFor(day).flatMap((t) => [...new Set(t.toLowerCase().match(/[a-z]+/g)!.filter((w) => !["something", "and", "with", "a", "an", "the", "of", "that", "like", "in", "on", "or", "very"].includes(w)))]);
      expect(new Set(ws).size, day).toBe(ws.length);
    }
  });
});
