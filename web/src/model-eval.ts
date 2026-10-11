// Model-in-the-loop eval: the real in-browser embedder over the CC0 fixtures,
// judged by the exact functions the app ships (twin.ts), plus timings and
// main-thread long tasks. POSTs EVAL_RESULT <json> to /__report.
// Dev-only page; run with `npm run test:model` (scripts/model-eval.mjs).
import { prepareImage } from "./capture";
import { LiteRtEmbedder } from "./embed/litert";
import { checkShot, checkTwin, judgePair, readPhoto, suggestTwins, topAttributes, type Reading } from "./twin";
import { loadVocab } from "./vocab";

const fixtures = import.meta.glob<string>("../tests/fixtures/*/*.jpg", { query: "?url", import: "default", eager: true });
const out = document.getElementById("out")!;
const post = (s: string) => fetch("/__report", { method: "POST", body: s }).catch(() => {});
const log = (s: string) => ((out.textContent += `${s}\n`), post(s));

const longTasks: number[] = [];
new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(e.duration))).observe({ type: "longtask", buffered: true });

async function main() {
  const e = new LiteRtEmbedder({ modelUrl: "/models/embeddinggemma-2-text-vision-440m.litertlm" });
  const t0 = performance.now();
  const [vocab] = await Promise.all([loadVocab(), e.ready()]);
  const loadMs = performance.now() - t0;
  await log(`EVAL_READY loadMs=${Math.round(loadMs)} adapter=${e.info.adapter}`);
  longTasks.length = 0;

  const shots: Record<string, { vector: Float32Array; reading: Reading }> = {};
  const embedMs: number[] = [];
  for (const [k, url] of Object.entries(fixtures).sort()) {
    const name = k.split("/").slice(-2).join("/");
    const blob = await (await fetch(url)).blob();
    const vector = await e.embedImage((await prepareImage(blob)).embedBlob);
    embedMs.push(e.info.lastImageMs ?? -1);
    shots[name] = { vector, reading: readPhoto(vector, vocab) };
  }
  const pairsOf = (set: string) => {
    const by: Record<string, string[]> = {};
    for (const n of Object.keys(shots).filter((n) => n.startsWith(`${set}/`))) (by[n.split("/")[1].split("-")[0]] ??= []).push(n);
    return Object.values(by).map((v) => v.sort());
  };
  const pairs = ["twins", "strangers", "same-kind"].flatMap((set) =>
    pairsOf(set).map(([a, b]) => {
      const A = shots[a], B = shots[b];
      const r = judgePair(A, B, `eval#${a}`, undefined, vocab);
      return {
        set, a, b, labelA: A.reading.label, labelB: B.reading.label, marginA: A.reading.margin, marginB: B.reading.margin,
        checkA: checkShot(A.reading) ?? null, checkB: checkShot(B.reading) ?? null, altA: A.reading.alt ?? null, altB: B.reading.alt ?? null, problem: checkTwin(A, B, vocab) ?? null,
        sim: r.sim, score: r.score, visual: r.visual, bonus: r.bonus, band: r.band, shared: r.shared, looksA: topAttributes(A.reading.attrZ), triesA: suggestTwins(A.vector, A.reading, vocab), triesB: suggestTwins(B.vector, B.reading, vocab),
      };
    }),
  );
  // F1 regression: the practice photos (same files as twins/01-*) as first shot and as twin, both ways
  const pc = shots["twins/01-cloud.jpg"], pt = shots["twins/01-cotton.jpg"];
  const practice = { cloudFirst: checkShot(pc.reading) ?? null, cottonFirst: checkShot(pt.reading) ?? null, cloudAsTwin: checkTwin(pt, pc, vocab) ?? null, cottonAsTwin: checkTwin(pc, pt, vocab) ?? null, cloud: { label: pc.reading.label, alt: pc.reading.alt ?? null, margin: pc.reading.margin, topSim: pc.reading.topSim } };
  const rejects = Object.keys(shots).filter((n) => n.startsWith("reject/")).map((n) => ({ name: n, label: shots[n].reading.label, kind: shots[n].reading.kind, margin: shots[n].reading.margin, problem: checkShot(shots[n].reading) ?? null }));
  const sorted = [...embedMs].sort((x, y) => x - y);
  const result = {
    adapter: e.info.adapter, loadMs: Math.round(loadMs), images: embedMs.length,
    embedMedianMs: Math.round(sorted[sorted.length >> 1]), embedMaxMs: Math.round(sorted.at(-1)!),
    longTasks: { count: longTasks.length, maxMs: Math.round(Math.max(0, ...longTasks)), totalMs: Math.round(longTasks.reduce((s, x) => s + x, 0)) },
    pairs, rejects, practice,
  };
  await post(`EVAL_RESULT ${JSON.stringify(result)}`);
  await log("EVAL_DONE");
}
main().catch((err) => post(`EVAL_FAIL ${err?.stack ?? err}`));
