// Doppel's judgment, as pure functions over plain vectors.
//   twin score  = clamp(0, 100, round(100 * (cos(photoA, photoB) - lo) / (hi - lo)))
//   label       = nearest vocab row of kind thing/reject/unclear ("Doppel sees: tire")
//   margin      = top-1 sim minus the best row of a *different* kind (label text sim < sameKindTextSim)
//   shared      = attributes where both photos sit >= attrZ sd above that attribute's mean
// Every constant comes from data/twin-scoring.json (tools/twin_calibrate.py, browser embeddings).

import scoring from "../../data/twin-scoring.json";

export type Kind = "thing" | "reject" | "unclear" | "attr";

export interface TwinConfig {
  lo: number; // cosine that maps to 0
  hi: number; // cosine that maps to 100
  bands: { uncanny: number; cousins: number; distant: number };
  duplicateSim: number; // photo-photo cosine above this = the same thing twice
  sameKindTextSim: number; // label-label text cosine at or above this = same kind of thing
  margin: number; // below this the label is a coin toss
  attrZ: number; // shared attribute threshold (z-score, both photos)
  attr: { labels: string[]; mu: number[]; sd: number[] };
}

export const TWIN: TwinConfig = scoring;

/** Label rows and their unit vectors (row-major, `dim` floats per row). */
export interface LabelVocab {
  items: { label: string; kind: Kind }[];
  vectors: Float32Array;
  dim: number;
}

function assertFinite(xs: ArrayLike<number>, what: string) {
  for (let i = 0; i < xs.length; i++) {
    if (!Number.isFinite(xs[i])) throw new Error(`${what} contains NaN or Infinity at index ${i}`);
  }
}

/** Copy of `v`, L2-normalised. Throws on NaN or a zero vector. */
export function unit(v: ArrayLike<number>): Float32Array {
  assertFinite(v, "vector");
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  if (n === 0) throw new Error("cannot normalise a zero vector");
  n = Math.sqrt(n);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error(`dimension mismatch: ${a.length} vs ${b.length}`);
  const ua = unit(a), ub = unit(b);
  let d = 0;
  for (let i = 0; i < ua.length; i++) d += ua[i] * ub[i];
  return d;
}

export function twinScore(sim: number, cfg: Pick<TwinConfig, "lo" | "hi"> = TWIN): number {
  if (!Number.isFinite(sim)) throw new Error("similarity is NaN");
  if (!(cfg.hi > cfg.lo)) throw new Error("hi must be above lo");
  const s = Math.round((100 * (sim - cfg.lo)) / (cfg.hi - cfg.lo));
  return Math.min(100, Math.max(0, s));
}

export type Band = "uncanny" | "cousins" | "distant" | "strangers";
export const BAND_NAMES: Record<Band, string> = { uncanny: "Uncanny", cousins: "Cousins", distant: "Distant", strangers: "Strangers" };
/** Order for display and for picking the best pair. */
export const BANDS: Band[] = ["strangers", "distant", "cousins", "uncanny"];

export function band(score: number, cfg: Pick<TwinConfig, "bands"> = TWIN): Band {
  if (!Number.isFinite(score)) throw new Error("score is NaN");
  if (score >= cfg.bands.uncanny) return "uncanny";
  if (score >= cfg.bands.cousins) return "cousins";
  if (score >= cfg.bands.distant) return "distant";
  return "strangers";
}

/** What Doppel makes of one photo. */
export interface Reading {
  index: number; // vocab row of the top label
  label: string;
  kind: Kind;
  margin: number;
  /** z-score per attribute, in TwinConfig.attr.labels order */
  attrZ: number[];
}

