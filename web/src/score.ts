// Warmr scoring: how close a photo is to the day's secret.
//   rank        = 1 + number of vocab items more similar to the photo than the secret
//   temperature = clamp(0, 100, round(100 * (sim - c_cold) / (c_hot - c_cold)))
//   win         = rank 1, or temperature >= found
// Constants come from data/scoring.json (tools/gate_h1.py, browser embeddings).

import scoring from "../../data/scoring.json";

function assertFinite(xs: ArrayLike<number>, what: string) {
  for (let i = 0; i < xs.length; i++) {
    if (!Number.isFinite(xs[i])) throw new Error(`${what} contains NaN or Infinity at index ${i}`);
  }
}

export interface WarmthConfig {
  dim: number; // vocab and photo vectors are truncated to this (Matryoshka) and re-normalised
  c_cold: number; // sim that maps to 0 deg
  c_hot: number; // sim that maps to 100 deg
  found: number; // temperature that wins
}

export const WARMTH: WarmthConfig = { dim: scoring.dim, c_cold: scoring.c_cold, c_hot: scoring.c_hot, found: scoring.found };

/** First `dim` components, L2-normalised (Matryoshka truncation). */
export function truncate(v: ArrayLike<number>, dim: number): Float32Array {
  if (v.length < dim) throw new Error(`vector has ${v.length} dims, need ${dim}`);
  assertFinite(v, "vector");
  const out = new Float32Array(dim);
  let n = 0;
  for (let i = 0; i < dim; i++) {
    out[i] = v[i];
    n += v[i] * v[i];
  }
  if (n === 0) throw new Error("cannot normalise a zero vector");
  n = Math.sqrt(n);
  for (let i = 0; i < dim; i++) out[i] /= n;
  return out;
}

/** Dot products of a unit vector with each row of a row-major unit-vector matrix. */
export function simsToRows(v: Float32Array, rows: Float32Array, dim = v.length): Float32Array {
  if (v.length !== dim || rows.length % dim !== 0) throw new Error(`dimension mismatch: ${v.length} vs rows of ${dim}`);
  const n = rows.length / dim;
  const out = new Float32Array(n);
  for (let r = 0; r < n; r++) {
    let d = 0;
    for (let i = 0; i < dim; i++) d += v[i] * rows[r * dim + i];
    out[r] = d;
  }
  assertFinite(out, "similarities");
  return out;
}

/** 1 + how many items beat the secret. Ties don't push the secret down. */
export function rank(sims: ArrayLike<number>, secret: number): number {
  if (!(secret >= 0 && secret < sims.length)) throw new Error(`secret index ${secret} out of range`);
  assertFinite(sims, "similarities");
  const s = sims[secret];
  let r = 1;
  for (let i = 0; i < sims.length; i++) if (sims[i] > s) r++;
  return r;
}

export function temperature(sim: number, cfg: Pick<WarmthConfig, "c_cold" | "c_hot"> = WARMTH): number {
  if (!Number.isFinite(sim)) throw new Error("similarity is NaN");
  if (!(cfg.c_hot > cfg.c_cold)) throw new Error("c_hot must be above c_cold");
  const t = Math.round((100 * (sim - cfg.c_cold)) / (cfg.c_hot - cfg.c_cold));
  return Math.min(100, Math.max(0, t));
}

export function isWin(r: number, temp: number, cfg: Pick<WarmthConfig, "found"> = WARMTH): boolean {
  return r === 1 || temp >= cfg.found;
}

/** Six bands, cold to hot; band 5 means found. Matches --temp-0..5. */
export const BAND_NAMES = ["Freezing", "Cold", "Cool", "Warm", "Hot", "Found"] as const;
export function band(temp: number, won: boolean, cfg: Pick<WarmthConfig, "found"> = WARMTH): number {
  if (!Number.isFinite(temp)) throw new Error("temperature is NaN");
  if (won) return 5;
  // fixed lower edges, then everything from 3/4 of the way to "found" is Hot
  const edges = [25, 40, 50, Math.min(cfg.found - 1, Math.max(51, Math.round(cfg.found * 0.88)))];
  let b = 0;
  while (b < edges.length && temp >= edges[b]) b++;
  return b;
}

export interface ShotScore {
  sim: number;
  rank: number;
  of: number;
  temperature: number;
  won: boolean;
  band: number;
}

/** Score a photo embedding against the secret (an index into the vocab matrix). */
export function scoreShot(photo: ArrayLike<number>, vocab: Float32Array, secret: number, cfg: WarmthConfig = WARMTH): ShotScore {
  const v = truncate(photo, cfg.dim);
  const sims = simsToRows(v, vocab, cfg.dim);
  const r = rank(sims, secret);
  const t = temperature(sims[secret], cfg);
  const won = isWin(r, t, cfg);
  return { sim: sims[secret], rank: r, of: sims.length, temperature: t, won, band: band(t, won, cfg) };
}
