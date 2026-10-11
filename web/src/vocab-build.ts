// P2: embed every phrase in data/vocab.json with the app's in-browser
// embedder (design rule 1: same runtime as photos) and POST the vectors back
// as base64 Float32 (768-d, L2-normalised); scripts/vocab-pack.mjs turns them
// into public/vocab-<hash>.bin. With ?photos it also embeds V's eval photos,
// staged by hand into web/.eval-photos/ (never committed), for the GATE H1
// analysis. Dev-only page. Run:
//   scripts/edge-run.sh "/vocab-build.html[?photos]" "VOCAB_(DONE|FAIL)" 1200
import vocab from "../../data/vocab.json";
import { prepareImage } from "./capture";
import { LiteRtEmbedder } from "./embed/litert";

const evalPhotos = import.meta.glob<string>("../.eval-photos/*", { query: "?url", import: "default", eager: true });

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
  const texts = vocab.items.map((i) => i.text);
  const e = new LiteRtEmbedder({ modelUrl: "/models/embeddinggemma-2-text-vision-440m.litertlm" });
  await e.ready();
  await log(`VOCAB_READY loadMs=${Math.round(e.info.loadMs ?? 0)} adapter=${e.info.adapter}`);
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

  if (new URLSearchParams(location.search).has("photos")) {
    for (const k of Object.keys(evalPhotos).sort()) {
      const blob = await (await fetch(evalPhotos[k])).blob();
      const v = await e.embedImage((await prepareImage(blob)).embedBlob);
      await post(`PHOTO_B64 ${k.split("/").pop()} ${b64(v)}`);
    }
    await log(`VOCAB_PHOTOS ${Object.keys(evalPhotos).length}`);
  }
  await log("VOCAB_DONE");
}
main().catch((err) => post(`VOCAB_FAIL ${err?.stack ?? err}`));
