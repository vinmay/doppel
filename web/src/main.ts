import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/instrument-serif/latin-400.css";
import "./wada.css";
import "./style.css";
import { isFakeEmbedder } from "./embed";
import { buildExportZip, downloadBlob } from "./export";
import { clock, COOLDOWN_MS, dayKey, gameNumber, phase, secretFor, type GameState, type Phase, type Secret } from "./game";
import { PACKS } from "./packs";
import { giveUpGame, loadGame } from "./play";
import { registerPwa } from "./pwa";
import { parseHash } from "./router";
import { shareResult, shareText } from "./share";
import { takeShot } from "./shoot";
import { clearAll, listGames, listShots, type Shot } from "./store";
import { drawThermal } from "./thermal";
import { mountDebug } from "./ui/debug";
import { esc, render } from "./ui/dom";
import { loadModelWithStatus } from "./ui/model-status";
import { endedView, historyView, pocketView, readyView, resultView, type HistoryDay } from "./ui/play";
import { loadVocab, VOCAB_TEXTS } from "./vocab";

const app = document.getElementById("app")!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let routeSeq = 0;
let tick: number | undefined;
let game: GameState | undefined;
let secret: Secret | undefined;
let shown: Phase["kind"] | undefined;

/** Count the numeral up from 0 over ~600 ms. */
function countUp(el: HTMLElement | null) {
  if (!el || reducedMotion) return;
  const to = Number(el.dataset.value);
  const num = el.querySelector(".n")!;
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / 600);
    num.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  num.textContent = "0";
  requestAnimationFrame(step);
}

/** Time until the next America/New_York midnight (bisection on dayKey, DST-safe). */
function msToNextDay(now: number): number {
  const today = dayKey(now);
  let lo = now, hi = now + 26 * 3600_000;
  while (hi - lo > 500) {
    const mid = (lo + hi) / 2;
    if (dayKey(mid) === today) lo = mid;
    else hi = mid;
  }
  return hi - now;
}

const hms = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

/** Render today's game for its current phase. Timers only refresh the view. */
async function showToday(seq: number, force = false) {
  const now = Date.now();
  if (!game || !secret || game.day !== dayKey(now)) {
    const day = dayKey(now);
    secret = secretFor(day, PACKS, VOCAB_TEXTS);
    game = await loadGame(day);
    if (seq !== routeSeq) return;
    force = true;
  }
  const p = phase(game, now);
  if (!force && p.kind === shown) {
    const t = app.querySelector<HTMLElement>("[data-timer]");
    if (t) t.textContent = "leftMs" in p ? clock(p.leftMs) : hms(msToNextDay(now));
    return;
  }
  shown = p.kind;
  document.body.dataset.phase = p.kind;
  const g = game, s = secret;

  if (p.kind === "ready") {
    render(app, readyView(g, s));
    wireReady(seq);
    return mountDebug(app, s);
  }
  if (p.kind === "cooldown") return render(app, pocketView(g, p.leftMs));

  const shots = await listShots(g.day);
  if (seq !== routeSeq) return;
  if (p.kind === "result") {
    const rec = shots.at(-1)!;
    render(app, resultView(g, s, rec, p.leftMs));
    void drawThermal(app.querySelector("#thermal")!, rec.thumbBlob, rec.won ? 5 : rec.band);
    countUp(app.querySelector<HTMLElement>("[data-testid=temperature]"));
    app.querySelector("#pocket")?.addEventListener("click", () => {
      shown = "cooldown"; // the cooldown still counts from the shot itself
      document.body.dataset.phase = "cooldown";
      render(app, pocketView(g, COOLDOWN_MS - (Date.now() - rec.ts)));
    });
    return;
  }
  const text = shareText(s.number, g, location.origin + location.pathname);
  render(app, endedView(g, s, text, msToNextDay(now)));
  void drawPrints(app.querySelector("#prints")!, shots);
  app.querySelector("#share")!.addEventListener("click", async () => {
    const out = await shareResult(text);
    const msg = { shared: "Shared.", copied: "Copied to the clipboard.", cancelled: "", failed: "Couldn't share. Copy the text above." }[out];
    app.querySelector("#share-status")!.textContent = msg;
  });
}

