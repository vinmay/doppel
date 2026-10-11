import { describe, expect, it } from "vitest";
import vocab from "../../../data/vocab.json";
import {
  addShot, canShoot, clock, COOLDOWN_MS, dayKey, fnv1a, gameNumber, giveUp, hintsUnlocked, kindOf, mayReveal,
  newGame, normText, phase, RESULT_MS, secretFor, type GameState, type ShotLite,
} from "../../src/game";
import { PACKS } from "../../src/packs";

const VOCAB = vocab.items.map((i) => i.text);
const shot = (ts: number, extra: Partial<ShotLite> = {}): ShotLite => ({ ts, temperature: 30, rank: 99, band: 1, won: false, ...extra });
const T0 = Date.parse("2026-10-10T16:00:00Z");

describe("day and secret", () => {
  it("switches day at midnight America/New_York, not UTC or local", () => {
    // 23:59:59 EDT Oct 10 = 03:59:59Z Oct 11
    expect(dayKey(Date.parse("2026-10-11T03:59:59Z"))).toBe("2026-10-10");
    expect(dayKey(Date.parse("2026-10-11T04:00:00Z"))).toBe("2026-10-11");
    expect(dayKey(Date.parse("2026-10-11T01:00:00Z"))).toBe("2026-10-10"); // already Oct 11 in UTC
    // after DST ends (Nov 1), midnight NY is 05:00Z
    expect(dayKey(Date.parse("2026-11-02T04:59:59Z"))).toBe("2026-11-01");
    expect(dayKey(Date.parse("2026-11-02T05:00:00Z"))).toBe("2026-11-02");
  });

  it("numbers games from the first pack", () => {
    expect(gameNumber("2026-10-08")).toBe(1);
    expect(gameNumber("2026-10-10")).toBe(3);
    expect(gameNumber("2026-11-02")).toBe(26); // across DST
  });

  it("FNV-1a is the standard 32-bit hash", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
  });

  it("picks packs[D].prompts[hash(D) % 5], the same for everyone", () => {
    const s = secretFor("2026-10-10", PACKS, VOCAB);
    const pack = PACKS.find((p) => p.date === "2026-10-10")!;
    expect(s.text).toBe(normText(pack.prompts[fnv1a("2026-10-10") % 5].text));
    expect(secretFor("2026-10-10", PACKS, VOCAB)).toEqual(s);
    expect(VOCAB[s.vocabIndex]).toBe(s.text);
    expect(s.number).toBe(3);
  });

  it("every day's possible secret is in the vocab and gets a kind and three hints", () => {
    for (const p of PACKS) {
      for (const q of p.prompts) {
        expect(VOCAB).toContain(normText(q.text));
        expect(kindOf(normText(q.text)), q.text).toBeDefined();
      }
      const s = secretFor(p.date, PACKS, VOCAB);
      expect(s.hints.every((h) => h.length > 3)).toBe(true);
    }
  });

  it("keeps going after the last pack", () => {
    const a = secretFor("2026-12-25", PACKS, VOCAB);
    expect(VOCAB[a.vocabIndex]).toBe(a.text);
    expect(a.number).toBe(79);
  });

  it("reads the head noun for the first hint", () => {
    expect(kindOf("a thin brown tendril winding around a branch")?.kind).toBe("a plant");
    expect(kindOf("a rusty bracket growing on damp tree")?.kind).toBe("a fungus or lichen");
    expect(kindOf("a red fire hydrant near a sidewalk")).toEqual({ kind: "something people built", word: "hydrant" });
    expect(kindOf("a thick gray branch fragment on grass")?.kind).toBe("part of a tree");
  });

  it("refuses a secret missing from the vocab", () => {
    expect(() => secretFor("2026-10-10", PACKS, ["a dog"])).toThrow(/not in the vocab/);
  });
});

