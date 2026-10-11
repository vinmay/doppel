// Warmr's screens as HTML strings. The day's secret text is only ever put in
// the DOM by endedView (after a win or give-up).
import { BAND_NAMES } from "../score";
import { clock, hintsUnlocked, HINT_AFTER, type GameState, type Secret, type ShotLite } from "../game";
import { href } from "../router";
import { VOCAB_TEXTS } from "../vocab";
import { esc } from "./dom";

const pad2 = (n: number) => String(n).padStart(2, "0");
const hhmmss = (ts: number) => {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();

/** Text color for a temperature numeral: cool stops fail 3:1 on the ground, so they use --fg. */
export const numeralColor = (band: number) => (band >= 3 ? `var(--temp-${band})` : "var(--fg)");

function hud(g: GameState, s: Secret): string {
  return `
    <div class="hud" aria-label="Game status">
      <span>WARMR <b>№${s.number}</b></span>
      <span>${esc(dayLabel(g.day))}</span>
      <span>SHOT <b data-testid="shot-count">${pad2(g.shots.length)}</b>/∞</span>
    </div>`;
}

function strip(shots: ShotLite[], label = "Your shots today"): string {
  if (!shots.length) return "";
  return `
    <ol class="strip" aria-label="${esc(label)}">
      ${shots.map((x, i) => `<li class="chip" style="--c: var(--temp-${x.won ? 5 : x.band})" title="Shot ${i + 1}: ${x.temperature}°, rank ${x.rank}">
        <span class="sr">Shot ${i + 1}:</span><b>${x.temperature}°</b><small>#${x.rank}</small></li>`).join("")}
    </ol>`;
}

function hints(g: GameState, s: Secret): string {
  const open = hintsUnlocked(g);
  return `
    <section class="hints" aria-label="Hints">
      ${s.hints.map((h, i) => i < open
        ? `<p class="hint open"><span class="label">HINT ${i + 1}</span> ${esc(h)}</p>`
        : `<p class="hint locked"><span class="label">HINT ${i + 1}</span> unlocks after shot ${HINT_AFTER[i]}</p>`).join("")}
    </section>`;
}

export function readyView(g: GameState, s: Secret): string {
  const last = g.shots.at(-1);
  const best = g.shots.length ? Math.max(...g.shots.map((x) => x.temperature)) : undefined;
  return `
    <section class="play">
      ${hud(g, s)}
      <p class="secret-row"><span class="label">SECRET</span><span class="redacted" aria-label="hidden until you find it"></span></p>
      ${last
        ? `<div class="reading">
            <p class="numeral" style="color:${numeralColor(last.band)}" data-testid="temperature">${last.temperature}<span class="deg">°</span></p>
            <p class="readout"><span class="label">LAST</span> <b>${BAND_NAMES[last.band].toUpperCase()}</b> · RANK <b>#${last.rank}</b> · BEST <b>${best}°</b></p>
          </div>`
        : `<div class="reading intro">
            <p class="numeral idle" aria-label="no reading yet">?<span class="deg">°</span></p>
            <p class="lede">Something outdoors is today's secret. Photograph anything. Warmr says how close it is: a temperature, and where the secret ranks among ${VOCAB_TEXTS.length} things for your photo.</p>
          </div>`}
      ${strip(g.shots)}
      ${hints(g, s)}
      <div class="dock">
        <div id="model-status"></div>
        <label class="shoot">
          <input id="photo" type="file" accept="image/*" capture="environment" hidden>
          <span class="btn btn-shoot" aria-disabled="true">${g.shots.length ? "Take the next shot" : "Take a shot"}</span>
        </label>
        <p id="status" class="status" role="status" aria-live="polite"></p>
        ${g.shots.length ? `<button class="link" id="give-up" type="button">Give up and see the secret</button>` : ""}
      </div>
    </section>`;
}

export function resultView(g: GameState, s: Secret, shot: ShotLite & { of: number; ts: number }, leftMs: number): string {
  return `
    <section class="shot" aria-label="Shot result">
      ${hud(g, s)}
      <figure class="plate">
        <canvas id="thermal" aria-label="Your photo, printed in the colors of its temperature"></canvas>
        <figcaption class="plate-hud"><span>SHOT ${pad2(g.shots.length)}</span><span>${hhmmss(shot.ts)}</span></figcaption>
      </figure>
      <p class="numeral" style="color:${numeralColor(shot.band)}" data-testid="temperature" data-value="${shot.temperature}"><span class="n">${shot.temperature}</span><span class="deg">°</span></p>
      <p class="readout"><b>${BAND_NAMES[shot.band].toUpperCase()}</b> · RANK <b data-testid="rank">#${shot.rank}</b> OF ${shot.of}</p>
      <p class="sub">The secret is closer to your photo than ${shot.of - shot.rank} of ${shot.of} things.</p>
      <p class="dock-row"><span class="label">POCKET IN <span data-timer>${clock(leftMs)}</span></span> <button class="link" id="pocket" type="button">Walk now</button></p>
    </section>`;
}

export function pocketView(g: GameState, leftMs: number): string {
  const last = g.shots.at(-1)!;
  return `
    <section class="pocket" aria-label="Walk">
      <p class="walk">Walk.</p>
      <p class="label">NEXT SHOT IN</p>
      <p class="timer" data-timer data-testid="cooldown">${clock(leftMs)}</p>
      <p class="sub">Phone in your pocket. Look around for something warmer.<br>Last: ${last.temperature}° · #${last.rank}</p>
    </section>`;
}

export function endedView(g: GameState, s: Secret, share: string, untilNextMs: number): string {
  const won = g.status === "won";
  return `
    <section class="ended">
      ${hud(g, s)}
      <p class="label">${won ? `FOUND IN ${g.shots.length}` : `GAVE UP AFTER ${g.shots.length}`}</p>
      <h1 class="secret" data-testid="secret">${esc(s.text)}</h1>
      ${won ? `<p class="numeral found" style="color:var(--temp-5)">${g.shots.at(-1)!.temperature}<span class="deg">°</span></p>` : ""}
      <div class="prints" id="prints" aria-label="Your shots, printed by temperature"></div>
      ${strip(g.shots)}
      <pre class="share-preview" data-testid="share-text">${esc(share)}</pre>
      <p><button class="btn btn-shoot" id="share" type="button">Share</button></p>
      <p id="share-status" class="status" role="status" aria-live="polite"></p>
      <p class="label">NEXT SECRET IN <span data-timer>${clock(untilNextMs).padStart(5, "0")}</span></p>
      <p><a href="${href.history()}">History</a></p>
    </section>`;
}

export interface HistoryDay {
  day: string;
  number: number;
  status: string;
  secret?: string; // only for finished days
  shots: { id: string; temperature: number; band: number; won: boolean }[];
}

export function historyView(days: HistoryDay[]): string {
  return `
    <section class="history">
      <h1>History</h1>
      ${days.length === 0
        ? `<p class="sub">No shots yet. <a href="${href.today()}">Today's secret</a> is waiting.</p>`
        : `<ol class="days">${days.map((d) => `
          <li class="day">
            <p class="hud"><span>№${d.number}</span><span>${esc(dayLabel(d.day))}</span><span>${d.status === "won" ? `FOUND IN ${d.shots.length}` : d.status === "gave-up" ? "GAVE UP" : `${d.shots.length} SHOTS`}</span></p>
            ${d.secret ? `<p class="secret small">${esc(d.secret)}</p>` : `<p class="sub">Secret still hidden.</p>`}
            <div class="prints">${d.shots.map((x) => `<canvas data-shot="${esc(x.id)}" data-band="${x.won ? 5 : x.band}" title="${x.temperature}°"></canvas>`).join("")}</div>
          </li>`).join("")}</ol>
          <div class="actions">
            <button class="btn" id="export" type="button">Export my shots</button>
            <button class="btn btn-danger" id="delete-all" type="button">Delete everything</button>
          </div>
          <p class="sub small">Photos and scores are stored only on this device.</p>`}
    </section>`;
}
