// Glue between the pure rules (game.ts) and storage (store.ts): load today's
// game from IndexedDB, record a shot, give up.
import { addShot as applyShot, dayKey, giveUp as applyGiveUp, newGame, type GameState } from "./game";
import { addShot as saveShot, getGame, listShots, putGame, type Shot } from "./store";

export async function loadGame(day: string): Promise<GameState> {
  const [rec, shots] = await Promise.all([getGame(day), listShots(day)]);
  const g = newGame(day);
  return { ...g, ...rec, shots: shots.map(({ ts, temperature, rank, band, won }) => ({ ts, temperature, rank, band, won })) };
}

export const loadToday = (now = Date.now()) => loadGame(dayKey(now));

/** Validates against the rules first, so a shot during cooldown is never saved. */
export async function recordShot(g: GameState, shot: Shot): Promise<GameState> {
  const next = applyShot(g, shot);
  await saveShot(shot);
  await putGame({ day: next.day, status: next.status, endedAt: next.endedAt });
  return next;
}

export async function giveUpGame(g: GameState, now = Date.now()): Promise<GameState> {
  const next = applyGiveUp(g, now);
  await putGame({ day: next.day, status: next.status, endedAt: next.endedAt });
  return next;
}
