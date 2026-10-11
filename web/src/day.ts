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
  twin?: ShotRef;
  result?: PairResult;
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

export function phase(d: DayState, now: number): Phase {
  const pair = d.pairs.length;
  const p = current(d);
  if (!p.first) return { kind: "first", pair };
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

/** Replace the walk (new GPS fix, GPS denied). Only during the walk; ignored otherwise. */
export function updateWalk(d: DayState, f: (w: Walk) => Walk): DayState {
  const p = current(d);
  if (!p.first || p.twin || !p.walk) return d;
  return withCurrent(d, { ...p, walk: f(p.walk) });
}

export function acceptTwin(d: DayState, shot: ShotRef, result: PairResult, now: number): DayState {
  expect(d, now, ["twin"]);
  return withCurrent(d, { ...current(d), twin: shot, result });
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
export const metersWalked = (d: DayState) => Math.round(d.pairs.reduce((s, p) => s + (p.walk?.meters ?? 0), 0));

export const bandOf = (p: PairState): Band | undefined => p.result?.band;
