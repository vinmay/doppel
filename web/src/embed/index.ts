import { FakeEmbedder } from "./fake";
import { LiteRtEmbedder } from "./litert";
import type { Embedder, LoadProgress } from "./types";

export type { Embedder, LoadProgress } from "./types";
export { UnsupportedError } from "./types";

type Listener = (p: LoadProgress) => void;
const listeners = new Set<Listener>();
let last: LoadProgress | undefined;

/** Subscribe to model download/init progress; returns an unsubscribe fn. */
export function onModelProgress(fn: Listener): () => void {
  listeners.add(fn);
  if (last) fn(last);
  return () => listeners.delete(fn);
}

let instance: Embedder | undefined;

/**
 * The app-wide embedder. `?embedder=fake` swaps in a deterministic fake so
 * end-to-end tests can run on machines without a usable GPU.
 */
export function getEmbedder(): Embedder {
  if (!instance) {
    const fake = new URLSearchParams(location.search).get("embedder") === "fake";
    instance = fake
      ? new FakeEmbedder()
      : new LiteRtEmbedder({
          onProgress: (p) => {
            last = p;
            listeners.forEach((l) => l(p));
          },
        });
  }
  return instance;
}

export const isFakeEmbedder = () => getEmbedder() instanceof FakeEmbedder;