function row(vocab: LabelVocab, i: number): Float32Array {
  return vocab.vectors.subarray(i * vocab.dim, (i + 1) * vocab.dim);
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

/** Text similarity of two vocab rows (both unit vectors). */
export const labelSim = (vocab: LabelVocab, i: number, j: number) => dot(row(vocab, i), row(vocab, j));

export function readPhoto(photo: ArrayLike<number>, vocab: LabelVocab, cfg: TwinConfig = TWIN): Reading {
  if (photo.length !== vocab.dim) throw new Error(`photo has ${photo.length} dims, vocab ${vocab.dim}`);
  if (vocab.vectors.length !== vocab.items.length * vocab.dim) throw new Error("vocab vectors don't match its items");
  const v = unit(photo);
  const sims = vocab.items.map((_, i) => dot(v, row(vocab, i)));
  assertFinite(sims, "similarities");

  let top = -1;
  for (let i = 0; i < sims.length; i++) {
    if (vocab.items[i].kind !== "attr" && (top < 0 || sims[i] > sims[top])) top = i;
  }
  if (top < 0) throw new Error("vocab has no labels");
  let rival = -Infinity;
  for (let i = 0; i < sims.length; i++) {
    if (i === top || vocab.items[i].kind === "attr") continue;
    if (labelSim(vocab, top, i) >= cfg.sameKindTextSim) continue; // a synonym isn't a rival
    rival = Math.max(rival, sims[i]);
  }

  const byLabel = new Map<string, number>();
  vocab.items.forEach((it, i) => it.kind === "attr" && byLabel.set(it.label, i));
  const attrZ = cfg.attr.labels.map((l, k) => {
    const i = byLabel.get(l);
    if (i === undefined) throw new Error(`attribute "${l}" missing from the vocab`);
    return (sims[i] - cfg.attr.mu[k]) / cfg.attr.sd[k];
  });

  return {
    index: top,
    label: vocab.items[top].label,
    kind: vocab.items[top].kind,
    margin: Number.isFinite(rival) ? sims[top] - rival : 1,
    attrZ,
  };
}

export type Problem = "outside" | "uncertain" | "duplicate" | "same-kind";

/** What the player sees when a shot is refused. Refused shots are never spent. */
export const PROBLEM_TEXT: Record<Problem, string> = {
  outside: "Take it outside.",
  uncertain: "Doppel can't tell what that is. Get closer and fill the frame.",
  duplicate: "That's the same thing twice.",
  "same-kind": "That's the same kind of thing. Find something different that looks like it.",
};

/** Any photo: must be outdoors-ish and legible. */
export function checkShot(r: Reading, cfg: Pick<TwinConfig, "margin"> = TWIN): Problem | undefined {
  if (r.kind === "reject") return "outside";
  if (r.kind === "unclear" || r.margin < cfg.margin) return "uncertain";
  return undefined;
}

/** The twin: a legible outdoor photo of a *different* kind of thing. */
export function checkTwin(
  first: { vector: ArrayLike<number>; reading: Reading },
  twin: { vector: ArrayLike<number>; reading: Reading },
  vocab: LabelVocab,
  cfg: TwinConfig = TWIN,
): Problem | undefined {
  const own = checkShot(twin.reading, cfg);
  if (own) return own;
  if (cosine(first.vector, twin.vector) > cfg.duplicateSim) return "duplicate";
  const a = first.reading.index, b = twin.reading.index;
  if (a === b || labelSim(vocab, a, b) >= cfg.sameKindTextSim) return "same-kind";
  return undefined;
}

/** Up to `k` attributes both photos have, strongest first. Empty means "Not much, honestly." */
export function sharedAttributes(zA: number[], zB: number[], cfg: Pick<TwinConfig, "attr" | "attrZ"> = TWIN, k = 3): string[] {
  if (zA.length !== cfg.attr.labels.length || zB.length !== zA.length) throw new Error("attribute vectors don't match the config");
  return cfg.attr.labels
    .map((label, i) => ({ label, z: Math.min(zA[i], zB[i]) }))
    .filter((x) => Number.isFinite(x.z) && x.z >= cfg.attrZ)
    .sort((x, y) => y.z - x.z)
    .slice(0, k)
    .map((x) => x.label);
}

export const NOTHING_SHARED = "Not much, honestly.";

/** Verdict lines (game master): short, dry, never "fail". One per pair, picked deterministically. */
export const VERDICTS: Record<Band, string[]> = {
  uncanny: [
    "Separated at birth.",
    "Even Doppel did a double take.",
    "Same face, different lives.",
    "The world repeated itself.",
    "One of you is the impostor.",
    "A rhyme the world forgot to hide.",
    "Twins. Nobody tell them.",
    "Seen once, seen twice.",
  ],
  cousins: [
    "Family resemblance, clearly.",
    "They'd nod at each other in passing.",
    "Same eyes, different jokes.",
    "Cousins at a summer wedding.",
    "Close enough to borrow a coat.",
    "Related, distantly but proudly.",
    "A strong hint of each other.",
  ],
  distant: [
    "They've heard of each other.",
    "Same town, different streets.",
    "If you squint. Hard.",
    "A resemblance, on a good day.",
    "Pen pals, at best.",
    "Something's there. Something small.",
    "Third cousins, twice removed.",
  ],
  strangers: [
    "Never met. Never will.",
    "Bold pairing. Doppel respects it.",
    "They don't know each other.",
    "Two strangers on a bench.",
    "A brave theory, honestly.",
    "Opposites, beautifully.",
    "Doppel sees no family here.",
    "Different worlds. Lovely ones, though.",
  ],
};

/** FNV-1a, for deterministic picks from a seed string. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function verdictLine(b: Band, seed: string): string {
  const lines = VERDICTS[b];
  return lines[hash(seed) % lines.length];
}

/** Everything the reveal needs for one pair. */
export interface PairResult {
  sim: number;
  score: number;
  band: Band;
  shared: string[];
  verdict: string;
}

export function judgePair(a: { vector: ArrayLike<number>; reading: Reading }, b: { vector: ArrayLike<number>; reading: Reading }, seed: string, cfg: TwinConfig = TWIN): PairResult {
  const sim = cosine(a.vector, b.vector);
  const score = twinScore(sim, cfg);
  const bd = band(score, cfg);
  return { sim, score, band: bd, shared: sharedAttributes(a.reading.attrZ, b.reading.attrZ, cfg), verdict: verdictLine(bd, seed) };
}
