export interface EmbedderInfo {
  backend: string; // "webgpu" | "fake"
  adapter?: string;
  loadMs?: number;
  lastImageMs?: number;
}

export interface Embedder {
  readonly info: EmbedderInfo;
  ready(): Promise<void>;
  /** Embeds a hunt prompt (retrieval query prefix is applied inside). */
  embedText(s: string): Promise<Float32Array>;
  /** Embeds a photo. No prefix. */
  embedImage(blob: Blob): Promise<Float32Array>;
}

export interface LoadProgress {
  phase: "download" | "init";
  loaded: number;
  total: number;
}

export class UnsupportedError extends Error {
  override name = "UnsupportedError";
}

/** L2-normalise in place; throws on zero/NaN vectors. */
export function l2normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s);
  if (!Number.isFinite(n) || n === 0) throw new Error("cannot normalise a zero or NaN vector");
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}
