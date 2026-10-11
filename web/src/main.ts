import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/instrument-serif/latin-400.css";
import "./wada.css";
import "./style.css";
import { prepareImage } from "./capture";
import { acceptFirst, acceptTwin, activeWalk, bestPair, canRetry, closeReveal, retakeFirst, retrying, startRetry, donePairs, metersWalked, newDay, phase, updateWalk, type DayState, type Phase } from "./day";
import { clearAll, getDay, getMeta, getShot, listDays, newId, putDay, putShot, setMeta, type StoredShot } from "./db";
import { getEmbedder, isFakeEmbedder, onModelProgress } from "./embed";
import { fakePhotoVector } from "./embed/fake";
import { ideasFor } from "./ideas";
import { drawPhoto, drawPrint, type Tone } from "./print";
import { registerPwa } from "./pwa";
import { parseHash } from "./router";
import { dayKey, nextDayStart, type Place } from "./sun";
import practice from "../../data/practice.json";
import { band, checkShot, checkTwin, judgePair, PROBLEM_TEXT, readPhoto, suggestTwins, topAttributes } from "./twin";
import { mountDebug } from "./ui/debug";
import { esc, render } from "./ui/dom";
import { loadModelWithStatus } from "./ui/model-status";
import { doneView, firstView, historyView, revealView, twinView, walkPct, walkReadout, walkView, type DonePair } from "./ui/screens";
import { loadVocab } from "./vocab";
import { addFix, denyGps } from "./walk";

const app = document.getElementById("app")!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let routeSeq = 0;
let tick: number | undefined;
let day: DayState | undefined;
let place: Place | undefined;
let shown: string | undefined; // phase kind + pair currently rendered
let busy = false;

const shownKey = (p: Phase) => ("pair" in p ? `${p.kind}:${p.pair}` : p.kind);
const current = () => day!.pairs[day!.pairs.length - 1];

async function save() {
  if (day) await putDay(day);
}

// ---------- GPS: asked for at the first accepted shot, never on launch
let watchId: number | undefined;
let lastSaved = 0;
function startGps() {
  if (watchId !== undefined || !day) return;
  const w = activeWalk(current());
  if (!w || w.gpsDenied) return;
  if (!("geolocation" in navigator)) {
    day = updateWalk(day, denyGps);
    void save();
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (!day) return;
      // receive time, not pos.timestamp: a cached fix can be old, and the walk's clock is Date.now()
      const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, ts: Date.now() };
      day = updateWalk(day, (w) => addFix(w, fix));
      if (!place && fix.accuracy <= 1000) {
        place = { lat: +fix.lat.toFixed(2), lng: +fix.lng.toFixed(2) }; // rough place, for sunrise only
        void setMeta("place", place);
      }
      if (Date.now() - lastSaved > 2000) {
        lastSaved = Date.now();
        void save();
      }
    },
    (err) => {
      if (!day) return;
      if (err.code === err.PERMISSION_DENIED) {
        day = updateWalk(day, denyGps);
        stopGps();
        void save();
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
  );
}
function stopGps() {
  if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
  watchId = undefined;
}

// ---------- prints
const blobs = new Map<string, Promise<StoredShot | undefined>>();
const shotById = (id: string) => {
  if (!blobs.has(id)) blobs.set(id, getShot(id));
  return blobs.get(id)!;
};

/** Fill a print-over-photo stack. The print starts hidden unless `printed`. */
async function fillStack(el: Element | null, id: string | undefined, tone: Tone, side = 480) {
  if (!el || !id) return;
  const s = await shotById(id);
  if (!s) return;
  await Promise.all([drawPhoto(el.querySelector<HTMLCanvasElement>(".photo")!, s.thumbBlob, side), drawPrint(el.querySelector<HTMLCanvasElement>(".print")!, s.thumbBlob, tone, side)]);
}
async function photoInto(canvas: HTMLCanvasElement | null, id: string | undefined, side = 480) {
  if (!canvas || !id) return;
  const s = await shotById(id);
  if (s) await drawPhoto(canvas, s.thumbBlob, side);
}

