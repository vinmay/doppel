// Doppel's screens as HTML strings. One visual idea runs through all of them:
// the pair frame, two square slots side by side. Empty, it explains the game;
// then the first print fills the left slot, the walk counts down in the right
// one, the twin fills it, and at the reveal the two prints slide together.
import { band, BANDS, BAND_NAMES, NOTHING_SHARED, type Band } from "../twin";
import type { PairState } from "../day";
import { PAIRS_PER_DAY } from "../day";
import type { WalkStatus } from "../walk";
import { href } from "../router";
import { notButLike } from "../grammar";
import { esc } from "./dom";

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const hud = (pair: number, right = "") => `
  <div class="hud" aria-label="Progress">
    <span>PAIR <b data-testid="pair-n">${pair}</b> OF ${PAIRS_PER_DAY}</span>
    <span>${right}</span>
  </div>`;

/** A 4-step scale, Strangers to Uncanny, with only the current step filled. Always shown next to the band name, so it never rests on color alone. */
export const bandMarks = (b: Band) => {
  const n = BANDS.indexOf(b);
  return `<span class="marks" aria-hidden="true">${BANDS.map((_, i) => `<i${i === n ? ` class="on"` : ""}></i>`).join("")}</span>`;
};

const slot = (side: "a" | "b", inner: string, caption = "") => `
  <figure class="slot ${side}">
    <div class="frame">${inner}</div>
    <figcaption>${caption}</figcaption>
  </figure>`;

const sees = (label: string, alt?: string) => `Doppel sees: <b data-testid="sees">${esc(label)}${alt ? ` / ${esc(alt)}` : ""}</b>`;

const shootButton = (text: string) => `
  <label class="shoot">
    <input id="photo" type="file" accept="image/*" capture="environment" class="sr" aria-label="${esc(text)}">
    <span class="btn btn-shoot" aria-hidden="true">${esc(text)}</span>
  </label>`;

const dock = (button: string, extra = "") => `
  <div class="dock">
    <div id="model-status"></div>
    <p id="refusal" class="refusal" role="alert" hidden></p>
    ${button}
    <p id="status" class="status" role="status" aria-live="polite"></p>
    ${extra}
  </div>`;

export interface Practice {
  first: { label: string };
  twin: { label: string };
  score: number;
  shared: string[];
}

/** First run: a real reveal of two bundled photos, played while the model downloads. */
export function practiceView(p: Practice): string {
  const b = band(p.score);
  return `
    <div class="practice" aria-label="Practice reveal" data-testid="practice">
      <p class="label" id="practice-label">A practice pair</p>
      <div class="pair together" id="practice-pair">
        ${slot("a", `<canvas id="practice-a" aria-label="${esc(p.first.label)}, printed"></canvas>`)}
        ${slot("b", `<canvas id="practice-b" aria-label="${esc(p.twin.label)}, printed"></canvas>`)}
      </div>
      <p class="labels">${esc(p.first.label)} <span aria-label="and">↔</span> ${esc(p.twin.label)}</p>
      <p class="score compact" data-value="${p.score}"><span class="n">${p.score}</span><span class="of">/100</span> <span class="band-inline">${bandMarks(b)} ${BAND_NAMES[b].toUpperCase()}</span></p>
      <p class="shared"><span class="label">What they share</span> Both: ${p.shared.map(esc).join(" · ")}</p>
    </div>`;
}

export function firstView(pair: number, ideas: string[], firstRun: boolean, practice?: Practice): string {
  if (firstRun && practice) {
    return `
    <section class="screen first" aria-label="First photo">
      ${hud(pair)}
      <h1 class="voice lede">Find two different things that look the same. Outside.</h1>
      ${practiceView(practice)}
      <p class="sub privacy">Photos never leave your phone. Point it at things, not people.</p>
      <details class="ideas">
        <summary>Need an idea?</summary>
        <ul data-testid="ideas">${ideas.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </details>
      ${dock(shootButton("Photograph something"))}
    </section>`;
  }
  return `
    <section class="screen first" aria-label="First photo">
      ${hud(pair)}
      <div class="pair empty">
        ${slot("a", `<span class="slot-word">this</span>`)}
        ${slot("b", `<span class="slot-word">its twin</span>`)}
      </div>
      <h1 class="voice">${pair === 1 ? "Find two different things that look the same." : "Again. Start with anything outside."}</h1>
      <p class="sub">${pair === 1 ? "Photograph anything outside. Then walk, and find its twin." : "Then walk, and find its twin."}</p>
      ${firstRun ? `<p class="sub privacy">Photos never leave your phone. Point it at things, not people.</p>` : ""}
      <details class="ideas">
        <summary>Need an idea?</summary>
        <ul data-testid="ideas">${ideas.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </details>
      ${dock(shootButton("Photograph something"))}
    </section>`;
}

/** "Look for something round, dark or ridged." from the first photo's strongest attributes. */
export const lookFor = (looks: string[]) =>
  looks.length ? `<p class="sub" data-testid="look-for">Look for something ${esc(looks.length === 1 ? looks[0] : `${looks.slice(0, -1).join(", ")} or ${looks.at(-1)}`)}.</p>` : "";

export function walkView(pair: number, label: string, w: WalkStatus, looks: string[] = [], alt?: string): string {
  return `
    <section class="screen walk" aria-label="Walk">
      ${hud(pair, `${w.meters} M WALKED`)}
      <div class="pair">
        ${slot("a", `<canvas id="print-a" aria-label="Your first photo, printed"></canvas>`, sees(label, alt))}
        ${slot("b", `<div class="countdown">${walkReadout(w)}</div>`, "its twin")}
      </div>
      <h1 class="voice">Find its twin. Walk.</h1>
      <p class="sub">${esc(notButLike(label))} Phone in your pocket until then.</p>
      ${lookFor(looks)}
      <div class="walkbar" role="progressbar" aria-label="Walk" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${walkPct(w)}"><div style="width:${walkPct(w)}%"></div></div>
    </section>`;
}

