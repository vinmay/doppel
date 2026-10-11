// T2.2 real-model check for LiteRtEmbedder. Dev-only page (not in the build).
// Run with: scripts/edge-run.sh "/embed-check.html?report=1" "CHECK_(PASS|FAIL)"
import { LiteRtEmbedder } from "./embed/litert";
import { MODEL_CACHE } from "./embed/model-source";

const out = document.getElementById("out")!;
const log = (s: string) => {
  out.textContent += `${s}\n`;
  fetch("/__report", { method: "POST", body: s }).catch(() => {});
};
const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, v, i) => s + v * b[i], 0);

async function main() {
  const params = new URLSearchParams(location.search);
  if (params.has("fresh")) await caches.delete(MODEL_CACHE);
  let events = 0;
  let lastDl = 0;
  const e = new LiteRtEmbedder({
    modelUrl: "/models/embeddinggemma-2-text-vision-440m.litertlm",
    maxTextTokens: params.has("maxlen") ? Number(params.get("maxlen")) : undefined,
    onProgress: (p) => {
      events++;
      if (p.phase === "download") lastDl = p.loaded;
    },
  });
  await e.ready();
  log(`maxlen=${params.get("maxlen") ?? "default"}`);
  log(`ready: adapter=${e.info.adapter} loadMs=${e.info.loadMs?.toFixed(0)} progressEvents=${events} downloadedBytes=${lastDl}`);
  const img = await (await fetch("/test-images/hydrant.jpg")).blob();
  const t0 = performance.now();
  const iv = await e.embedImage(img);
  log(`image dim=${iv.length} embedMs=${(performance.now() - t0).toFixed(0)}`);
  const prompts = ["a red fire hydrant on a sidewalk", "orange and red maple leaves", "a brown mushroom on the forest floor"];
  const sims = [];
  const t1 = performance.now();
  for (const p of prompts) sims.push(dot(iv, await e.embedText(p)));
  log(`textMs(avg of ${prompts.length})=${((performance.now() - t1) / prompts.length).toFixed(0)}`);
  log(`sims=${sims.map((s) => s.toFixed(4)).join(",")}`);
  const norm = Math.sqrt(dot(iv, iv));
  const ok = iv.length === 768 && Math.abs(norm - 1) < 1e-3 && sims[0] === Math.max(...sims);
  log(ok ? "CHECK_PASS" : "CHECK_FAIL");
}
main().catch((err) => log(`CHECK_FAIL ${err?.stack ?? err}`));