// Press and hold a print to see the original photo (pointer, or Space/Enter when focused).
const peek = (t: EventTarget | null, on: boolean) => (t as Element | null)?.closest?.(".stack")?.classList.toggle("peek", on);
app.addEventListener("pointerdown", (e) => peek(e.target, true));
for (const ev of ["pointerup", "pointercancel", "pointerleave", "pointerout"]) app.addEventListener(ev, (e) => peek(e.target, false));
app.addEventListener("contextmenu", (e) => (e.target as Element).closest?.(".stack") && e.preventDefault());
app.addEventListener("keydown", (e) => (e.key === " " || e.key === "Enter") && (e.target as Element).classList?.contains("stack") && (e.preventDefault(), peek(e.target, true)));
app.addEventListener("keyup", (e) => (e.key === " " || e.key === "Enter") && peek(e.target, false));

/** Count the score up from 0 over ~700 ms. */
function countUp(el: HTMLElement | null) {
  if (!el || reducedMotion) return;
  const to = Number(el.dataset.value);
  const num = el.querySelector(".n")!;
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / 700);
    num.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  num.textContent = "0";
  requestAnimationFrame(step);
}

const timeOfDay = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// ---------- first run: a practice reveal while the model downloads
async function playPractice(seq: number) {
  const [a, b] = await Promise.all([practice.first.src, practice.twin.src].map(async (src) => (await fetch(`${import.meta.env.BASE_URL}${src}`)).blob()));
  if (seq !== routeSeq) return;
  const ca = app.querySelector<HTMLCanvasElement>("#practice-a"), cb = app.querySelector<HTMLCanvasElement>("#practice-b");
  if (!ca || !cb) return;
  const tone = band(practice.score);
  await Promise.all([drawPrint(ca, a, tone, 360), drawPrint(cb, b, tone, 360)]);
  app.querySelector("#practice-pair")?.classList.add("met");
  window.setTimeout(() => countUp(app.querySelector<HTMLElement>(".practice .score")), reducedMotion ? 0 : 450);
}

// ---------- Today
async function loadToday() {
  place ??= await getMeta<Place>("place");
  const key = dayKey(Date.now(), place);
  if (day?.day === key) return;
  // Keep playing a pair that straddles sunrise; switch once it's between pairs.
  if (day && !["first", "done"].includes(phase(day, Date.now()).kind)) return;
  day = (await getDay(key)) ?? newDay(key);
  shown = undefined;
}

