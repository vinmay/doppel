// The signature effect: the player's photo printed in two or three Wada
// inks, picked by how warm the shot was. Luminance is posterised into three
// tones with a 4x4 ordered dither, so every pixel is exactly one dictionary
// color (no blends): cold shots print in blue/violet, hot ones in coral and
// yellow.
import palette from "../../data/wada/palette.json";

const hexRgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const GROUND = hexRgb(palette.base.bg.hex);
const RAMP = palette.ramp.map((c) => hexRgb(c.hex));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Inks for a band 0..5, darkest first: the ground plus two adjacent ramp stops. */
export function inksFor(band: number): [number, number, number][] {
  const b = Math.max(0, Math.min(4, band));
  return [GROUND, RAMP[b], RAMP[b + 1]];
}

/** Map RGBA pixels in place. Exported for tests. */
export function printPixels(px: Uint8ClampedArray, width: number, band: number) {
  const inks = inksFor(band);
  const levels = inks.length - 1;
  for (let i = 0; i < px.length; i += 4) {
    const p = i / 4;
    const x = p % width;
    const y = (p / width) | 0;
    const lum = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    const v = lum * levels;
    const base = Math.min(levels - 1, Math.floor(v));
    const ink = inks[v - base > BAYER[(y & 3) * 4 + (x & 3)] ? base + 1 : base];
    px[i] = ink[0];
    px[i + 1] = ink[1];
    px[i + 2] = ink[2];
    px[i + 3] = 255;
  }
}

/** Draw `blob` into `canvas` (scaled to fit maxSide) as a thermal print. */
export async function drawThermal(canvas: HTMLCanvasElement, blob: Blob, band: number, maxSide = 720) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  canvas.width = Math.round(bmp.width * s);
  canvas.height = Math.round(bmp.height * s);
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  printPixels(img.data, canvas.width, band);
  g.putImageData(img, 0, 0);
}
