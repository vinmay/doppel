// The walk between a photo and its twin. Pure: positions and `now` come in,
// nothing reads the clock or the GPS here.
//   - The twin shot unlocks after WALK_METERS of movement, from GPS fixes.
//   - When GPS can't be trusted (no permission, accuracy > MAX_ACCURACY_M, or
//     no fix for FIX_STALE_MS), it unlocks WALK_FALLBACK_MS after the walk began.
//   - Jumps over MAX_JUMP_M between fixes are noise and ignored; steps under
//     MIN_STEP_M are jitter and don't count yet (the anchor stays put).
// Timers are wall-clock (startedAt + duration), so a reload changes nothing.

export const WALK_METERS = 50;
export const WALK_FALLBACK_MS = 45_000;
export const MAX_ACCURACY_M = 30;
export const MAX_JUMP_M = 200;
export const MIN_STEP_M = 5;
export const FIX_STALE_MS = 20_000;

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number; // metres
  ts: number;
}

export interface Walk {
  startedAt: number;
  meters: number;
  anchor?: Fix; // last trusted position distance is measured from
  lastFix?: Fix; // last fix of any quality (for "is GPS usable right now")
  gpsDenied?: boolean;
}

export const startWalk = (now: number): Walk => ({ startedAt: now, meters: 0 });

/** Great-circle distance in metres. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function addFix(w: Walk, f: Fix): Walk {
  if (![f.lat, f.lng, f.accuracy, f.ts].every(Number.isFinite)) return w;
  const next: Walk = { ...w, lastFix: f };
  if (f.accuracy > MAX_ACCURACY_M) return next;
  if (!w.anchor) return { ...next, anchor: f };
  const d = haversine(w.anchor, f);
  if (d > MAX_JUMP_M) return next; // teleport: noise
  if (d < MIN_STEP_M) return next; // jitter
  return { ...next, anchor: f, meters: w.meters + d };
}

export const denyGps = (w: Walk): Walk => ({ ...w, gpsDenied: true });

/** GPS is usable when there's a recent fix that's accurate enough. */
export function gpsGood(w: Walk, now: number): boolean {
  const f = w.lastFix;
  return !w.gpsDenied && !!f && f.accuracy <= MAX_ACCURACY_M && now - f.ts <= FIX_STALE_MS;
}

export interface WalkStatus {
  unlocked: boolean;
  mode: "gps" | "timer";
  meters: number;
  metersLeft: number;
  msLeft: number; // timer fallback: time until unlock (0 once unlocked)
}

export function walkStatus(w: Walk, now: number): WalkStatus {
  const metersLeft = Math.max(0, WALK_METERS - Math.round(w.meters));
  const msLeft = Math.max(0, w.startedAt + WALK_FALLBACK_MS - now);
  const mode = gpsGood(w, now) ? "gps" : "timer";
  const unlocked = metersLeft === 0 || (mode === "timer" && msLeft === 0);
  return { unlocked, mode, meters: Math.round(w.meters), metersLeft, msLeft: unlocked ? 0 : msLeft };
}
