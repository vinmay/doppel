import { l2normalize, type Embedder, type EmbedderInfo } from "./types";

/**
 * Deterministic stand-in for tests: hashes text (or image bytes) into a vector.
 * Text "foo" and an image Blob whose bytes are "foo" embed identically, so a
 * test can make a photo "match" a prompt.
 */
export class FakeEmbedder implements Embedder {
  // Fixed fake timings so the debug panel can be tested.
  readonly info: EmbedderInfo = { backend: "fake", adapter: "none", loadMs: 1234, lastImageMs: undefined };

  constructor(private readonly dim = 768) {}

  async ready() {}

  async embedText(s: string) {
    return this.hash(new TextEncoder().encode(s));
  }

  async embedImage(blob: Blob) {
    this.info.lastImageMs = 42;
    return this.hash(new Uint8Array(await blob.arrayBuffer()));
  }

  private hash(bytes: Uint8Array) {
    const v = new Float32Array(this.dim);
    let h = 2166136261;
    for (let i = 0; i < bytes.length; i++) {
      h = Math.imul(h ^ bytes[i], 16777619);
      v[i % this.dim] += ((h >>> 0) % 1000) / 1000 - 0.5;
    }
    v[0] += 1e-3; // never all-zero
    return l2normalize(v);
  }
}
