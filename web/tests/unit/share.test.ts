import { describe, expect, it, vi } from "vitest";
import type { GameState, ShotLite } from "../../src/game";
import { BAND_EMOJI, shareResult, shareText } from "../../src/share";

const s = (band: number, won = false): ShotLite => ({ ts: 0, temperature: 0, rank: 9, band, won });
const game = (shots: ShotLite[], status: GameState["status"]): GameState => ({ day: "2026-10-10", status, shots });

describe("share text", () => {
  it("maps the Wada ramp to emoji by hue, with fire for a win", () => {
    // Deep Lyons Blue, Blue Violet -> blue; Eupatorium Purple, Grenadine Pink -> red; Cream Yellow -> orange
    expect(BAND_EMOJI).toEqual(["🟦", "🟦", "🟥", "🟥", "🟧", "🔥"]);
  });

  it("is spoiler-free: number, shot count, one emoji per shot", () => {
    const g = game([s(0), s(1), s(2), s(3), s(4), s(4, true)], "won");
    expect(shareText(3, g)).toBe("Warmr #3 · 6 shots · 🟦🟦🟥🟥🟧🔥");
    expect(shareText(3, game([s(4, true)], "won"))).toBe("Warmr #3 · 1 shot · 🔥");
  });

  it("says when the player gave up, and can carry a link", () => {
    expect(shareText(12, game([s(0), s(3)], "gave-up"), "https://example.org/")).toBe("Warmr #12 · gave up after 2 · 🟦🟥\nhttps://example.org/");
  });

  it("never contains photo data, coordinates or the secret", () => {
    const t = shareText(3, game([s(2)], "gave-up"));
    expect(t).not.toMatch(/blob:|data:|\d+\.\d{3,}/);
  });
});

describe("shareResult", () => {
  it("uses navigator.share when present", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareResult("x", { share, clipboard: { writeText: vi.fn() } } as never)).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "x" });
  });
  it("treats a dismissed share sheet as cancelled", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("no", "AbortError"));
    expect(await shareResult("x", { share, clipboard: { writeText: vi.fn() } } as never)).toBe("cancelled");
  });
  it("falls back to the clipboard without share, or when share is refused", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareResult("x", { clipboard: { writeText } } as never)).toBe("copied");
    const share = vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError"));
    expect(await shareResult("y", { share, clipboard: { writeText } } as never)).toBe("copied");
    expect(writeText).toHaveBeenLastCalledWith("y");
  });
  it("reports failure if the clipboard is blocked too", async () => {
    expect(await shareResult("x", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } } as never)).toBe("failed");
  });
});
