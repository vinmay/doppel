// Doppel's screens as HTML strings. One visual idea runs through all of them:
// the pair frame, two square slots side by side. Empty, it explains the game;
// then the first print fills the left slot, the walk counts down in the right
// one, the twin fills it, and at the reveal the two prints slide together.
import { band, BANDS, BAND_NAMES, NOTHING_SHARED, STRETCH_LINE, type Band } from "../twin";
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

/**
 * The one HUD row under the header on every game screen: "PAIR n OF 3" on the
 * left, the phase's readout on the right (theme, walk timer/metres, metres walked).
 */
const hud = (pair: number, right = "") => `
  <div class="hud" aria-label="Progress">
    <span>PAIR <b data-testid="pair-n">${pair}</b> OF ${PAIRS_PER_DAY}</span>
    <span class="hud-right" data-testid="hud-right">${right}</span>
  </div>`;

const themeReadout = (theme?: string) => (theme ? `<span data-testid="theme">Today: ${esc(theme)}</span>` : "");
const walkedReadout = (meters: number) => `<span data-testid="walked">${meters} M WALKED</span>`;
/** Walk: the timer while GPS isn't usable, otherwise metres walked on this walk. */
export const walkHud = (w: WalkStatus) => (w.mode === "gps" ? `${w.meters} M WALKED` : `${clock(w.msLeft)} LEFT`);

/** A 4-step scale, Strangers to Uncanny, with only the current step filled. Always shown next to the band name, so it never rests on color alone. */
export const bandMarks = (b: Band) => {
  const n = BANDS.indexOf(b);
  return `<span class="marks" aria-hidden="true">${BANDS.map((_, i) => `<i${i === n ? ` class="on"` : ""}></i>`).join("")}</span>`;
};

/** The Wada identity lives in the mat around a photo, never on the photo itself (F6). */
export type Mat = Band | "neutral";
const MAT: Record<Mat, string> = { strangers: "var(--temp-1)", distant: "var(--temp-2)", cousins: "var(--temp-3)", uncanny: "var(--temp-4)", neutral: "var(--fg)" };
export const matStyle = (m: Mat) => `style="--mat: ${MAT[m]}"`;

const slot = (side: "a" | "b", inner: string, caption = "", mat?: Mat) => `
  <figure class="slot ${side}">
    <div class="frame${mat ? " mat" : ""}"${mat ? ` ${matStyle(mat)}` : ""}>${inner}</div>
    ${caption ? `<figcaption>${caption}</figcaption>` : ""}
  </figure>`;

/**
 * A real photo. With `flash`, a two-ink print sits on top for the ~400 ms
 * "developing" moment of a reveal and then fades away; the photo's own pixels
 * are never changed (F6).
 */
export const stack = (key: string, label: string, flash = false) =>
  `<span class="stack" data-stack="${esc(key)}" role="img" aria-label="${esc(label)}"><canvas class="photo"></canvas>${flash ? `<canvas class="print" aria-hidden="true"></canvas>` : ""}</span>`;

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
      <div class="pair together" id="practice-pair">
        ${slot("a", stack("practice-a", p.first.label, true), "", b)}
        ${slot("b", stack("practice-b", p.twin.label, true), "", b)}
      </div>
      <p class="label" id="practice-label">A practice pair · <a href="${href.how()}">How to play</a></p>
      <p class="labels">${esc(p.first.label)} <span aria-label="and">↔</span> ${esc(p.twin.label)}</p>
      <p class="score compact" data-value="${p.score}"><span class="n">${p.score}</span><span class="of">/100</span> <span class="band-inline">${bandMarks(b)} ${BAND_NAMES[b].toUpperCase()}</span></p>
      <p class="shared"><span class="label">What they share</span> Both: ${p.shared.map(esc).join(" · ")}</p>
    </div>`;
}


export function firstView(pair: number, ideas: string[], firstRun: boolean, practice?: Practice, theme?: string): string {
  if (firstRun && practice) {
    return `
    <section class="screen first" aria-label="First photo">
      ${hud(pair, themeReadout(theme))}
      ${practiceView(practice)}
      <h1 class="voice lede">Find two different things that look the same. Outside.</h1>
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
      ${hud(pair, themeReadout(theme))}
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

