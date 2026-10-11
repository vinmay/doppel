// F1 regression, on real model output: the app must accept its own practice
// photos, as a first shot and as a twin. Vectors are the browser embedder's
// output for web/public/practice/*.jpg (tests/fixtures/practice-vectors.json).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import meta from "../../../data/vocab-vectors.json";
import vocabJson from "../../../data/vocab.json";
import vecs from "../fixtures/practice-vectors.json";
import { checkShot, checkTwin, readPhoto, type Kind, type LabelVocab } from "../../src/twin";

const buf = readFileSync(join(import.meta.dirname, "../../public", meta.file));
const vocab: LabelVocab = {
  items: vocabJson.items.map((i) => ({ label: i.label, kind: i.kind as Kind })),
  vectors: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4),
  dim: meta.dim,
};
const shot = (v: number[]) => ({ vector: Float32Array.from(v), reading: readPhoto(v, vocab) });

describe("F1: the practice photos are accepted (real vectors)", () => {
  const cloud = shot(vecs.cloud), cotton = shot(vecs.cotton);
  it("reads them as cloud and cotton", () => {
    expect(cloud.reading.label).toBe("cloud");
    expect(cotton.reading.label).toBe("cotton");
  });
  it("accepts both as a first shot", () => {
    expect(checkShot(cloud.reading)).toBeUndefined();
    expect(checkShot(cotton.reading)).toBeUndefined();
  });
  it("accepts both as a twin", () => {
    expect(checkTwin(cotton, cloud, vocab)).toBeUndefined();
    expect(checkTwin(cloud, cotton, vocab)).toBeUndefined();
  });
  it("stays accepted even if a phone GPU shaves the margin to zero", () => {
    expect(checkShot({ ...cloud.reading, margin: 0 })).toBeUndefined();
  });
});

describe("G1 on real vectors", () => {
  it("suggests 3 mutually different kinds for the practice cloud, none a cloud synonym", async () => {
    const { suggestTwins, labelSim } = await import("../../src/twin");
    const c = shot(vecs.cloud);
    const s = suggestTwins(c.vector, c.reading, vocab);
    expect(s).toHaveLength(3);
    const idx = (l: string) => vocab.items.findIndex((i) => i.label === l);
    for (const x of s) expect(labelSim(vocab, c.reading.index, idx(x))).toBeLessThan(0.85);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(labelSim(vocab, idx(s[i]), idx(s[j]))).toBeLessThan(0.85);
    console.log("cloud suggestions:", s.join(" · "));
  });
});
