import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { _resetDbForTests, clearAll, getDay, getShot, putDay, putShot } from "../../src/db";
import { acceptFirst, acceptTwin, bestPair, closeReveal, donePairs, metersWalked, newDay, phase, updateWalk, type DayState } from "../../src/day";
import { addDays, dayKey, localSunrise, nextDayStart, sunriseUtc } from "../../src/sun";
import type { PairResult } from "../../src/twin";
import { addFix, denyGps, haversine, startWalk, walkStatus, WALK_FALLBACK_MS, type Fix } from "../../src/walk";

const T0 = Date.parse("2026-10-11T14:00:00Z");
const shot = (id: string, ts: number) => ({ id, ts, label: id });
const result = (score: number): PairResult => ({ sim: 0.8, score, band: score >= 80 ? "uncanny" : "cousins", shared: ["round"], verdict: "x" });
// ~1.11 m per 1e-5 degree of latitude
const fix = (dLatMeters: number, ts: number, accuracy = 5): Fix => ({ lat: 35 + dLatMeters / 111_195, lng: -80.8, accuracy, ts });

describe("walk unlock", () => {
  it("accumulates distance from good fixes and unlocks at 50 m", () => {
    let w = startWalk(T0);
    for (let m = 0; m <= 40; m += 10) w = addFix(w, fix(m, T0 + m * 100));
    expect(walkStatus(w, T0 + 5000)).toMatchObject({ unlocked: false, mode: "gps", meters: 40, metersLeft: 10 });
    w = addFix(w, fix(51, T0 + 6000));
    expect(walkStatus(w, T0 + 6000)).toMatchObject({ unlocked: true, metersLeft: 0 });
  });
  it("ignores GPS jumps over 200 m as noise", () => {
    let w = addFix(startWalk(T0), fix(0, T0));
    w = addFix(w, fix(500, T0 + 1000));
    expect(w.meters).toBe(0);
    w = addFix(w, fix(20, T0 + 2000)); // measured from the old anchor, the jump never counted
    expect(Math.round(w.meters)).toBe(20);
  });
  it("ignores jitter under 5 m but lets small steps add up", () => {
    let w = addFix(startWalk(T0), fix(0, T0));
    w = addFix(w, fix(3, T0 + 1000));
    expect(w.meters).toBe(0);
    w = addFix(w, fix(6, T0 + 2000));
    expect(Math.round(w.meters)).toBe(6);
  });
  it("falls back to the 45 s timer when accuracy is worse than 30 m", () => {
    let w = addFix(startWalk(T0), fix(0, T0 + 1000, 65));
    expect(walkStatus(w, T0 + 10_000)).toMatchObject({ mode: "timer", unlocked: false, msLeft: 35_000 });
    expect(walkStatus(w, T0 + WALK_FALLBACK_MS).unlocked).toBe(true);
    w = addFix(w, fix(100, T0 + 2000, 65)); // bad fixes never add distance
    expect(w.meters).toBe(0);
  });
  it("falls back to the timer with no GPS at all, or when permission is denied", () => {
    expect(walkStatus(startWalk(T0), T0 + 44_999).unlocked).toBe(false);
    expect(walkStatus(startWalk(T0), T0 + 45_000).unlocked).toBe(true);
    const denied = denyGps(addFix(startWalk(T0), fix(0, T0)));
    expect(walkStatus(denied, T0 + 45_000)).toMatchObject({ mode: "timer", unlocked: true });
  });
  it("needs walking while GPS is good, and switches to the timer when fixes stop (dropout)", () => {
    let w = startWalk(T0);
    for (let t = 1000; t <= 50_000; t += 10_000) w = addFix(w, fix(1, T0 + t)); // standing still, good fixes
    expect(walkStatus(w, T0 + 51_000)).toMatchObject({ mode: "gps", unlocked: false });
    w = addFix(w, fix(2, T0 + 50_000));
    expect(walkStatus(w, T0 + 69_000).mode).toBe("gps");
    expect(walkStatus(w, T0 + 71_000)).toMatchObject({ mode: "timer", unlocked: true });
  });
  it("uses the wall clock: the same walk read later is further along", () => {
    const w = startWalk(T0);
    expect(walkStatus(w, T0 + 30_000).msLeft).toBe(15_000);
    expect(walkStatus(JSON.parse(JSON.stringify(w)), T0 + 40_000).msLeft).toBe(5_000);
  });
  it("skips non-finite fixes and measures haversine correctly", () => {
    const w = addFix(startWalk(T0), { lat: NaN, lng: 0, accuracy: 5, ts: T0 });
    expect(w.lastFix).toBeUndefined();
    expect(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111_195, -2);
  });
});