/** "Try: snow · foam · sheep" (G1). */
export const tryThese = (tries: string[]) => (tries.length ? `<p class="sub tries" data-testid="tries"><span class="label">Try</span> ${tries.map(esc).join(" · ")}</p>` : "");

export function walkView(pair: number, label: string, w: WalkStatus, looks: string[] = [], alt?: string, tries: string[] = [], again = false): string {
  return `
    <section class="screen walk" aria-label="Walk">
      ${hud(pair, `<span data-testid="walk-hud">${walkHud(w)}</span>`)}
      <div class="pair">
        ${slot("a", `<canvas id="photo-a" aria-label="Your first photo"></canvas>`, "", "neutral")}
        ${slot("b", `<div class="countdown">${walkReadout(w)}</div>`)}
      </div>
      <p class="sees">${sees(label, alt)}</p>
      <h1 class="voice">${again ? "Find another twin. Walk." : "Find its twin. Walk."}</h1>
      <p class="sub">${esc(notButLike(label))} Phone in your pocket until then.</p>
      ${lookFor(looks)}
      ${tryThese(tries)}
      ${again ? "" : `<p><button class="link" id="retake" type="button">Retake first photo</button></p>`}
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


export function twinView(pair: number, label: string, looks: string[] = [], alt?: string, tries: string[] = [], again = false, meters = 0): string {
  return `
    <section class="screen twin" aria-label="Twin photo">
      ${hud(pair, walkedReadout(meters))}
      <div class="pair">
        ${slot("a", `<canvas id="photo-a" aria-label="Your first photo"></canvas>`, "", "neutral")}
        ${slot("b", `<span class="slot-word">its twin?</span>`)}
      </div>
      <p class="sees">${sees(label, alt)}</p>
      <h1 class="voice">${again ? "Now another twin." : "Now its twin."}</h1>
      <p class="sub">${esc(notButLike(label))}</p>
      ${lookFor(looks)}
      ${tryThese(tries)}
      ${dock(shootButton("Photograph its twin"), again ? "" : `<button class="link" id="retake" type="button">Retake first photo</button>`)}
    </section>`;
}

export interface RevealExtras {
  canRetry: boolean;
  tries: number;
  secondKept: boolean; // after two tries: was the second twin the better one?
}

export function revealView(pair: number, p: Required<Pick<PairState, "first" | "twin" | "result">>, last: boolean, x: RevealExtras = { canRetry: false, tries: 1, secondKept: false }, meters = 0): string {
  const r = p.result;
  return `
    <section class="screen reveal" aria-label="Reveal" data-band="${r.band}">
      ${hud(pair, walkedReadout(meters))}
      <div class="pair together" id="pair">
        ${slot("a", stack("a", p.first.label, true), "", r.band)}
        ${slot("b", stack("b", p.twin.label, true), "", r.band)}
      </div>
      <p class="labels" data-testid="labels">${esc(p.first.label)} <span aria-label="and">↔</span> ${esc(p.twin.label)}</p>
      <p class="score" data-testid="score" data-value="${r.score}"><span class="n">${r.score}</span><span class="of">/100</span></p>
      <p class="band">${bandMarks(r.band)} <b data-testid="band">${BAND_NAMES[r.band].toUpperCase()}</b></p>
      ${r.bonus ? `<p class="stretch" data-testid="stretch"><b>+${r.bonus}</b> Stretch: ${STRETCH_LINE}</p>` : ""}
      <p class="voice verdict" data-testid="verdict">${esc(r.verdict)}</p>
      <p class="shared" data-testid="shared"><span class="label">What they share</span> ${r.shared.length ? `Both: ${r.shared.map(esc).join(" · ")}` : NOTHING_SHARED}</p>
      ${x.tries >= 2 ? `<p class="best-of" data-testid="best-of"><span class="label">Best of 2</span> ${x.secondKept ? "Your second twin scored higher." : "Your first twin scored higher, so it stays."}</p>` : ""}
      <div class="dock">
        <button class="btn btn-shoot" id="next" type="button">${last ? "See today" : "Next pair"}</button>
        ${x.canRetry ? `<button class="link" id="retry" type="button">Try another twin (one more walk)</button>` : ""}
      </div>
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
      ${hud(pairs.length, walkedReadout(meters))}
      <p class="label">TODAY'S DOPPEL</p>
      <div class="pair together best">
        ${slot("a", stack(`best-a`, b.first), "", b.band)}
        ${slot("b", stack(`best-b`, b.twin), "", b.band)}
      </div>
      <p class="labels" data-testid="best">${esc(b.first)} ↔ ${esc(b.twin)}</p>
      <p class="band"><b>${b.score}</b>/100 · ${bandMarks(b.band)} ${BAND_NAMES[b.band].toUpperCase()}</p>
      <h1 class="voice">Done for today.</h1>
      <ol class="pairs" aria-label="Today's pairs">
        ${pairs.map((p, i) => `
          <li${i === best ? ` class="is-best"` : ""}>
            <span class="thumbs mat" ${matStyle(p.band)}>${stack(`${i}-a`, p.first)}${stack(`${i}-b`, p.twin)}</span>
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
            <li><span class="thumbs mat" ${matStyle(r.band)}>${stack(`${i}-a`, r.first)}${stack(`${i}-b`, r.twin)}</span>
              <span>${esc(dayLabel(r.day))}: ${esc(r.first)} ↔ ${esc(r.twin)}</span><b>${r.score}</b></li>`).join("")}</ol>
          <p class="sub">Photos and scores are stored only on this device.</p>
          <p><button class="btn btn-quiet" id="delete-all" type="button">Delete everything</button></p>`}
    </section>`;
}

