import { describe, expect, it } from "vitest";
import {
  band,
  BAND_NAMES,
  checkShot,
  checkTwin,
  cosine,
  judgePair,
  readPhoto,
  sharedAttributes,
  TWIN,
  twinScore,
  unit,
  VERDICTS,
  verdictLine,
  type LabelVocab,
  type TwinConfig,
} from "../../src/twin";

// A tiny 6-d world. Axes: 0 tire-ish, 1 donut-ish, 2 screen-ish, 3 dark, 4 round, 5 striped.
const e = (...xs: number[]) => unit(xs);
const ROWS: [string, LabelVocab["items"][number]["kind"], Float32Array][] = [
  ["tire", "thing", e(1, 0, 0, 0, 0.2, 0)],
  ["wheel", "thing", e(1, 0.05, 0, 0, 0.25, 0)], // synonym of tire (text sim > 0.9)
  ["donut", "thing", e(0, 1, 0, 0, 0.2, 0)],
  ["phone screen", "reject", e(0, 0, 1, 0, 0, 0)],
  ["dark blurry photo", "unclear", e(0, 0, 0, 1, 0, 0)],
  ["round", "attr", e(0, 0, 0, 0, 1, 0)],
  ["striped", "attr", e(0, 0, 0, 0, 0, 1)],
];
const vocab: LabelVocab = {
  items: ROWS.map(([label, kind]) => ({ label, kind })),
  vectors: Float32Array.from(ROWS.flatMap(([, , v]) => [...v])),
  dim: 6,
};
const cfg: TwinConfig = {
  lo: 0.5,
  hi: 0.9,
  bands: { uncanny: 80, cousins: 55, distant: 30 },
  duplicateSim: 0.97,
  sameKindTextSim: 0.9,
  margin: 0.003,
  attrZ: 1,
  attr: { labels: ["round", "striped"], mu: [0.2, 0.1], sd: [0.1, 0.1] },
};

describe("twinScore", () => {
  it("maps lo to 0 and hi to 100, linearly between", () => {
    expect(twinScore(0.5, cfg)).toBe(0);
    expect(twinScore(0.9, cfg)).toBe(100);
    expect(twinScore(0.7, cfg)).toBe(50);
  });
  it("clamps outside the calibrated range", () => {
    expect(twinScore(-1, cfg)).toBe(0);
    expect(twinScore(0.2, cfg)).toBe(0);
    expect(twinScore(0.99, cfg)).toBe(100);
    expect(twinScore(1, cfg)).toBe(100);
  });
  it("rejects NaN and a broken config", () => {
    expect(() => twinScore(NaN, cfg)).toThrow(/NaN/);
    expect(() => twinScore(0.7, { lo: 0.9, hi: 0.5 })).toThrow(/hi must be above lo/);
  });
  it("uses the shipped calibration by default", () => {
    expect(twinScore(TWIN.lo)).toBe(0);
    expect(twinScore(TWIN.hi)).toBe(100);
  });
});

describe("band", () => {
  it("has exact boundaries", () => {
    expect(band(100, cfg)).toBe("uncanny");
    expect(band(80, cfg)).toBe("uncanny");
    expect(band(79, cfg)).toBe("cousins");
    expect(band(55, cfg)).toBe("cousins");
    expect(band(54, cfg)).toBe("distant");
    expect(band(30, cfg)).toBe("distant");
    expect(band(29, cfg)).toBe("strangers");
    expect(band(0, cfg)).toBe("strangers");
  });
  it("rejects NaN", () => expect(() => band(NaN, cfg)).toThrow());
  it("names every band", () => expect(Object.keys(BAND_NAMES)).toHaveLength(4));
});

