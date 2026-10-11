# Browser runtime notes (T0.3)

Researched on 2026-10-07. The stack was released on Oct 6, 2026, so everything below comes from the current docs, the npm package source and the HF repos. Nothing here comes from memory.

## Summary

| Question | Answer |
|---|---|
| (a) Does the JS SDK embed images in the browser? | **Yes.** In `@litert-lm/core` 0.18.0, set `EmbeddingEngine.create({model, visionBackend})` and then call `computeEmbedding(blob, {normalize: true})`. |
| (b) Download size | **Text+vision model: 387,710,976 B (~388 MB).** The WASM runtime adds ~22 to 34 MB, and only one variant loads. |
| (c) Backend and browser support | **WebGPU by default**, with `Backend.GPU`. `Backend.CPU` exists in the enum, but **CPU embedding in the browser is UNKNOWN** until T0.4 tests it. The docs say "try out our web demo in Chrome". **iOS Safari is UNKNOWN.** |
| (d) Required headers (COOP/COEP) | **None found.** The WASM variant is chosen on relaxed-SIMD and JSPI only, not on threads, so cross-origin isolation is not needed. The model is fetched cross-origin from HF, which sends CORS headers. |
| (e) Licences | Model: **Apache-2.0** (HF card). SDK: **Apache-2.0** (npm `license` field and file headers). The docs pages are CC-BY-4.0 and their code samples Apache-2.0. |

## Details and sources