describe("shots, cooldown and the end of a game", () => {
  it("shows the result, then the pocket cooldown, then allows the next shot (wall clock)", () => {
    let g = newGame("2026-10-10");
    expect(phase(g, T0)).toEqual({ kind: "ready" });
    g = addShot(g, shot(T0));
    expect(phase(g, T0 + 1000)).toEqual({ kind: "result", leftMs: RESULT_MS - 1000 });
    expect(phase(g, T0 + RESULT_MS)).toEqual({ kind: "cooldown", leftMs: COOLDOWN_MS - RESULT_MS });
    expect(canShoot(g, T0 + COOLDOWN_MS - 1)).toBe(false);
    expect(() => addShot(g, shot(T0 + 20_000))).toThrow(/cooldown/);
    expect(canShoot(g, T0 + COOLDOWN_MS)).toBe(true);
  });

  it("survives a reload: phase depends only on stored timestamps", () => {
    const g = addShot(newGame("2026-10-10"), shot(T0));
    const reloaded: GameState = JSON.parse(JSON.stringify(g));
    expect(phase(reloaded, T0 + 30_000)).toEqual(phase(g, T0 + 30_000));
    expect(phase(reloaded, T0 + 30_000)).toEqual({ kind: "cooldown", leftMs: 15_000 });
  });

  it("doesn't lock the player out if the clock goes backwards", () => {
    const g = addShot(newGame("2026-10-10"), shot(T0));
    expect(phase(g, T0 - 60_000).kind).toBe("ready");
  });

  it("a cooldown that runs across NY midnight ends on time; the new day is a new game", () => {
    const beforeMidnight = Date.parse("2026-10-11T03:59:40Z"); // 23:59:40 EDT
    const day = dayKey(beforeMidnight);
    let g = addShot(newGame(day), shot(beforeMidnight));
    const after = beforeMidnight + 30_000; // 00:00:10 EDT Oct 11
    expect(dayKey(after)).toBe("2026-10-11");
    expect(phase(g, after).kind).toBe("cooldown");
    expect(phase(g, beforeMidnight + COOLDOWN_MS).kind).toBe("ready");
    const next = newGame(dayKey(after));
    expect(next.day).not.toBe(g.day);
    expect(canShoot(next, after)).toBe(true);
    expect(secretFor(next.day, PACKS, VOCAB).text).not.toBeUndefined();
  });

  it("unlocks hints after 3, 5 and 7 shots", () => {
    let g = newGame("2026-10-10");
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      seen.push(hintsUnlocked(g));
      g = addShot(g, shot(T0 + i * COOLDOWN_MS));
    }
    seen.push(hintsUnlocked(g));
    expect(seen).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("ends on a winning shot or on give up, and only then reveals the secret", () => {
    let g = addShot(newGame("2026-10-10"), shot(T0));
    expect(mayReveal(g)).toBe(false);
    g = addShot(g, shot(T0 + COOLDOWN_MS, { won: true, rank: 1, temperature: 91, band: 5 }));
    expect(g.status).toBe("won");
    expect(g.endedAt).toBe(T0 + COOLDOWN_MS);
    expect(phase(g, T0 + COOLDOWN_MS + 1).kind).toBe("result"); // the winning shot is shown first
    expect(phase(g, T0 + COOLDOWN_MS + RESULT_MS).kind).toBe("won");
    expect(mayReveal(g)).toBe(true);
    expect(hintsUnlocked(g)).toBe(3);
    expect(giveUp(g, T0 + 999_999)).toBe(g);
    const q = giveUp(newGame("2026-10-10"), T0);
    expect(q).toMatchObject({ status: "gave-up", endedAt: T0 });
    expect(canShoot(q, T0 + 999_999)).toBe(false);
  });

  it("formats the pocket timer", () => {
    expect(clock(45_000)).toBe("0:45");
    expect(clock(36_001)).toBe("0:37");
    expect(clock(-5)).toBe("0:00");
    expect(clock(61_000)).toBe("1:01");
  });
});
