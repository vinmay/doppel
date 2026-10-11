// Spoiler-free share text, like Wordle: no photos, no location, no secret.
//   Warmr #3 · 6 shots · 🟦🟦🟥🟧🟥🔥
// Each shot becomes the emoji square whose hue is closest to its band's Wada
// ramp color (CIELAB hue angle); a winning shot is 🔥. These emoji are the
// only non-Wada colors in Warmr.
import palette from "../../data/wada/palette.json";
import type { GameState } from "./game";

// CIELAB hue angles of the emoji squares (Twemoji colors, rounded).
const SQUARES: [string, number][] = [["🟦", 250], ["🟩", 130], ["🟨", 85], ["🟧", 62], ["🟥", 28]];

const labHue = (lab: number[]) => (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
const angleGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Emoji for bands 0..5 (5 = found). */
export const BAND_EMOJI: string[] = [
  ...palette.ramp.slice(0, 5).map((c) => {
    const h = labHue(c.lab);
    return SQUARES.reduce((best, s) => (angleGap(h, s[1]) < angleGap(h, best[1]) ? s : best))[0];
  }),
  "🔥",
];

export function shareText(number: number, g: GameState, url?: string): string {
  const n = g.shots.length;
  const strip = g.shots.map((s) => BAND_EMOJI[s.won ? 5 : Math.max(0, Math.min(4, s.band))]).join("");
  const how = g.status === "won" ? `${n} shot${n === 1 ? "" : "s"}` : g.status === "gave-up" ? `gave up after ${n}` : `${n} so far`;
  return [`Warmr #${number} · ${how} · ${strip || "—"}`, url].filter(Boolean).join("\n");
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/** navigator.share where it exists (phones), else the clipboard. */
export async function shareResult(text: string, nav: Pick<Navigator, "share" | "clipboard"> = navigator): Promise<ShareOutcome> {
  if (typeof nav.share === "function") {
    try {
      await nav.share({ text });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
      // fall through to the clipboard (e.g. NotAllowedError on desktop)
    }
  }
  try {
    await nav.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
