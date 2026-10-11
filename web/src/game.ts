// Warmr game rules. Pure functions over plain data and an explicit `now`, so
// state survives reloads (all timers derive from stored wall-clock
// timestamps) and tests can use a fake clock.
import type { Pack } from "./packs";

/** Everyone plays the same secret, so "today" is one fixed zone. */
export const GAME_TZ = "America/New_York";
/** Warmr #1 is the first pack's day. */
export const EPOCH = "2026-10-08";
/** After a shot: result on screen this long, then the pocket screen. */
export const RESULT_MS = 8_000;
/** No new shot until this long after the last one. Walk. */
export const COOLDOWN_MS = 45_000;
/** Hints unlock once this many shots have missed: they help shots 4, 6 and 8. */
export const HINT_AFTER = [3, 5, 7] as const;

/** YYYY-MM-DD for `when` in `timeZone` (en-CA formats dates that way). */
export function localDate(when: Date | number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
}

export const dayKey = (now: Date | number) => localDate(now, GAME_TZ);

export function gameNumber(day: string): number {
  const ms = Date.parse(`${day}T12:00:00Z`) - Date.parse(`${EPOCH}T12:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** FNV-1a, 32-bit. Stable across browsers, so every player gets the same secret. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Same normalisation as tools/build_vocab.py (lowercase, single spaces, a/an). */
export function normText(s: string): string {
  const t = s.trim().toLowerCase().replace(/\s+/g, " ");
  const m = t.match(/^(a|an) (\S+)(.*)$/);
  if (!m) return t;
  return `${/^[aeiou]/.test(m[2]) ? "an" : "a"} ${m[2]}${m[3]}`;
}

// First hint: what kind of thing. The earliest keyword in the phrase is
// usually its head noun ("a thin brown tendril winding around a branch").
const KINDS: [RegExp, string][] = [
  [/\b(mushroom|toadstool|fung\w*|shelf|bracket|growth|lichen)/, "a fungus or lichen"],
  [/\b(moss\w*|grass|fern|stems?|stalks?|reeds?|vines?|tendril|weeds?)\b/, "a plant"],
  [/\b(leaf|leaves)\b/, "a leaf"],
  [/\b(seed\w*|pod|nut|acorn|pinecone|pine cone|husk)\b/, "a seed, nut or pod"],
  [/\b(berr\w*|fruit|flower|bloom|chrysanthemum|thistle|pumpkin)/, "a flower or fruit"],
  [/\b(bark|trunk|stump|branch|twig|root|wood|log)\b/, "part of a tree"],
  [/\b(hydrant|bench|post|curb|railing|cover|grate|fence|brick)\b/, "something people built"],
  [/\b(stone|gravel|rock|pebble)\b/, "a stone"],
];

export function kindOf(text: string): { kind: string; word: string } | undefined {
  let best: { at: number; kind: string; word: string } | undefined;
  for (const [re, kind] of KINDS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { at: m.index, kind, word: m[1] };
  }
  return best && { kind: best.kind, word: best.word };
}

export interface Secret {
  day: string;
  number: number;
  text: string;
  vocabIndex: number;
  hints: [string, string, string];
}

/**
 * Secret for day D = packs[D].prompts[hash(D) % 5]. Past the last pack, the
 * pack is picked by hash too, so the game keeps going offline.
 */
export function secretFor(day: string, packs: Pack[], vocab: string[]): Secret {
  if (packs.length === 0) throw new Error("no prompt packs");
  const h = fnv1a(day);
  const pack = packs.find((p) => p.date === day) ?? [...packs].sort((a, b) => a.date.localeCompare(b.date))[h % packs.length];
  const prompt = pack.prompts[h % pack.prompts.length];
  const text = normText(prompt.text);
  const vocabIndex = vocab.indexOf(text);
  if (vocabIndex < 0) throw new Error(`secret "${text}" is not in the vocab`);
  const k = kindOf(text);
  const hints: [string, string, string] = [
    `It's ${k?.kind ?? "something outdoors"}.`,
    prompt.hint,
    `The main word starts with “${(k?.word ?? text.replace(/^(a|an|some) /, ""))[0].toUpperCase()}”.`,
  ];
  return { day, number: gameNumber(day), text, vocabIndex, hints };
}

export interface ShotLite {
  ts: number;
  temperature: number;
  rank: number;
  band: number;
  won: boolean;
}

export type Status = "playing" | "won" | "gave-up";

export interface GameState {
  day: string;
  status: Status;
  shots: ShotLite[]; // oldest first
  endedAt?: number;
}

export const newGame = (day: string): GameState => ({ day, status: "playing", shots: [] });

export type Phase =
  | { kind: "ready" }
  | { kind: "result"; leftMs: number } // last shot on screen
  | { kind: "cooldown"; leftMs: number } // pocket screen: walk
  | { kind: "won" }
  | { kind: "gave-up" };

export function phase(g: GameState, now: number): Phase {
  if (g.status === "won") {
    // the winning shot still gets its moment on the result screen
    const since = now - (g.endedAt ?? 0);
    return since >= 0 && since < RESULT_MS ? { kind: "result", leftMs: RESULT_MS - since } : { kind: "won" };
  }
  if (g.status === "gave-up") return { kind: "gave-up" };
  const last = g.shots.at(-1);
  // A clock that moved backwards (now < last.ts) must not lock the player out.
  if (!last || now < last.ts) return { kind: "ready" };
  const since = now - last.ts;
  if (since < RESULT_MS) return { kind: "result", leftMs: RESULT_MS - since };
  if (since < COOLDOWN_MS) return { kind: "cooldown", leftMs: COOLDOWN_MS - since };
  return { kind: "ready" };
}

export const canShoot = (g: GameState, now: number) => phase(g, now).kind === "ready";

export function addShot(g: GameState, shot: ShotLite): GameState {
  if (!canShoot(g, shot.ts)) throw new Error(`can't shoot now (${phase(g, shot.ts).kind})`);
  const shots = [...g.shots, shot];
  return shot.won ? { ...g, shots, status: "won", endedAt: shot.ts } : { ...g, shots };
}

export function giveUp(g: GameState, now: number): GameState {
  if (g.status !== "playing") return g;
  return { ...g, status: "gave-up", endedAt: now };
}

/** How many of the three hints are visible. */
export function hintsUnlocked(g: GameState): number {
  if (g.status !== "playing") return 3;
  return HINT_AFTER.filter((n) => g.shots.length >= n).length;
}

/** The secret's text may be shown only once the game is over. */
export const mayReveal = (g: GameState) => g.status !== "playing";

/** "0:45" */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
