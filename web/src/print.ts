// The signature effect: a photo printed in Sanzo Wada inks. Luminance is
// posterised into three tones with a 4x4 ordered dither, so every pixel is
// exactly one dictionary color (no blends): the ground plus two inks.
// Before the reveal a photo prints in the neutral inks; at the reveal both
// prints take the inks of the pair's band (cool for Strangers, warm for Uncanny).
import palette from "../../data/wada/palette.json";
import type { Band } from "./twin";

type Rgb = [number, number, number];
const hexRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const GROUND = hexRgb(palette.base.bg.hex);
const RAMP = palette.ramp.map((c) => hexRgb(c.hex)); // cold -> warm, 6 stops
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export type Tone = Band | "neutral";

/** Inks darkest first: the ground plus two adjacent ramp stops. */
export function inksFor(tone: Tone): Rgb[] {
  const start = { strangers: 0, distant: 1, cousins: 2, uncanny: 3, neutral: 4 }[tone];
  return [GROUND, RAMP[start], RAMP[start + 1]];
}

const luma = (px: Uint8ClampedArray, i: number) => (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;

/** Luminance at the 2nd and 98th percentiles (auto-level range). Exported for tests. */
export function levelRange(px: Uint8ClampedArray, lo = 0.02, hi = 0.98): [number, number] {
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) hist[Math.round(luma(px, i) * 255)]++;
  const n = px.length / 4;
  const at = (q: number) => {
    let c = 0;
    for (let v = 0; v < 256; v++) if ((c += hist[v]) >= q * n) return v / 255;
    return 1;
  };
  return [at(lo), at(hi)];
}

/** Map RGBA pixels in place: auto-level (2nd-98th percentile), then dither into the inks. Exported for tests. */
export function printPixels(px: Uint8ClampedArray, width: number, tone: Tone) {
  const inks = inksFor(tone);
  const levels = inks.length - 1;
  // A pale sky or a dim forest uses a sliver of the range; stretch it so the
  // print shows the object, not a flat field of one ink.
  const [lo, hi] = levelRange(px);
  const span = Math.max(hi - lo, 1 / 255);
  for (let i = 0; i < px.length; i += 4) {
    const p = i / 4;
    const x = p % width;
    const y = (p / width) | 0;
    const lum = Math.min(1, Math.max(0, (luma(px, i) - lo) / span));
    const v = lum * levels;
    const base = Math.min(levels - 1, Math.floor(v));
    const ink = inks[v - base > BAYER[(y & 3) * 4 + (x & 3)] ? base + 1 : base];
    px[i] = ink[0];
    px[i + 1] = ink[1];
    px[i + 2] = ink[2];
    px[i + 3] = 255;
  }
}

/** Draw `blob` into `canvas` as a print, cropped to a square (cover) of `side` px. */
export async function drawPrint(canvas: HTMLCanvasElement, blob: Blob, tone: Tone, side = 480) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(bmp.width, bmp.height);
  canvas.width = canvas.height = side;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, side, side);
  bmp.close();
  const img = g.getImageData(0, 0, side, side);
  printPixels(img.data, side, tone);
  g.putImageData(img, 0, 0);
}
