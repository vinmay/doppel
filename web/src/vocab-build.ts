// Embeds every row of data/vocab.json (labels, rejects, attributes) with the
// app's own in-browser embedder and POSTs the vectors to /__report as base64
// Float32 (768-d, unit). scripts/vocab-pack.mjs turns them into
// public/vocab-<hash>.bin. With ?photos it also embeds the photos used for
// calibration and the model-in-the-loop eval: V's eval photos (staged by hand
// in web/.eval-photos/, never committed) and the CC0 fixtures. Dev-only page:
//   scripts/edge-run.sh "/vocab-build.html?photos" "VOCAB_(DONE|FAIL)" 1500
import vocab from "../../data/vocab.json";
import { prepareImage } from "./capture";
import { LiteRtEmbedder } from "./embed/litert";

const evalPhotos = import.meta.glob<string>("../.eval-photos/*", { query: "?url", import: "default", eager: true });
const fixtures = import.meta.glob<string>("../tests/fixtures/*/*.jpg", { query: "?url", import: "default", eager: true });

const out = document.getElementById("out")!;
const post = (s: string) => fetch("/__report", { method: "POST", body: s }).catch(() => {});
const log = (s: string) => {
  out.textContent += `${s}\n`;
  return post(s);
};

function b64(v: Float32Array): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function main() {
  const params = new URLSearchParams(location.search);
  const texts = vocab.items.map((i) => i.text);
  const e = new LiteRtEmbedder({ modelUrl: "/models/embeddinggemma-2-text-vision-440m.litertlm" });
  await e.ready();
  await log(`VOCAB_READY loadMs=${Math.round(e.info.loadMs ?? 0)} adapter=${e.info.adapter}`);
  if (!params.has("photosOnly")) {
    const t0 = performance.now();
    let dim = 0;
    const all: Float32Array[] = [];
    for (const [i, t] of texts.entries()) {
      const v = await e.embedText(t);
      dim = v.length;
      all.push(v);
      if ((i + 1) % 50 === 0) await log(`VOCAB_PROGRESS ${i + 1}/${texts.length} ${Math.round(performance.now() - t0)}ms`);
    }
    const textMs = performance.now() - t0;
    const mat = new Float32Array(all.length * dim);
    all.forEach((v, i) => mat.set(v, i * dim));
    await log(`VOCAB_META ${JSON.stringify({ count: texts.length, dim, textMs: Math.round(textMs), perTextMs: +(textMs / texts.length).toFixed(1), adapter: e.info.adapter })}`);
    await post(`VOCAB_B64 ${b64(mat)}`);
  }

  if (params.has("photos") || params.has("photosOnly")) {
    const sources: [string, string][] = [
      ...Object.entries(evalPhotos).map(([k, u]): [string, string] => [`eval/${k.split("/").pop()}`, u]),
      ...Object.entries(fixtures).map(([k, u]): [string, string] => [`fx/${k.split("/").slice(-2).join("/")}`, u]),
    ].sort();
    const times: number[] = [];
    for (const [name, url] of sources) {
      const blob = await (await fetch(url)).blob();
      const v = await e.embedImage((await prepareImage(blob)).embedBlob);
      times.push(e.info.lastImageMs ?? -1);
      await post(`PHOTO_B64 ${name} ${b64(v)}`);
    }
    times.sort((a, b) => a - b);
    await log(`VOCAB_PHOTOS ${JSON.stringify({ n: sources.length, medianImageMs: Math.round(times[times.length >> 1]), maxImageMs: Math.round(times.at(-1)!) })}`);
  }
  await log("VOCAB_DONE");
}
main().catch((err) => post(`VOCAB_FAIL ${err?.stack ?? err}`));