/** How to play (F8): one phone screen of rules, opened from the "?" in the header. */
export function howView(): string {
  return `
    <section class="screen how" aria-label="How to play">
      <h1 class="voice">How to play</h1>
      <ol class="steps">
        <li><b>Photograph anything outside.</b> Doppel says what it sees.</li>
        <li><b>Walk.</b> About 50 m, measured by GPS. Without location, or with weak GPS, a 45-second timer instead.</li>
        <li><b>Find its twin:</b> a different kind of thing that looks the same. A tire and a donut. Moss and broccoli.</li>
        <li><b>The reveal.</b> Doppel scores how alike they look, from 0 to 100.</li>
      </ol>
      <h2 class="label">The score</h2>
      <p class="sub"><b>Uncanny</b> 80+ · <b>Cousins</b> 50+ · <b>Distant</b> 30+ · <b>Strangers</b> below. "What they share" names what both photos have, like round or striped. Very different kinds of thing that still look alike earn a stretch bonus, up to +10.</p>
      <h2 class="label">Your day</h2>
      <p class="sub">Three pairs a day; your best pair is today's Doppel. You can retake the first photo before the twin, and try one more twin per pair: the better one counts. A new day starts at sunrise (6:00 without location).</p>
      <h2 class="label">Not counted</h2>
      <p class="sub">Screens, rooms, documents and people (take it outside), photos Doppel can't read, the same photo twice, or the same kind of thing. Refused shots never use up a turn.</p>
      <h2 class="label">Your phone</h2>
      <p class="sub">Needs WebGPU (Chrome on Android, or a recent desktop browser). The AI model downloads once (388 MB, Wi-Fi is best), then Doppel works offline. Photos never leave your phone. Location is only used to measure the walk.</p>
      <p class="sub"><a href="${href.today()}">Back to today</a></p>
    </section>`;
}