describe("day phases", () => {
  const play = (d: DayState, n: number, score: number, t: number) => {
    d = acceptFirst(d, shot(`a${n}`, t), t);
    d = acceptTwin(d, shot(`b${n}`, t + 60_000), result(score), t + 60_000);
    return closeReveal(d, t + 70_000);
  };

  it("goes first -> walking -> twin -> reveal -> next pair", () => {
    let d = newDay("2026-10-11");
    expect(phase(d, T0)).toEqual({ kind: "first", pair: 1 });
    d = acceptFirst(d, shot("a", T0), T0);
    expect(phase(d, T0 + 1000)).toMatchObject({ kind: "walking", pair: 1, walk: { mode: "timer", msLeft: 44_000 } });
    expect(phase(d, T0 + 45_000)).toEqual({ kind: "twin", pair: 1 });
    d = acceptTwin(d, shot("b", T0 + 50_000), result(70), T0 + 50_000);
    expect(phase(d, T0 + 50_000)).toEqual({ kind: "reveal", pair: 1 });
    d = closeReveal(d, T0 + 60_000);
    expect(phase(d, T0 + 60_000)).toEqual({ kind: "first", pair: 2 });
  });
  it("refuses a twin before the walk is done and actions out of order", () => {
    let d = newDay("2026-10-11");
    expect(() => acceptTwin(d, shot("b", T0), result(50), T0)).toThrow(/first/);
    d = acceptFirst(d, shot("a", T0), T0);
    expect(() => acceptTwin(d, shot("b", T0 + 1000), result(50), T0 + 1000)).toThrow(/walking/);
    expect(() => acceptFirst(d, shot("c", T0 + 1000), T0 + 1000)).toThrow();
    expect(() => closeReveal(d, T0 + 1000)).toThrow();
  });
  it("walks unlock with distance through updateWalk", () => {
    let d = acceptFirst(newDay("2026-10-11"), shot("a", T0), T0);
    for (let m = 0; m <= 60; m += 10) d = updateWalk(d, (w) => addFix(w, fix(m, T0 + 1000 + m * 100)));
    expect(phase(d, T0 + 8000).kind).toBe("twin");
    expect(metersWalked(d)).toBe(60);
  });
  it("plays 3 pairs a day, then is done", () => {
    let d = newDay("2026-10-11");
    d = play(d, 1, 40, T0);
    d = play(d, 2, 90, T0 + 600_000);
    d = play(d, 3, 70, T0 + 1_200_000);
    expect(phase(d, T0 + 2_000_000)).toEqual({ kind: "done" });
    expect(donePairs(d)).toHaveLength(3);
    expect(() => acceptFirst(d, shot("x", T0 + 2_000_000), T0 + 2_000_000)).toThrow(/done/);
  });
  it("picks the best pair, earliest on a tie", () => {
    let d = newDay("2026-10-11");
    expect(bestPair(d)).toBeUndefined();
    d = play(d, 1, 60, T0);
    d = play(d, 2, 85, T0 + 600_000);
    d = play(d, 3, 85, T0 + 1_200_000);
    expect(bestPair(d)).toBe(1);
  });
  it("rejected shots are not spent: nothing changes until a shot is accepted", () => {
    const d = acceptFirst(newDay("2026-10-11"), shot("a", T0), T0);
    // the app only calls acceptTwin for a valid twin; a refused one leaves the state untouched
    expect(phase(d, T0 + 50_000)).toEqual({ kind: "twin", pair: 1 });
    expect(d.pairs).toHaveLength(1);
  });
});

