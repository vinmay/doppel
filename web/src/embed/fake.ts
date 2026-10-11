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

/**
 * Test mode only: a photo vector for a fixture, built from the vocab row of
 * the label in its file name plus file-specific noise. So `02-tire.jpg` reads
 * as "tire", two different rock photos are the same kind (but not the same
 * photo), and the same file twice is a duplicate. Undefined for other names.
 */
export function fakePhotoVector(fileName: string, vocab: { items: { label: string; kind: string }[]; vectors: Float32Array; dim: number }): Float32Array | undefined {
  const label = fixtureLabel(fileName);
  const i = vocab.items.findIndex((it) => it.kind !== "attr" && it.label === label);
  if (i < 0) return undefined;
  const noise = hashVector(new TextEncoder().encode(fileName), vocab.dim);
  const v = new Float32Array(vocab.dim);
  for (let k = 0; k < vocab.dim; k++) v[k] = vocab.vectors[i * vocab.dim + k] + 0.3 * noise[k];
  return l2normalize(v);
}
