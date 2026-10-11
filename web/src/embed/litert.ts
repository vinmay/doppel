import { Backend, EmbeddingEngine, loadLiteRtLm, SUPPORTED_IMAGE_MIME_TYPES } from "@litert-lm/core";
import { openModelStream } from "./model-source";
import { l2normalize, UnsupportedError, type Embedder, type EmbedderInfo, type LoadProgress } from "./types";

// EmbeddingGemma 2 retrieval-query prefix; images get no prefix.
// Measured in Edge on 2026-10-07: the 128-token signature gives
// wrong embeddings (hydrant photo vs prompts 0.651/0.602/0.644; PyTorch says
// 0.666/0.516/0.532), while 256 matches 1024 to 4 decimals at ~4x the speed.
export const MAX_TEXT_TOKENS = 256;

export const queryText = (s: string) => `task: search result | query: ${s}`;

let wasmLoad: Promise<unknown> | undefined;
const loadWasm = () => (wasmLoad ??= loadLiteRtLm(`${import.meta.env.BASE_URL}litertlm-wasm/`));

/** Re-encode anything LiteRT can't decode (webp, heic via the browser) to JPEG. */
async function toSupportedImage(blob: Blob): Promise<Blob> {
  if (SUPPORTED_IMAGE_MIME_TYPES.has(blob.type)) return blob;
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}

/**
 * EmbeddingGemma 2 (text+vision 440M) via LiteRT-LM on WebGPU. The CPU/WASM
 * backend can't load this model in SDK 0.18.0 ("Failed to get external weight"), so WebGPU
 * is required.
 */
export class LiteRtEmbedder implements Embedder {
  readonly info: EmbedderInfo = { backend: "webgpu" };
  private engine?: Promise<EmbeddingEngine>;

  constructor(
    private readonly opts: { modelUrl?: string; maxTextTokens?: number; onProgress?: (p: LoadProgress) => void } = {},
  ) {}

  ready(): Promise<void> {
    this.engine ??= this.load().catch((e) => {
      this.engine = undefined; // allow retry
      throw e;
    });
    return this.engine.then(() => undefined);
  }

  private async load() {
    if (!("gpu" in navigator)) {
      throw new UnsupportedError("This browser doesn't support WebGPU, which Doppel needs to run the model on your device. Try Chrome on Android or a recent desktop browser.");
    }
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new UnsupportedError("WebGPU is available but no GPU adapter was found on this device.");
    this.info.adapter = [adapter.info.vendor, adapter.info.architecture].filter(Boolean).join(" ");

    const t0 = performance.now();
    const [, model] = await Promise.all([loadWasm(), openModelStream(this.opts.modelUrl, this.opts.onProgress)]);
    this.opts.onProgress?.({ phase: "init", loaded: 0, total: 1 });
    // Prompts are a few words; without maxInputLength the SDK pads every text
    // to 1024 tokens (~1.2 s each on an iGPU vs ~0.26 s at 256).
    const engine = await EmbeddingEngine.create({
      model,
      backend: Backend.GPU,
      visionBackend: Backend.GPU,
      maxInputLength: this.opts.maxTextTokens ?? MAX_TEXT_TOKENS,
    });
    this.info.loadMs = performance.now() - t0;
    this.opts.onProgress?.({ phase: "init", loaded: 1, total: 1 });
    return engine;
  }

  async embedText(s: string) {
    await this.ready();
    const r = await (await this.engine!).computeEmbedding(queryText(s), { normalize: true });
    return l2normalize(Float32Array.from(r.embedding));
  }

  async embedImage(blob: Blob) {
    await this.ready();
    const img = await toSupportedImage(blob);
    const t0 = performance.now();
    const r = await (await this.engine!).computeEmbedding(img, { normalize: true });
    this.info.lastImageMs = performance.now() - t0;
    return l2normalize(Float32Array.from(r.embedding));
  }
}
