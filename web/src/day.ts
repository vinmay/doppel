// One Doppel day: 3 pairs, each first -> walk -> twin -> reveal. Pure functions
// over plain, storable data and an explicit `now`; the app persists DayState
// after every change, so a reload lands in the same phase with the same timers.
// Only accepted shots ever reach this module: refused shots are not spent.

import type { Band, PairResult } from "./twin";
import { startWalk, walkStatus, type Walk, type WalkStatus } from "./walk";

export const PAIRS_PER_DAY = 3;

/** An accepted photo. Vector and thumbnail live in the shots store under `id`. */
export interface ShotRef {
  id: string;
  ts: number;
  label: string;
  alt?: string; // near-synonym runner-up ("cloud / sky")
  looks?: string[]; // its strongest attributes, the hint for finding a twin
  tries?: string[]; // suggested twins: nearest different kinds of thing
}

export interface PairState {
  first?: ShotRef;
  walk?: Walk;
  twin?: ShotRef; // the kept (best) twin
  result?: PairResult; // the kept (best) result
  tries?: number; // twins taken for this pair: 1, or 2 after "Try another twin" (G3)
  walk2?: Walk; // the walk for the second try
  lastTry?: { twin: ShotRef; result: PairResult }; // the second try, kept or not
  closedAt?: number; // player tapped "Next pair" (or "See today") after the reveal
}

export interface DayState {
  day: string;
  pairs: PairState[]; // the current pair is the last one
}

export type Phase =
  | { kind: "first"; pair: number }
  | { kind: "walking"; pair: number; walk: WalkStatus }
  | { kind: "twin"; pair: number }
  | { kind: "reveal"; pair: number }
  | { kind: "done" };

export const newDay = (day: string): DayState => ({ day, pairs: [{}] });

const current = (d: DayState) => d.pairs[d.pairs.length - 1];
const withCurrent = (d: DayState, p: PairState): DayState => ({ ...d, pairs: [...d.pairs.slice(0, -1), p] });

export const MAX_TRIES = 2;
/** A second try is under way: its walk started, its twin not taken yet. */
export const retrying = (p: PairState) => !!p.walk2 && (p.tries ?? 1) < MAX_TRIES;
/** The walk that counts right now (the second one during a retry). */
export const activeWalk = (p: PairState) => (retrying(p) ? p.walk2 : p.twin ? undefined : p.walk);
export const canRetry = (p: PairState) => !!p.twin && !p.walk2 && !p.closedAt && (p.tries ?? 1) < MAX_TRIES;

export function phase(d: DayState, now: number): Phase {
  const pair = d.pairs.length;
  const p = current(d);
  if (!p.first) return { kind: "first", pair };
  if (retrying(p)) {
    const w = walkStatus(p.walk2!, now);
    return w.unlocked ? { kind: "twin", pair } : { kind: "walking", pair, walk: w };
  }
  if (!p.twin) {
    const w = walkStatus(p.walk ?? startWalk(p.first.ts), now);
    return w.unlocked ? { kind: "twin", pair } : { kind: "walking", pair, walk: w };
  }
  if (!p.closedAt) return { kind: "reveal", pair };
  return { kind: "done" };
}

function expect(d: DayState, now: number, kinds: Phase["kind"][]): void {
  const k = phase(d, now).kind;
  if (!kinds.includes(k)) throw new Error(`can't do that during "${k}"`);
}

export function acceptFirst(d: DayState, shot: ShotRef, now: number): DayState {
  expect(d, now, ["first"]);
  return withCurrent(d, { first: shot, walk: startWalk(shot.ts) });
}

/** Replace the active walk (new GPS fix, GPS denied). Ignored when no walk is under way. */
export function updateWalk(d: DayState, f: (w: Walk) => Walk): DayState {
  const p = current(d);
  if (!p.first) return d;
  if (retrying(p)) return withCurrent(d, { ...p, walk2: f(p.walk2!) });
  if (p.twin || !p.walk) return d;
  return withCurrent(d, { ...p, walk: f(p.walk) });
}

export function acceptTwin(d: DayState, shot: ShotRef, result: PairResult, now: number): DayState {
  expect(d, now, ["twin"]);
  const p = current(d);
  if (!retrying(p)) return withCurrent(d, { ...p, twin: shot, result, tries: 1 });
  // second try: keep the higher score (the first twin on a tie)
  const better = result.score > p.result!.score;
  return withCurrent(d, { ...p, tries: 2, lastTry: { twin: shot, result }, ...(better ? { twin: shot, result } : {}) });
}

/** "Retake first photo" (G4): back to the first shot, nothing spent. Only before any twin is taken. */
export const canRetake = (p: PairState) => !!p.first && !p.twin;
export function retakeFirst(d: DayState, now: number): DayState {
  expect(d, now, ["walking", "twin"]);
  if (!canRetake(current(d))) throw new Error("the twin is already taken");
  return withCurrent(d, {});
}

/** "Try another twin" (G3): once per pair, after its reveal; needs another walk. */
export function startRetry(d: DayState, now: number): DayState {
  expect(d, now, ["reveal"]);
  const p = current(d);
  if (!canRetry(p)) throw new Error("no more tries for this pair");
  return withCurrent(d, { ...p, walk2: startWalk(now) });
}

/** After a reveal: start the next pair, or close the day after the third. */
export function closeReveal(d: DayState, now: number): DayState {
  expect(d, now, ["reveal"]);
  const closed = withCurrent(d, { ...current(d), closedAt: now });
  return d.pairs.length < PAIRS_PER_DAY ? { ...closed, pairs: [...closed.pairs, {}] } : closed;
}

/** Finished pairs, in order. */
export const donePairs = (d: DayState) => d.pairs.filter((p): p is Required<Pick<PairState, "first" | "twin" | "result">> & PairState => !!(p.first && p.twin && p.result));

/** Index (into donePairs) of today's Doppel: highest score, earliest on a tie. */
export function bestPair(d: DayState): number | undefined {
  const done = donePairs(d);
  let best: number | undefined;
  done.forEach((p, i) => {
    if (best === undefined || p.result.score > done[best].result.score) best = i;
  });
  return best;
}

/** Metres walked today, over all pairs (GPS only; timer walks count 0). */
export const metersWalked = (d: DayState) => Math.round(d.pairs.reduce((s, p) => s + (p.walk?.meters ?? 0) + (p.walk2?.meters ?? 0), 0));

export const bandOf = (p: PairState): Band | undefined => p.result?.band;