async function showToday(seq: number, force = false) {
  await loadToday();
  if (seq !== routeSeq || !day) return;
  const now = Date.now();
  const p = phase(day, now);
  if (!force && shownKey(p) === shown) {
    const wireRetake = () =>
    app.querySelector("#retake")?.addEventListener("click", async () => {
      stopGps();
      day = retakeFirst(day!, Date.now());
      await save();
      void showToday(seq, true);
    });
  if (p.kind === "walking") {
      const c = app.querySelector(".countdown");
      if (c) c.innerHTML = walkReadout(p.walk);
      const bar = app.querySelector<HTMLElement>(".walkbar");
      bar?.setAttribute("aria-valuenow", String(walkPct(p.walk)));
      bar?.firstElementChild?.setAttribute("style", `width:${walkPct(p.walk)}%`);
    }
    return;
  }
  if (busy && !force) return;
  shown = shownKey(p);
  document.body.dataset.phase = p.kind;
  const pr = current();

  if (p.kind === "first") {
    const firstRun = !(await getMeta<boolean>("played"));
    if (seq !== routeSeq) return;
    render(app, firstView(p.pair, ideasFor(day.day), firstRun, firstRun ? practice : undefined));
    wireShoot(seq, "first");
    if (firstRun) {
      void playPractice(seq);
      // "while Doppel downloads" only while a download is actually running
      const off = onModelProgress((m) => {
        const l = app.querySelector("#practice-label");
        if (l) l.textContent = m.phase === "download" && m.loaded < m.total ? "A practice pair, while Doppel downloads" : "A practice pair";
        if (m.phase === "init" && m.loaded >= m.total) off();
      });
    }
    return mountDebug(app);
  }
  const wireRetake = () =>
    app.querySelector("#retake")?.addEventListener("click", async () => {
      stopGps();
      day = retakeFirst(day!, Date.now());
      await save();
      void showToday(seq, true);
    });
  if (p.kind === "walking") {
    render(app, walkView(p.pair, pr.first!.label, p.walk, pr.first!.looks ?? [], pr.first!.alt, pr.first!.tries ?? [], retrying(pr)));
    startGps();
    wireRetake();
    return void photoInto(app.querySelector("#photo-a"), pr.first!.id);
  }
  if (p.kind === "twin") {
    render(app, twinView(p.pair, pr.first!.label, pr.first!.looks ?? [], pr.first!.alt, pr.first!.tries ?? [], retrying(pr)));
    startGps(); // keep counting metres until the twin is in
    void photoInto(app.querySelector("#photo-a"), pr.first!.id);
    wireRetake();
    return wireShoot(seq, "twin");
  }
  if (p.kind === "reveal") {
    const done = pr as Required<typeof pr>;
    render(app, revealView(p.pair, done, p.pair >= 3, { canRetry: canRetry(pr), tries: pr.tries ?? 1, secondKept: !!pr.lastTry && pr.lastTry.twin.id === pr.twin!.id }));
    const tone = done.result.band;
    await Promise.all([fillStack(app.querySelector('[data-stack="a"]'), done.first.id, tone), fillStack(app.querySelector('[data-stack="b"]'), done.twin.id, tone)]);
    if (seq !== routeSeq) return;
    // The two real photos slide together; then they turn into the print while the score counts up.
    const pair = app.querySelector("#pair");
    pair?.classList.add("met");
    window.setTimeout(() => {
      pair?.classList.add("printed");
      countUp(app.querySelector<HTMLElement>("[data-testid=score]"));
    }, reducedMotion ? 0 : 550);
    if (tone === "uncanny") navigator.vibrate?.(30);
    app.querySelector("#retry")?.addEventListener("click", async () => {
      day = startRetry(day!, Date.now());
      await save();
      void showToday(seq, true);
    });
    app.querySelector("#next")!.addEventListener("click", async () => {
      day = closeReveal(day!, Date.now());
      await save();
      void showToday(seq, true);
    });
    return;
  }
  // done
  const pairs = donePairs(day);
  const rows: DonePair[] = pairs.map((x) => ({ first: x.first.label, twin: x.twin.label, score: x.result.score, band: x.result.band }));
  const best = bestPair(day) ?? 0;
  render(app, doneView(rows, best, metersWalked(day), timeOfDay(nextDayStart(now, place)), !!place));
  for (const el of app.querySelectorAll<HTMLElement>("[data-stack]")) {
    const [i, side] = el.dataset.stack!.split("-");
    const x = pairs[i === "best" ? best : Number(i)];
    void fillStack(el, side === "a" ? x.first.id : x.twin.id, x.result.band, i === "best" ? 480 : 160);
  }
}

function wireShoot(seq: number, which: "first" | "twin") {
  const input = app.querySelector<HTMLInputElement>("#photo")!;
  const button = input.nextElementSibling as HTMLElement;
  const status = app.querySelector<HTMLElement>("#status")!;
  const refusal = app.querySelector<HTMLElement>("#refusal")!;
  const setBusy = (b: boolean) => {
    busy = b;
    input.disabled = b;
    button.setAttribute("aria-disabled", String(b)); // CSS dims [aria-disabled="true"]
    button.classList.toggle("is-busy", b);
  };
  setBusy(true);
  Promise.all([loadModelWithStatus(app.querySelector("#model-status")!), loadVocab()])
    .then(() => seq === routeSeq && setBusy(false))
    // model errors are already explained in #model-status; only say other failures here
    .catch((e) => (app.querySelector("#model-status")?.textContent?.trim() ? undefined : (status.textContent = (e as Error).message)));

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file || !day) return;
    setBusy(true);
    refusal.hidden = true;
    try {
      const accepted = await takePhoto(file, which, (m) => (status.textContent = m), (problem) => {
        refusal.textContent = `Not counted. ${problem}`;
        refusal.hidden = false;
      });
      if (accepted && seq === routeSeq) {
        busy = false;
        await showToday(seq, true);
      }
    } catch (e) {
      status.textContent = `Couldn't read that photo: ${(e as Error).message}`;
    } finally {
      if (seq === routeSeq && app.contains(input)) setBusy(false);
    }
  });
}

