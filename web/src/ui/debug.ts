// Hidden ?debug=1 panel: model load time, per-image embed time, backend.
// "Self-test" embeds a synthetic image and reads its label without saving
// anything; ?debug=1&autotest=1 runs it on load and POSTs the result
// to /__report (dev server) so headless runs can be checked.
import { getEmbedder } from "../embed";
import { readPhoto } from "../twin";
import { loadVocab } from "../vocab";
import { esc } from "./dom";

const ms = (v?: number) => (v === undefined ? "–" : `${Math.round(v)} ms`);

export function debugPanelHtml(): string {
  const i = getEmbedder().info;
  return `
    <section class="debug" aria-label="Debug">
      <h2>Debug</h2>
      <dl>
        <dt>Backend</dt><dd data-testid="dbg-backend">${esc(i.backend)}</dd>
        <dt>Adapter</dt><dd data-testid="dbg-adapter">${esc(i.adapter ?? "–")}</dd>
        <dt>Model load</dt><dd data-testid="dbg-load">${ms(i.loadMs)}</dd>
        <dt>Last image embed</dt><dd data-testid="dbg-image">${ms(i.lastImageMs)}</dd>
        <dt>Online</dt><dd>${navigator.onLine ? "yes" : "no"}</dd>
        <dt>SW controlled</dt><dd>${navigator.serviceWorker?.controller ? "yes" : "no"}</dd>
      </dl>
      <button class="btn" id="dbg-selftest" type="button">Run self-test</button>
      <pre id="dbg-out"></pre>
    </section>`;
}

async function syntheticImage(): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f48067";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#112f2c";
  g.fillRect(64, 64, 128, 128);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9));
}

export async function runSelfTest(): Promise<string> {
  const e = getEmbedder();
  const t0 = performance.now();
  const [vocab] = await Promise.all([loadVocab(), e.ready()]);
  const photo = await e.embedImage(await syntheticImage());
  const r = readPhoto(photo, vocab);
  return `SELFTEST_PASS backend=${e.info.backend} adapter=${e.info.adapter ?? "-"} loadMs=${Math.round(e.info.loadMs ?? -1)} imageMs=${Math.round(e.info.lastImageMs ?? -1)} totalMs=${Math.round(performance.now() - t0)} online=${navigator.onLine} sw=${!!navigator.serviceWorker?.controller} label=${r.label.replace(/ /g, "_")} margin=${r.margin.toFixed(4)}`;
}

export function mountDebug(root: HTMLElement) {
  const params = new URLSearchParams(location.search);
  if (!params.has("debug")) return;
  root.insertAdjacentHTML("beforeend", debugPanelHtml());
  const out = document.getElementById("dbg-out")!;
  const go = async () => {
    let line: string;
    try {
      line = await runSelfTest();
    } catch (err) {
      line = `SELFTEST_FAIL ${(err as Error).message}`;
    }
    out.textContent = line;
    root.querySelector(".debug")?.replaceWith(Object.assign(document.createElement("div"), { innerHTML: debugPanelHtml() }).firstElementChild!);
    document.getElementById("dbg-out")!.textContent = line;
    fetch("/__report", { method: "POST", body: line }).catch(() => {});
  };
  document.getElementById("dbg-selftest")!.addEventListener("click", go);
  if (params.has("autotest")) void go();
}
