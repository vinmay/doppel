import type { LoadProgress } from "./types";

export const MODEL_FILE = "embeddinggemma-2-text-vision-440m.litertlm";
export const MODEL_BYTES = 387_710_976; // HF API, 2026-10-07
export const MODEL_URL: string =
  import.meta.env.VITE_MODEL_URL ??
  `https://huggingface.co/litert-community/embeddinggemma-2-text-vision-440m-litert-lm/resolve/main/${MODEL_FILE}`;
export const MODEL_CACHE = "warmr-model-v1";

function counted(body: ReadableStream<Uint8Array>, total: number, onProgress?: (p: LoadProgress) => void) {
  let loaded = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        loaded += chunk.byteLength;
        onProgress?.({ phase: "download", loaded, total });
        ctl.enqueue(chunk);
      },
    }),
  );
}

export async function isModelCached(url = MODEL_URL): Promise<boolean> {
  if (!("caches" in globalThis)) return false;
  return !!(await (await caches.open(MODEL_CACHE)).match(url));
}

/**
 * Returns a stream of the model file. The first time, it downloads into the
 * Cache API (reporting progress) so later loads, including offline ones, read
 * from the cache.
 */
export async function openModelStream(
  url = MODEL_URL,
  onProgress?: (p: LoadProgress) => void,
): Promise<ReadableStream<Uint8Array>> {
  const cache = "caches" in globalThis ? await caches.open(MODEL_CACHE) : undefined;
  const hit = await cache?.match(url);
  if (hit?.body) return hit.body;

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`model download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get("Content-Length")) || MODEL_BYTES;
  const body = counted(res.body, total, onProgress);
  if (!cache) return body;

  await cache.put(url, new Response(body, { headers: { "Content-Length": String(total) } }));
  const stored = await cache.match(url);
  if (!stored?.body) throw new Error("model cache write failed");
  return stored.body;
}