/** photo -> on-device embedding -> rules -> accepted (saved) or refused (not spent). */
async function takePhoto(file: File, which: "first" | "twin", onStatus: (s: string) => void, onRefused: (s: string) => void): Promise<boolean> {
  onStatus("Developing… 1/3");
  const [{ embedBlob, thumbBlob }, vocab] = await Promise.all([prepareImage(file), loadVocab()]);
  onStatus("Reading the photo on your phone… 2/3");
  const embedder = getEmbedder();
  await embedder.ready();
  let vector = await embedder.embedImage(embedBlob);
  if (isFakeEmbedder()) vector = fakePhotoVector(file.name, vocab) ?? vector;
  onStatus("Comparing… 3/3");
  const reading = readPhoto(vector, vocab);
  const now = Date.now();
  const pr = current();

  if (which === "first") {
    const problem = checkShot(reading);
    if (problem) return (onStatus(""), onRefused(PROBLEM_TEXT[problem]), false);
    const id = newId();
    await putShot({ id, day: day!.day, ts: now, vector, reading, thumbBlob });
    day = acceptFirst(day!, { id, ts: now, label: reading.label, ...(reading.alt ? { alt: reading.alt } : {}), looks: topAttributes(reading.attrZ), tries: suggestTwins(vector, reading, vocab) }, now);
    await setMeta("played", true);
  } else {
    const first = (await shotById(pr.first!.id))!;
    const problem = checkTwin({ vector: first.vector, reading: first.reading }, { vector, reading }, vocab);
    if (problem) return (onStatus(""), onRefused(PROBLEM_TEXT[problem]), false);
    const id = newId();
    await putShot({ id, day: day!.day, ts: now, vector, reading, thumbBlob });
    const result = judgePair({ vector: first.vector, reading: first.reading }, { vector, reading }, `${day!.day}#${day!.pairs.length}#${retrying(pr) ? 2 : 1}`, undefined, vocab);
    day = acceptTwin(day!, { id, ts: now, label: reading.label }, result, now);
    stopGps();
  }
  onStatus("");
  await save();
  return true;
}

// ---------- History
async function showHistory(seq: number) {
  const days = await listDays();
  if (seq !== routeSeq) return;
  const rows = days
    .map((d) => ({ d, i: bestPair(d) }))
    .filter((x) => x.i !== undefined)
    .map(({ d, i }) => ({ d, p: donePairs(d)[i!] }));
  render(app, historyView(rows.map(({ d, p }) => ({ day: d.day, first: p.first.label, twin: p.twin.label, score: p.result.score, band: p.result.band }))));
  for (const el of app.querySelectorAll<HTMLElement>("[data-stack]")) {
    const [i, side] = el.dataset.stack!.split("-");
    const { p } = rows[Number(i)];
    void fillStack(el, side === "a" ? p.first.id : p.twin.id, p.result.band, 160);
  }
  app.querySelector("#delete-all")?.addEventListener("click", async () => {
    if (!confirm("Delete all photos and scores from this device? This can't be undone.")) return;
    await clearAll();
    day = undefined;
    blobs.clear();
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
  document.querySelector(".topbar")?.insertAdjacentHTML("afterend", `<p class="test-banner">${esc("Test mode: fake embedder, scores are not real")}</p>`);
}
registerPwa();
window.addEventListener("hashchange", route);
route();