export const walkPct = (w: WalkStatus) =>
  w.mode === "gps" ? Math.round((100 * Math.min(50, w.meters)) / 50) : Math.round(100 * (1 - w.msLeft / 45_000));

export function walkReadout(w: WalkStatus): string {
  return w.mode === "gps"
    ? `<span class="big" data-testid="walk-left">${w.metersLeft} m</span><span class="small">to go</span>`
    : `<span class="big" data-testid="walk-left">${clock(w.msLeft)}</span><span class="small">no GPS, so a timer</span>`;
}


export function twinView(pair: number, label: string, looks: string[] = [], alt?: string): string {
  return `
    <section class="screen twin" aria-label="Twin photo">
      ${hud(pair)}
      <div class="pair">
        ${slot("a", `<canvas id="print-a" aria-label="Your first photo, printed"></canvas>`, sees(label, alt))}
        ${slot("b", `<span class="slot-word">?</span>`, "its twin")}
      </div>
      <h1 class="voice">Now its twin.</h1>
      <p class="sub">${esc(notButLike(label))}</p>
      ${lookFor(looks)}
      ${dock(shootButton("Photograph its twin"))}
    </section>`;
}

export function revealView(pair: number, p: Required<Pick<PairState, "first" | "twin" | "result">>, last: boolean): string {
  const r = p.result;
  return `
    <section class="screen reveal" aria-label="Reveal" data-band="${r.band}">
      ${hud(pair)}
      <div class="pair together" id="pair">
        ${slot("a", `<canvas id="print-a" aria-label="${esc(p.first.label)}, printed"></canvas>`)}
        ${slot("b", `<canvas id="print-b" aria-label="${esc(p.twin.label)}, printed"></canvas>`)}
      </div>
      <p class="labels" data-testid="labels">${esc(p.first.label)} <span aria-label="and">↔</span> ${esc(p.twin.label)}</p>
      <p class="score" data-testid="score" data-value="${r.score}"><span class="n">${r.score}</span><span class="of">/100</span></p>
      <p class="band">${bandMarks(r.band)} <b data-testid="band">${BAND_NAMES[r.band].toUpperCase()}</b></p>
      <p class="voice verdict" data-testid="verdict">${esc(r.verdict)}</p>
      <p class="shared" data-testid="shared"><span class="label">What they share</span> ${r.shared.length ? `Both: ${r.shared.map(esc).join(" · ")}` : NOTHING_SHARED}</p>
      <div class="dock"><button class="btn btn-shoot" id="next" type="button">${last ? "See today" : "Next pair"}</button></div>
    </section>`;
}

export interface DonePair {
  first: string;
  twin: string;
  score: number;
  band: Band;
}

export function doneView(pairs: DonePair[], best: number, meters: number, nextDay: string, atSunrise: boolean): string {
  const b = pairs[best];
  return `
    <section class="screen done" aria-label="Done for today">
      <div class="hud"><span>DONE FOR TODAY</span><span data-testid="walked">${meters} M WALKED</span></div>
      <p class="label">TODAY'S DOPPEL</p>
      <div class="pair together best">
        ${slot("a", `<canvas data-print="${best}-a" aria-label="${esc(b.first)}, printed"></canvas>`)}
        ${slot("b", `<canvas data-print="${best}-b" aria-label="${esc(b.twin)}, printed"></canvas>`)}
      </div>
      <p class="labels" data-testid="best">${esc(b.first)} ↔ ${esc(b.twin)}</p>
      <p class="band"><b>${b.score}</b>/100 · ${bandMarks(b.band)} ${BAND_NAMES[b.band].toUpperCase()}</p>
      <h1 class="voice">Done for today.</h1>
      <ol class="pairs" aria-label="Today's pairs">
        ${pairs.map((p, i) => `
          <li${i === best ? ` class="is-best"` : ""}>
            <canvas data-print="${i}-a" aria-hidden="true"></canvas><canvas data-print="${i}-b" aria-hidden="true"></canvas>
            <span>${esc(p.first)} ↔ ${esc(p.twin)}</span><b>${p.score}</b>
          </li>`).join("")}
      </ol>
      <p class="sub">${meters > 0 ? `You walked ${meters} m between photos.` : "You walked the timer out."} New day ${atSunrise ? "at sunrise, " : "at "}<span data-testid="next-day">${esc(nextDay)}</span>.</p>
      <p class="sub"><a href="${href.history()}">Past days</a></p>
    </section>`;
}

export interface HistoryRow {
  day: string;
  first: string;
  twin: string;
  score: number;
  band: Band;
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function historyView(rows: HistoryRow[]): string {
  return `
    <section class="screen history" aria-label="Past days">
      <h1 class="voice">Past Doppels</h1>
      ${rows.length === 0
        ? `<p class="sub">Nothing yet. <a href="${href.today()}">Today</a> is waiting.</p>`
        : `<ol class="pairs">${rows.map((r, i) => `
            <li><canvas data-print="${i}-a" aria-hidden="true"></canvas><canvas data-print="${i}-b" aria-hidden="true"></canvas>
              <span>${esc(dayLabel(r.day))}: ${esc(r.first)} ↔ ${esc(r.twin)}</span><b>${r.score}</b></li>`).join("")}</ol>
          <p class="sub">Photos and scores are stored only on this device.</p>
          <p><button class="btn btn-quiet" id="delete-all" type="button">Delete everything</button></p>`}
    </section>`;
}
