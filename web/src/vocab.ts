// Doppel's label vocabulary (kinds of things, reject classes, attributes) and
// its vectors, embedded once with the same in-browser model (vocab-build.html)
// and shipped as public/vocab-<hash>.bin: Float32, count x dim, unit rows.
// The service worker precaches the file.
import meta from "../../data/vocab-vectors.json";
import vocab from "../../data/vocab.json";
import type { Kind, LabelVocab } from "./twin";

export const VOCAB_ITEMS = vocab.items.map((i) => ({ label: i.label, kind: i.kind as Kind }));
export const VOCAB_FILE = meta.file;

let loading: Promise<LabelVocab> | undefined;

export function loadVocab(): Promise<LabelVocab> {
  return (loading ??= (async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}${meta.file}`);
    if (!res.ok) throw new Error(`couldn't load the vocabulary (${res.status})`);
    const vectors = new Float32Array(await res.arrayBuffer());
    if (vectors.length !== meta.count * meta.dim) throw new Error("vocabulary file has the wrong size");
    return { items: VOCAB_ITEMS, vectors, dim: meta.dim };
  })().catch((e) => {
    loading = undefined;
    throw e;
  }));
}