describe("persistence: reload mid-round restores state", () => {
  beforeEach(async () => {
    _resetDbForTests();
    await clearAll();
  });
  it("a walk survives a reload and its timer keeps running on the wall clock", async () => {
    let d = acceptFirst(newDay("2026-10-11"), shot("a", T0), T0);
    d = updateWalk(d, (w) => addFix(w, fix(0, T0 + 500)));
    d = updateWalk(d, (w) => addFix(w, fix(20, T0 + 900)));
    await putDay(d);
    _resetDbForTests(); // a new page load
    const back = (await getDay("2026-10-11"))!;
    expect(back).toEqual(d);
    expect(phase(back, T0 + 10_000)).toMatchObject({ kind: "walking", walk: { meters: 20, metersLeft: 30 } });
    // no fix for > 20 s: GPS counts as dropped, the timer from the first shot takes over
    expect(phase(back, T0 + 30_000)).toMatchObject({ kind: "walking", walk: { mode: "timer", msLeft: 15_000 } });
    expect(phase(back, T0 + 45_000)).toMatchObject({ kind: "twin" });
  });
  it("stores the first photo's vector so the twin can be compared after a reload", async () => {
    const vector = Float32Array.from({ length: 768 }, (_, i) => Math.sin(i));
    await putShot({ id: "a", day: "2026-10-11", ts: T0, vector, reading: { index: 3, label: "tire", kind: "thing", margin: 0.05, topSim: 0.7, attrZ: [1, 2] }, thumbBlob: new Blob(["x"]) });
    _resetDbForTests();
    const s = (await getShot("a"))!;
    expect(Array.from(s.vector)).toEqual(Array.from(vector));
    expect(s.reading.label).toBe("tire");
  });
});

describe("day boundary at sunrise", () => {
  const charlotte = { lat: 35.23, lng: -80.84 };
  const NY = "America/New_York";

  it("computes a plausible sunrise (Charlotte, Oct 11: ~07:25 EDT)", () => {
    const rise = localSunrise("2026-10-11", charlotte, NY)!;
    const local = new Date(rise).toLocaleTimeString("en-US", { timeZone: NY, hour12: false });
    expect(local).toMatch(/^07:(1\d|2\d|3\d)/);
  });
  it("before sunrise is still yesterday, after sunrise is today (America/New_York)", () => {
    const rise = localSunrise("2026-10-11", charlotte, NY)!;
    expect(dayKey(rise - 60_000, charlotte, NY)).toBe("2026-10-10");
    expect(dayKey(rise + 60_000, charlotte, NY)).toBe("2026-10-11");
  });
  it("a pair started before midnight is the same day after midnight", () => {
    const before = Date.parse("2026-10-11T23:50:00-04:00");
    const after = Date.parse("2026-10-12T00:10:00-04:00");
    expect(dayKey(before, charlotte, NY)).toBe("2026-10-11");
    expect(dayKey(after, charlotte, NY)).toBe("2026-10-11");
    expect(dayKey(after, undefined, NY)).toBe("2026-10-11"); // 06:00 fallback too
  });
  it("falls back to 06:00 local without a place (UTC)", () => {
    expect(dayKey(Date.parse("2026-10-11T05:59:00Z"), undefined, "UTC")).toBe("2026-10-10");
    expect(dayKey(Date.parse("2026-10-11T06:00:00Z"), undefined, "UTC")).toBe("2026-10-11");
  });
  it("uses sunrise in UTC too (London, Oct 11: ~06:20 UTC)", () => {
    const london = { lat: 51.5, lng: -0.12 };
    expect(dayKey(Date.parse("2026-10-11T06:00:00Z"), london, "UTC")).toBe("2026-10-10");
    expect(dayKey(Date.parse("2026-10-11T06:40:00Z"), london, "UTC")).toBe("2026-10-11");
  });
  it("handles places far east of Greenwich (Tokyo sunrise is the previous UTC day)", () => {
    const tokyo = { lat: 35.68, lng: 139.69 };
    const rise = localSunrise("2026-10-11", tokyo, "Asia/Tokyo")!;
    expect(new Date(rise).toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" })).toBe("2026-10-11");
    expect(dayKey(rise + 60_000, tokyo, "Asia/Tokyo")).toBe("2026-10-11");
  });
  it("uses the 06:00 fallback in polar night", () => {
    expect(sunriseUtc(Date.parse("2026-12-21T00:00:00Z"), { lat: 78.2, lng: 15.6 })).toBeUndefined();
    expect(dayKey(Date.parse("2026-12-21T06:30:00Z"), { lat: 78.2, lng: 15.6 }, "UTC")).toBe("2026-12-21");
  });
  it("finds the next day start", () => {
    const now = Date.parse("2026-10-11T22:00:00-04:00");
    const next = nextDayStart(now, charlotte, NY);
    expect(dayKey(next, charlotte, NY)).toBe("2026-10-12");
    expect(Math.abs(next - localSunrise("2026-10-12", charlotte, NY)!)).toBeLessThan(2000);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