### (a) Image embedding API
- Docs page: https://developers.google.com/edge/litert-lm/embedding_models. Its JS sample shows **text only**: `EmbeddingEngine.create({model})` and then `engine.computeEmbedding(text, {normalize: true})`. The Python, Kotlin and Swift samples show image input.
- npm `@litert-lm/core@0.18.0` (published 2026-10-06, source repo https://github.com/google-ai-edge/LiteRT-LM, path `js/packages/core`). I read `dist/embedding_engine.d.ts` directly:
  - `type SingleEmbeddingInput = string | ContentPart | Blob`, and `EmbeddingInput` is one of those or an array of them (interleaved).
  - `computeEmbedding(input, options?) → {embedding: number[], inputLength, truncatedLength?, numChunks}`
  - `computeEmbeddingBatch(inputs[], options?)`
  - `EmbeddingOptions = {normalize?, insertSpecialTokens?, inputOverflowStrategy?, visionTokensPerImage?, outputSize?}`
- `EmbeddingEngineSettings` (`dist/embedding_engine_settings.d.ts`):
  - `model: string | Blob | ReadableStream<Uint8Array>`: either a URL fetched with `credentials: same-origin`, or a stream.
  - `backend?: Backend` defaults to `Backend.GPU`.
  - `visionBackend?: Backend`: "**If unset, vision is disabled.**" We must set it.
  - `audioBackend?: Backend`: if unset, audio is disabled. We leave it unset, which follows design rule 3.
  - `maxInputLength` defaults to 1024. `minInputLength` lets short prompts run on a smaller graph. `visionTokensPerImage` takes 70 or 140 per the HF card.
- Image MIME types (`SUPPORTED_IMAGE_MIME_TYPES`): jpeg, png, bmp, gif, tga, psd, hdr, ppm, pgm. **No webp and no HEIC.** That means camera files must be re-encoded to JPEG with a canvas before embedding, which T2.5 does anyway.
- The README of the same package still says "early preview that supports text-in / text-out running in WebGPU". The README is out of date relative to the code, because `EmbeddingEngine` with image support ships in the same package.
- **Reference implementation:** Google's "Multimodal Search Web Demo" at https://google-ai-edge.github.io/LiteRT-LM/web_demos/embedding_search/index.html, header "Copyright 2026 The ODML Authors", Apache-2.0. Its unminified source is **not found** in the LiteRT-LM repo tree on `main`. I read the built bundle (`assets/index-DItGeRXA.js`). It does the following:
  - `EmbeddingEngine.create({model: stream, backend: GPU, visionBackend: GPU, audioBackend: GPU})`.
  - Images are passed as raw `Blob`s, which the SDK turns into `{type: "image", data: ArrayBuffer}`, with **no prefix**.
  - Text queries in "retrieval" mode use `task: search result | query: ${q}` and documents use `title: none | text: ${d}`. This matches our design rule 4.
  - The bundle wraps the model download in its own Cache API layer, using a cache named `litertlm-models`.

### (b) Sizes
- HF API: https://huggingface.co/api/models/litert-community/embeddinggemma-2-text-vision-440m-litert-lm
  - `embeddinggemma-2-text-vision-440m.litertlm` is **387,710,976 bytes**. This is the generic CPU/GPU file. The other files in the repo are NPU builds for specific SoCs, and we don't use them.
- Full 740M model, including audio: `litert-community/embeddinggemma-2-740m-litert-lm/embeddinggemma-2-740m.litertlm` is 484,622,336 B. **We use the 440M text+vision build instead.** It saves ~97 MB and matches design rule 3. Model card: https://huggingface.co/litert-community/embeddinggemma-2-740m-litert-lm
- Quantization of the 440M build: int4 QAT for the transformer and embeddings, int8 QAT for the vision encoder. This is why browser embeddings may drift from bf16/fp32 PyTorch (see T2.4).
- WASM runtime from npm `wasm/`: `litertlm_wasm_internal.wasm` is 21.9 MB (relaxed SIMD + JSPI), the `_compat_` variant is 21.7 MB, and the `_asyncify_` variants are ~34 MB. By default the SDK loads them from `https://cdn.jsdelivr.net/npm/@litert-lm/core@0.18.0/wasm`. **For offline use we should self-host `wasm/` and call `loadLiteRtLm(ourUrl)`, or precache the jsDelivr URL.**

### (c) Backends and browsers
- `Backend` enum: `UNSPECIFIED, CPU_ARTISAN, GPU_ARTISAN, CPU, GPU, GOOGLE_TENSOR_ARTISAN, NPU`.
- With GPU, the SDK calls `navigator.gpu.requestAdapter({powerPreference: 'high-performance'})` and requests `shader-f16` and `subgroups` only if they are available.
- WASM variant choice (`dist/load.js`): relaxed SIMD + JSPI → `litertlm_wasm_internal`; relaxed SIMD without JSPI → `asyncify`; no relaxed SIMD → `compat` or `compat_asyncify`. Because of this fallback chain, browsers without JSPI can still run it.
- Published web latency (HF card, MacBook Pro M5, WebGPU): text 21.8 ms, text+vision 107 ms. The card has no phone-browser numbers. **Pixel 8 Pro Chrome: UNKNOWN until T3.2.**
- **iOS Safari: UNKNOWN.** WebGPU in Safari is newer and Safari has no JSPI, so it would use the asyncify path. We need to test on a real device in T3.1. Risk table: show a clear error if `navigator.gpu` is missing.
- **CPU fallback:** `Backend.CPU` is in the enum, but no web sample uses it. T0.4 will try it.

### (d) Headers
- `wasm_feature_detect.js` checks `SharedArrayBuffer` for a `threads` feature, but `load.js` does **not** use `threads` to choose the variant. So no COOP/COEP is needed. **This is confirmed in practice only if the spike loads without isolation (T0.4).**
- Model hosting: HF `resolve/main/...` returns a 302 redirect to `us.aws.cdn.hf.co`. A request with an `Origin` header gets `access-control-allow-origin: <origin>` echoed back, so loading directly from HF works. For offline use we cache the response ourselves (T2.8).

### (e) Licences
- Model files: `license: apache-2.0` on both HF repos. Base model card: https://huggingface.co/google/embeddinggemma-2 (Apache-2.0).
- SDK: `@litert-lm/core` is `"license": "Apache-2.0"`, and the source headers say "Copyright 2026 Google LLC, Apache 2.0".
- Gemma 4 (build-time only, used to generate prompts) is covered separately in T1.3.

## Decisions for the app
1. Model URL: `https://huggingface.co/litert-community/embeddinggemma-2-text-vision-440m-litert-lm/resolve/main/embeddinggemma-2-text-vision-440m.litertlm`.
2. Settings: `{backend: GPU, visionBackend: GPU}` with no audio. If the GPU fails, retry with CPU, pending T0.4.
3. Prompts are embedded as `task: search result | query: <prompt>`. Images are re-encoded to JPEG Blobs and embedded with no prefix.
4. Pass `normalize: true` to the engine and L2-normalize again on our side as a guard.

## Measurements (2026-10-07)

All of these come from headless Edge 154 on Windows, using the AMD integrated GPU (`gcn-5`), with EmbeddingGemma 2 text+vision 440M on `@litert-lm/core` 0.18.0.

### Browser spike: 3 CC0 photos against 3 prompts
| photo \ prompt | fire hydrant | maple leaves | mushroom |
|---|---|---|---|
| hydrant.jpg | **0.6745** | 0.5365 | 0.5637 |
| maple.jpg | 0.5832 | **0.7477** | 0.5541 |
| mushroom.jpg | 0.5712 | 0.6261 | **0.7849** |

The PyTorch fp32 reference (`google/embeddinggemma-2`, sentence-transformers) gives the same ranking and a slightly lower band. For hydrant.jpg it gives 0.6662 / 0.5158 / 0.5321. This is why the app embeds prompts and photos with the same in-browser model.

### Backends
- `Backend.CPU` fails inside `EmbeddingEngine.create` with `Failed to get external weight for buffer id ... (tensor 1451)`. **WebGPU is required.**
- Linux headless Chromium (Playwright on WSL) only gets a SwiftShader software adapter. The model loads, but 3 text embeddings took about 9 minutes, which makes it unusable for tests.

### Text signature length (`maxInputLength`)
The SDK pads every text input to `maxInputLength`, which defaults to 1024 tokens.

| maxInputLength | text ms (avg of 3) | hydrant.jpg vs the 3 prompts |
|---|---|---|
| 128 | 170 | 0.6510, 0.6015, 0.6442 (**wrong**) |
| 256 | 263 | 0.6745, 0.5365, 0.5639 |
| 512 | 851 | 0.6744, 0.5364, 0.5636 |
| 1024 (default) | 1154 | 0.6745, 0.5365, 0.5637 |

The app uses 256.

### Load and embed times
- Cold load, including the 387,710,976-byte download from a local server: 11.4 s. Warm load from the Cache API: about 3.6 to 5.5 s.
- One photo: about 1.9 to 3.0 s. One prompt text, at 256 tokens: about 0.26 s.

### Offline proof (`web/scripts/offline-proof.sh`)
I loaded the production build online twice. Then I replaced the server with one that answers 503 to every request and loaded the page again. The `?debug=1&autotest=1` self-test still passed:
```
SELFTEST_PASS backend=webgpu adapter=amd gcn-5 loadMs=3590 imageMs=1951 totalMs=12717 sw=true
```
The server only saw `GET /?debug=1&autotest=1` and `GET /sw.js`. Everything else came from the service worker and the Cache API.
