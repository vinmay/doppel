// The ~450-phrase vocabulary and its vectors, embedded once with the same
// in-browser model (vocab-build.html) and shipped as public/vocab-<hash>.bin:
// Float32, count x dim, unit rows. The service worker precaches the file.
import meta from "../../data/vocab-vectors.json";
import vocab from "../../data/vocab.json";

export const VOCAB_TEXTS: string[] = vocab.items.map((i) => i.text);
export const VOCAB_FILE = meta.file;

export interface Vocab {
  texts: string[];
  vectors: Float32Array;
  dim: number;
}

let loading: Promise<Vocab> | undefined;

export function loadVocab(): Promise<Vocab> {
  return (loading ??= (async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}${meta.file}`);
    if (!res.ok) throw new Error(`couldn't load the vocabulary (${res.status})`);
    const vectors = new Float32Array(await res.arrayBuffer());
    if (vectors.length !== meta.count * meta.dim) throw new Error("vocabulary file has the wrong size");
    return { texts: VOCAB_TEXTS, vectors, dim: meta.dim };
  })().catch((e) => {
    loading = undefined;
    throw e;
  }));
}