describe("cosine and unit", () => {
  it("is 1 for parallel vectors of any length", () => expect(cosine([2, 0, 0], [5, 0, 0])).toBeCloseTo(1));
  it("guards NaN and zero vectors", () => {
    expect(() => cosine([NaN, 1], [1, 1])).toThrow(/NaN/);
    expect(() => cosine([0, 0], [1, 1])).toThrow(/zero/);
    expect(() => unit([0, 0, 0])).toThrow(/zero/);
  });
  it("rejects a dimension mismatch", () => expect(() => cosine([1, 0], [1, 0, 0])).toThrow(/mismatch/));
});

describe("readPhoto", () => {
  it("labels a photo with the nearest non-attribute row", () => {
    const r = readPhoto(e(0, 1, 0, 0, 0.9, 0), vocab, cfg);
    expect(r.label).toBe("donut");
    expect(r.kind).toBe("thing");
  });
  it("measures the margin against a different kind, not a synonym", () => {
    // tire-ish photo: wheel is nearly as close but is a synonym, so the rival is donut
    const r = readPhoto(e(1, 0.02, 0, 0, 0.22, 0), vocab, cfg);
    expect(["tire", "wheel"]).toContain(r.label);
    expect(r.margin).toBeGreaterThan(0.5);
  });
  it("gives a small margin when two different kinds tie", () => {
    // halfway between wheel and donut: an exact tie between two different kinds
    const w = ROWS[1][2], d = ROWS[2][2];
    const r = readPhoto(unit(w.map((x, i) => x + d[i])), vocab, cfg);
    expect(r.margin).toBeLessThan(cfg.margin);
    expect(checkShot(r, cfg)).toBe("uncertain");
  });
  it("computes attribute z-scores in config order", () => {
    const r = readPhoto(e(0, 1, 0, 0, 1, 0), vocab, cfg);
    expect(r.attrZ).toHaveLength(2);
    expect(r.attrZ[0]).toBeGreaterThan(r.attrZ[1]); // round, not striped
  });
  it("guards NaN, zero and mismatched photos", () => {
    expect(() => readPhoto([NaN, 0, 0, 0, 0, 0], vocab, cfg)).toThrow(/NaN/);
    expect(() => readPhoto([0, 0, 0, 0, 0, 0], vocab, cfg)).toThrow(/zero/);
    expect(() => readPhoto([1, 0, 0], vocab, cfg)).toThrow(/dims/);
  });
  it("throws if an attribute is missing from the vocab", () => {
    expect(() => readPhoto(e(1, 0, 0, 0, 0, 0), vocab, { ...cfg, attr: { labels: ["fluffy"], mu: [0], sd: [1] } })).toThrow(/fluffy/);
  });
});

describe("validity rules", () => {
  const shot = (v: Float32Array) => ({ vector: v, reading: readPhoto(v, vocab, cfg) });
  const tire = shot(e(1, 0, 0, 0, 0.2, 0));

  it("accepts a clear outdoor thing", () => expect(checkShot(tire.reading, cfg)).toBeUndefined());
  it("sends screens, rooms, documents and people outside", () => {
    expect(checkShot(readPhoto(e(0, 0, 1, 0, 0, 0), vocab, cfg), cfg)).toBe("outside");
  });
  it("flags dark or blurry photos as uncertain", () => {
    expect(checkShot(readPhoto(e(0, 0, 0, 1, 0, 0), vocab, cfg), cfg)).toBe("uncertain");
  });
  it("refuses the same photo twice", () => {
    expect(checkTwin(tire, shot(e(1, 0, 0, 0, 0.2, 0.001)), vocab, cfg)).toBe("duplicate");
  });
  it("refuses the same kind of thing (equal labels)", () => {
    expect(checkTwin(tire, shot(e(1, 0, 0, 0, 0.6, 0.3)), vocab, cfg)).toBe("same-kind");
  });
  it("refuses the same kind of thing (labels that mean the same)", () => {
    const wheel = shot(e(1, 0.06, 0, 0, 0.25, 0.4));
    expect(wheel.reading.label).toBe("wheel");
    expect(checkTwin(tire, wheel, vocab, cfg)).toBe("same-kind");
  });
  it("accepts a different kind of thing", () => {
    expect(checkTwin(tire, shot(e(0, 1, 0, 0, 0.3, 0)), vocab, cfg)).toBeUndefined();
  });
  it("checks the twin itself before comparing", () => {
    expect(checkTwin(tire, shot(e(0, 0, 1, 0, 0, 0)), vocab, cfg)).toBe("outside");
  });
});

