// P2: turn the vectors that vocab-build.html POSTed to report.log into the
// shipped file public/vocab-<hash>.bin: Float32, little-endian, row-major,
// count x DIM, Matryoshka-truncated to the first DIM dims, re-normalised.
// The hash covers the model file and the vocab texts, so a change to either
// gives a new file name (and a fresh cache entry). Writes data/vocab-vectors.json.
// Photo vectors (?photos) go to --photos-out, a local path (never commit).
// Usage: node scripts/vocab-pack.mjs [report.log] [--photos-out FILE.json] [--full-out FILE.bin]
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const DIM = 256;
const MODEL = ".models/embeddinggemma-2-text-vision-440m.litertlm";
const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const log = readFileSync(args[0] && !args[0].startsWith("--") ? args[0] : "report.log", "utf8").split("\n");

const field = (prefix) => log.find((l) => l.includes(` ${prefix} `))?.split(` ${prefix} `)[1];
const meta = JSON.parse(field("VOCAB_META"));
const f32 = (b64) => {
  const buf = Buffer.from(b64, "base64");
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
};
const full = f32(field("VOCAB_B64"));
const vocab = JSON.parse(readFileSync("../data/vocab.json", "utf8"));
if (full.length !== vocab.count * meta.dim) throw new Error(`got ${full.length} floats, want ${vocab.count}x${meta.dim}`);

const truncate = (v, d) => {
  const t = Float32Array.from(v.subarray(0, d));
  const n = Math.hypot(...t);
  return t.map((x) => x / n);
};
const out = new Float32Array(vocab.count * DIM);
for (let i = 0; i < vocab.count; i++) out.set(truncate(full.subarray(i * meta.dim, (i + 1) * meta.dim), DIM), i * DIM);

const modelSha = createHash("sha256").update(readFileSync(MODEL)).digest("hex");
const texts = vocab.items.map((i) => i.text);
const hash = createHash("sha256").update(modelSha).update(JSON.stringify(texts)).update(String(DIM)).digest("hex").slice(0, 12);
for (const f of readdirSync("public")) if (/^vocab-[0-9a-f]+\.bin$/.test(f)) rmSync(`public/${f}`);
const file = `vocab-${hash}.bin`;
writeFileSync(`public/${file}`, Buffer.from(out.buffer));
writeFileSync(
  "../data/vocab-vectors.json",
  JSON.stringify(
    {
      file,
      count: vocab.count,
      dim: DIM,
      sourceDim: meta.dim,
      textsSha256: createHash("sha256").update(JSON.stringify(texts)).digest("hex"),
      modelSha256: modelSha,
      model: "litert-community/embeddinggemma-2-text-vision-440m-litert-lm (browser, WebGPU, maxlen 256)",
      adapter: meta.adapter,
      embedMs: meta.textMs,
    },
    null,
    1,
  ) + "\n",
);
console.log(`wrote public/${file} (${out.byteLength} bytes, ${vocab.count}x${DIM}) from ${meta.adapter}, ${meta.textMs} ms total`);

if (opt("--full-out")) writeFileSync(opt("--full-out"), Buffer.from(full.buffer, full.byteOffset, full.byteLength));
if (opt("--photos-out")) {
  const photos = {};
  for (const l of log) {
    const m = l.match(/ PHOTO_B64 (\S+) (\S+)$/);
    if (m) photos[m[1]] = Array.from(f32(m[2]));
  }
  writeFileSync(opt("--photos-out"), JSON.stringify(photos));
  console.log(`wrote ${Object.keys(photos).length} photo vectors to ${opt("--photos-out")} (local only)`);
}
