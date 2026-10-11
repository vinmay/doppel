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
 * Test builds only (VITE_ALLOW_FAKE=1): `?embedder=fake` swaps in a
 * deterministic fake so gameplay tests don't need the 388 MB model. In a
 * production build ALLOW_FAKE is the literal `false`, so the fake is
 * tree-shaken out (checked by scripts/check-bundle.mjs).
 */
export const ALLOW_FAKE = import.meta.env.VITE_ALLOW_FAKE === "1";

export function getEmbedder(): Embedder {
  if (!instance) {
    const fake = ALLOW_FAKE && new URLSearchParams(location.search).get("embedder") === "fake";
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

export const isFakeEmbedder = () => ALLOW_FAKE && getEmbedder() instanceof FakeEmbedder;
