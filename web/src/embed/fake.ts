import { l2normalize, type Embedder, type EmbedderInfo } from "./types";

/** Unique string so the bundle check can prove this module isn't in production. */
export const FAKE_MARKER = "fake-embedder";

/**
 * Deterministic stand-in for tests (test builds only, `?embedder=fake`):
 * hashes text (or image bytes) into a vector. Text "foo" and an image Blob
 * whose bytes are "foo" embed identically.
 */
export class FakeEmbedder implements Embedder {
  // Fixed fake timings so the debug panel can be tested.
  readonly info: EmbedderInfo = { backend: "fake", adapter: FAKE_MARKER, loadMs: 1234, lastImageMs: undefined };

  constructor(private readonly dim = 768) {}

  async ready() {}

  async embedText(s: string) {
    return hashVector(new TextEncoder().encode(s), this.dim);
  }

  async embedImage(blob: Blob) {
    this.info.lastImageMs = 42;
    return hashVector(new Uint8Array(await blob.arrayBuffer()), this.dim);
  }
}

function hashVector(bytes: Uint8Array, dim: number) {
  const v = new Float32Array(dim);
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h = Math.imul(h ^ bytes[i], 16777619);
    v[i % dim] += ((h >>> 0) % 1000) / 1000 - 0.5;
  }
  v[0] += 1e-3; // never all-zero
  return l2normalize(v);
}

/**
 * Test fixtures are named `<pair>-<label>[-a|-b].jpg`, e.g. `02-donut.jpg`.
 * Returns the label part ("donut"), with dashes as spaces, or undefined.
 */
export function fixtureLabel(fileName: string): string | undefined {
  const m = fileName.match(/^(?:\d+-)?([a-z-]+?)(?:-[ab])?\.(?:jpe?g|png)$/);
  return m?.[1].replace(/-/g, " ");
}