describe("sharedAttributes", () => {
  it("lists attributes high for both, strongest first", () => {
    const lab = { attr: { labels: ["round", "striped", "dark"], mu: [0, 0, 0], sd: [1, 1, 1] }, attrZ: 1 };
    expect(sharedAttributes([2.5, 1.2, 3], [2, 1.5, 0.2], lab)).toEqual(["round", "striped"]);
  });
  it("caps at k", () => {
    const lab = { attr: { labels: ["a", "b", "c", "d"], mu: [0, 0, 0, 0], sd: [1, 1, 1, 1] }, attrZ: 1 };
    expect(sharedAttributes([2, 3, 4, 5], [2, 3, 4, 5], lab)).toEqual(["d", "c", "b"]);
  });
  it("is empty when nothing clears the threshold, or values are NaN", () => {
    const lab = { attr: { labels: ["a", "b"], mu: [0, 0], sd: [1, 1] }, attrZ: 1 };
    expect(sharedAttributes([3, 0.2], [0.1, 3], lab)).toEqual([]);
    expect(sharedAttributes([NaN, NaN], [3, 3], lab)).toEqual([]);
  });
  it("rejects mismatched lengths", () => {
    expect(() => sharedAttributes([1], [1, 2], { attr: { labels: ["a", "b"], mu: [0, 0], sd: [1, 1] }, attrZ: 1 })).toThrow();
  });
});

describe("verdicts", () => {
  it("has 6 to 10 short lines per band, no emoji", () => {
    for (const [b, lines] of Object.entries(VERDICTS)) {
      expect(lines.length, b).toBeGreaterThanOrEqual(6);
      expect(lines.length, b).toBeLessThanOrEqual(10);
      for (const l of lines) {
        expect(l.split(/\s+/).length, l).toBeLessThanOrEqual(8);
        expect(l, l).toMatch(/^[\x20-\x7e]+$/);
        expect(l.toLowerCase(), l).not.toMatch(/\bfail/);
      }
    }
  });
  it("picks deterministically by seed", () => {
    expect(verdictLine("cousins", "2026-10-11#1")).toBe(verdictLine("cousins", "2026-10-11#1"));
    const many = new Set(Array.from({ length: 40 }, (_, i) => verdictLine("uncanny", `seed${i}`)));
    expect(many.size).toBeGreaterThan(3);
  });
});

describe("judgePair", () => {
  it("returns score, band, shared attributes and a verdict", () => {
    const a = { vector: e(1, 0, 0, 0, 1, 0), reading: readPhoto(e(1, 0, 0, 0, 1, 0), vocab, cfg) };
    const b = { vector: e(0, 1, 0, 0, 1, 0), reading: readPhoto(e(0, 1, 0, 0, 1, 0), vocab, cfg) };
    const r = judgePair(a, b, "seed", cfg);
    expect(r.sim).toBeCloseTo(0.5);
    expect(r.score).toBe(0);
    expect(r.band).toBe("strangers");
    expect(r.shared).toEqual(["round"]);
    expect(VERDICTS.strangers).toContain(r.verdict);
  });
});

describe("topAttributes", () => {
  it("lists a photo's strongest attributes above the threshold", async () => {
    const { topAttributes } = await import("../../src/twin");
    const lab = { attr: { labels: ["round", "dark", "striped", "shiny"], mu: [0, 0, 0, 0], sd: [1, 1, 1, 1] }, attrZ: 1 };
    expect(topAttributes([2, 3, 0.5, 1.5], lab)).toEqual(["dark", "round", "shiny"]);
    expect(topAttributes([0, 0, 0, NaN], lab)).toEqual([]);
  });
});
