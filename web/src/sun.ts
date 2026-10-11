// Doppel's day starts at local sunrise ("New day at sunrise."). Without a
// location, or where the sun doesn't rise, it starts at 06:00 local time.
// Sunrise: NOAA's simplified solar position equations (accurate to ~1-2 min),
// with the standard -0.833 deg altitude for refraction and the sun's radius.

export interface Place {
  lat: number;
  lng: number;
}

const DAY_MS = 86_400_000;
const rad = Math.PI / 180;
export const FALLBACK_HOUR = 6;

/** Sunrise on the UTC calendar date of `dateUtcMidnight` at `place`, as epoch ms; undefined in polar day/night. */
export function sunriseUtc(dateUtcMidnight: number, place: Place): number | undefined {
  const d = new Date(dateUtcMidnight);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.round((dateUtcMidnight - start) / DAY_MS) + 1;
  const g = ((2 * Math.PI) / 365) * (doy - 1); // fractional year at 00:00 (good enough for sunrise)
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = place.lat * rad;
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  if (!(cosHa >= -1 && cosHa <= 1)) return undefined;
  const ha = Math.acos(cosHa) / rad;
  const minutes = 720 - 4 * (place.lng + ha) - eqtime;
  return dateUtcMidnight + minutes * 60_000;
}

/** Calendar date ("YYYY-MM-DD") and minutes past midnight of `now` in `timeZone`. */
export function localParts(now: number, timeZone?: string): { date: string; minutes: number } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function addDays(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Sunrise that falls on local calendar `date` (epoch ms). The UTC-date formula
 * can land on the neighbouring local date far from Greenwich (Tokyo's sunrise
 * is the previous UTC day), so shift by a day when it does.
 */
export function localSunrise(date: string, place: Place, timeZone?: string): number | undefined {
  for (const shift of [0, -1, 1]) {
    const rise = sunriseUtc(Date.parse(`${addDays(date, shift)}T00:00:00Z`), place);
    if (rise !== undefined && localParts(rise, timeZone).date === date) return rise;
  }
  return undefined;
}

/**
 * The game day `now` belongs to: the local date of the most recent sunrise,
 * or of the most recent 06:00 without a place (or in polar day/night).
 * A pair started at 23:50 is still "today" at 00:10.
 */
export function dayKey(now: number, place?: Place, timeZone?: string): string {
  const { date, minutes } = localParts(now, timeZone);
  const rise = place ? localSunrise(date, place, timeZone) : undefined;
  if (rise !== undefined) return now >= rise ? date : addDays(date, -1);
  return minutes >= FALLBACK_HOUR * 60 ? date : addDays(date, -1);
}

/** When the next game day starts after `now` (epoch ms), for "New day at 7:14." */
export function nextDayStart(now: number, place?: Place, timeZone?: string): number {
  const today = dayKey(now, place, timeZone);
  // Bisection on dayKey over the next 30 hours: DST- and fallback-safe, and cheap.
  let lo = now, hi = now + 30 * 3_600_000;
  if (dayKey(hi, place, timeZone) === today) return hi;
  while (hi - lo > 1000) {
    const mid = (lo + hi) / 2;
    if (dayKey(mid, place, timeZone) === today) lo = mid;
    else hi = mid;
  }
  return hi;
}