function wireReady(seq: number) {
  const input = app.querySelector<HTMLInputElement>("#photo")!;
  const button = input.nextElementSibling as HTMLElement;
  const status = app.querySelector<HTMLElement>("#status")!;
  const setBusy = (busy: boolean) => {
    input.disabled = busy;
    button.toggleAttribute("aria-disabled", busy);
  };
  setBusy(true);
  Promise.all([loadModelWithStatus(app.querySelector("#model-status")!), loadVocab()])
    .then(() => seq === routeSeq && setBusy(false))
    .catch((e) => (status.textContent = (e as Error).message));
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file || !game || !secret) return;
    setBusy(true);
    try {
      game = (await takeShot(game, secret, file, (m) => (status.textContent = m))).game;
      if (seq === routeSeq) await showToday(seq, true);
    } catch (e) {
      status.textContent = `Couldn't read that photo: ${(e as Error).message}`;
      setBusy(false);
    }
  });
  app.querySelector("#give-up")?.addEventListener("click", async () => {
    if (!game || !confirm("Give up and reveal today's secret?")) return;
    game = await giveUpGame(game);
    await showToday(seq, true);
  });
}

async function drawPrints(root: HTMLElement, shots: Shot[]) {
  for (const s of shots) {
    const c = document.createElement("canvas");
    c.dataset.shot = s.id;
    root.append(c);
    await drawThermal(c, s.thumbBlob, s.won ? 5 : s.band, 240);
  }
}

async function showHistory(seq: number) {
  const [shots, games] = await Promise.all([listShots(), listGames()]);
  if (seq !== routeSeq) return;
  const status = new Map(games.map((g) => [g.day, g.status]));
  const today = dayKey(Date.now());
  const days = [...new Set(shots.map((s) => s.day))].sort().reverse();
  const rows: HistoryDay[] = days.map((day) => {
    const st = status.get(day) ?? "playing";
    // A past day is over even if it was never finished, so its secret may show.
    const over = st !== "playing" || day < today;
    return {
      day,
      number: gameNumber(day),
      status: st,
      secret: over ? secretFor(day, PACKS, VOCAB_TEXTS).text : undefined,
      shots: shots.filter((s) => s.day === day).map(({ id, temperature, band, won }) => ({ id, temperature, band, won })),
    };
  });
  render(app, historyView(rows));
  const byId = new Map(shots.map((s) => [s.id, s]));
  for (const c of app.querySelectorAll<HTMLCanvasElement>("canvas[data-shot]")) {
    const s = byId.get(c.dataset.shot!);
    if (s) void drawThermal(c, s.thumbBlob, Number(c.dataset.band), 200);
  }
  app.querySelector("#export")?.addEventListener("click", async () => {
    downloadBlob(await buildExportZip(await listShots(), await listGames()), `warmr-shots-${today}.zip`);
  });
  app.querySelector("#delete-all")?.addEventListener("click", async () => {
    if (!confirm(`Delete all ${shots.length} shots from this device? This can't be undone.`)) return;
    await clearAll();
    game = undefined;
    route();
  });
}

function route() {
  const seq = ++routeSeq;
  clearInterval(tick);
  shown = undefined;
  const r = parseHash(location.hash);
  document.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.nav === r.name));
  if (r.name === "history") {
    document.body.dataset.phase = "history";
    return void showHistory(seq);
  }
  void showToday(seq, true);
  tick = window.setInterval(() => void showToday(seq), 250);
}

if (isFakeEmbedder()) {
  document.querySelector(".topbar")?.insertAdjacentHTML("afterend", `<p class="test-banner">${esc("Test mode: fake embedder, temperatures are not real")}</p>`);
}
registerPwa();
window.addEventListener("hashchange", route);
route();
