import { describe, expect, it } from "vitest";
import { band, isWin, rank, scoreShot, simsToRows, temperature, truncate, WARMTH } from "../../src/score";

const cfg = { dim: 2, c_cold: 0.5, c_hot: 0.7, found: 64 };

describe("rank", () => {
  it("is 1 + the number of strictly better items", () => {
    expect(rank([0.1, 0.9, 0.5, 0.7], 2)).toBe(3);
    expect(rank([0.1, 0.9, 0.5, 0.7], 1)).toBe(1);
  });
  it("lets ties share the better rank", () => {
    expect(rank([0.6, 0.6, 0.6], 1)).toBe(1);
    expect(rank([0.7, 0.6, 0.6, 0.6], 3)).toBe(2);
  });
  it("throws on NaN and on a bad index", () => {
    expect(() => rank([0.1, NaN], 0)).toThrow(/NaN/);
    expect(() => rank([0.1, 0.2], 2)).toThrow(/range/);
    expect(() => rank([0.1, 0.2], -1)).toThrow(/range/);
  });
});

describe("temperature", () => {
  it("maps c_cold to 0 and c_hot to 100, linearly", () => {
    expect(temperature(0.5, cfg)).toBe(0);
    expect(temperature(0.6, cfg)).toBe(50);
    expect(temperature(0.7, cfg)).toBe(100);
  });
  it("clamps at both edges", () => {
    expect(temperature(-1, cfg)).toBe(0);
    expect(temperature(0.49999, cfg)).toBe(0);
    expect(temperature(0.70001, cfg)).toBe(100);
    expect(temperature(1, cfg)).toBe(100);
  });
  it("rounds to whole degrees", () => {
    expect(temperature(0.6031, cfg)).toBe(52);
  });
  it("guards NaN and a broken config", () => {
    expect(() => temperature(NaN, cfg)).toThrow(/NaN/);
    expect(() => temperature(0.6, { c_cold: 0.7, c_hot: 0.7 })).toThrow(/c_hot/);
  });
  it("uses the calibrated config by default", () => {
    expect(temperature(WARMTH.c_hot)).toBe(100);
    expect(temperature(WARMTH.c_cold)).toBe(0);
  });
});

describe("win and bands", () => {
  it("wins on rank 1 or at the found threshold", () => {
    expect(isWin(1, 10, cfg)).toBe(true);
    expect(isWin(2, 64, cfg)).toBe(true);
    expect(isWin(2, 63, cfg)).toBe(false);
  });
  it("orders six bands and reserves the top one for a win", () => {
    expect([0, 24, 25, 39, 40, 49, 50, 55, 56, 63].map((t) => band(t, false, cfg))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(band(100, false, cfg)).toBe(4);
    expect(band(30, true, cfg)).toBe(5);
    expect(() => band(NaN, false, cfg)).toThrow(/NaN/);
  });
});

describe("vectors", () => {
  it("truncates and re-normalises (Matryoshka)", () => {
    const t = truncate([3, 4, 100], 2);
    expect(t[0]).toBeCloseTo(0.6, 6);
    expect(t[1]).toBeCloseTo(0.8, 6);
    expect(() => truncate([1], 2)).toThrow(/dims/);
    expect(() => truncate([0, 0, 1], 2)).toThrow(/zero/);
    expect(() => truncate([NaN, 1], 2)).toThrow(/NaN/);
  });
  it("dots a vector with every row", () => {
    const rows = Float32Array.from([1, 0, 0, 1, 0.6, 0.8]);
    expect(Array.from(simsToRows(Float32Array.from([1, 0]), rows))).toEqual([1, 0, 0.6000000238418579]);
    expect(() => simsToRows(Float32Array.from([1, 0, 0]), rows, 2)).toThrow(/dimension/);
  });
  it("scores a shot end to end", () => {
    const vocab = Float32Array.from([1, 0, 0, 1, 0.6, 0.8]);
    const s = scoreShot([0.6, 0.8, 5], vocab, 2, cfg);
    expect(s).toMatchObject({ rank: 1, of: 3, temperature: 100, won: true, band: 5 });
    const cold = scoreShot([1, 0], vocab, 1, cfg);
    expect(cold).toMatchObject({ rank: 3, temperature: 0, won: false, band: 0 });
  });
});
