Doppel started as a fork of Sense Hunt and Warmr (same author, same challenge window).

# Doppel

**Find two different things that look the same. Outside.**

Photograph anything outdoors. Walk about 50 metres. Then find its twin: a *different kind* of thing that looks the same, like a tire and a donut, moss and broccoli, or bark and elephant skin. **EmbeddingGemma 2 runs on your phone** and judges how alike the two photos look, and it shows its reasons:

- **Doppel sees:** what it thinks each photo is ("tire ↔ donut"), so you know it understood you.
- **A twin score** from 0 to 100, in four bands: Uncanny, Cousins, Distant, Strangers.
- **What they share:** "Both: ridged · layered · wrinkled", the visual qualities both photos have.

Three pairs a day, about 10 to 15 minutes, then "Done for today". You can't lose. Photos never leave the phone, and after the first load it works with no signal.

Built Oct 10 to 11, 2026 for DEV Hacktoberfest Week 1 ("Touch Grass").

- **Live:** https://doppel-ws59.onrender.com (Chrome on Android or desktop; needs WebGPU)
- **No time to go outside?** [Try a demo round](https://doppel-ws59.onrender.com/#/demo): one full round with bundled CC0 photos, no camera needed, nothing saved.
- **Write-up:** on DEV (link coming soon)

## How to play

1. **First photo.** Point the camera at anything outside (things, not people). Doppel names what it sees.
2. **Walk.** "Find its twin. Walk." The twin shot unlocks after about 50 m (GPS), or after 45 s if GPS isn't available or is too vague. Meanwhile you see your photo, what Doppel sees in it ("cloud / sky"), what to look for ("Look for something ridged, layered or wrinkled.") and three twins to try. Not happy with the first photo? Retake it, free.
3. **Its twin.** Photograph a different kind of thing that looks like the first.
4. **Reveal.** Both photos slide together in a brief "developing" flash, then the score counts up. Very different kinds of thing that still look alike earn a **stretch bonus** (up to +10). You can try one more twin per pair; the better one counts.

Shots Doppel can't use are refused and **not counted**: screens, rooms, documents and people, photos it can't read, the same photo twice, or the same kind of thing. Stuck? **Need an idea?** offers three hints a day, nudged toward a daily theme. The **?** in the app's header has all of this on one screen.

## How it works

```
        ┌──────────────── at build time, on a dev PC ─────────────────┐
        │ data/vocab.json: 208 kinds of thing, 19 not-allowed classes,│
        │   4 "unreadable" rows, 45 visual attributes                 │
        │ the same in-browser EmbeddingGemma 2 embeds them once       │
        │   -> public/vocab-<hash>.bin (276 x 768 floats, 848 KB)     │
        │ eval photos -> tools/twin_calibrate.py -> twin-scoring.json │
        │ Gemma 4 E4B (Ollama) -> data/twin-ideas.json (69 hints)     │
        └──────────────────────────────┬──────────────────────────────┘
                                       ▼
┌────────────────────────── on the phone (PWA) ─────────────────────────────┐
│ photo ─► EmbeddingGemma 2 (LiteRT-LM, WebGPU) ─► 768-d vector             │
│   label   = nearest "kind" row            ("Doppel sees: tire")           │
│   margin  = top label vs the best label of a different kind (uncertainty) │
│   attrs   = z-score of each attribute     ("Look for something ridged")   │
│ twin ─► cosine(photo A, photo B) ─► 0..100 (calibrated) ─► band, verdict  │
│   What they share = attributes >= 1 sd above average in BOTH photos       │
│ IndexedDB: the day, both vectors, thumbnails. Service worker: offline.    │
└───────────────────────────────────────────────────────────────────────────┘
```

EmbeddingGemma 2 puts photos and text into one vector space. Photo↔photo similarity is the score; photo↔text similarity gives the labels and the shared attributes that make the score explainable.

**Calibration** (`data/twin-scoring.json`, from `tools/twin_calibrate.py` on browser embeddings of 23 of my own outdoor photos): cosine 0.664 (10th percentile of all pairs) maps to 0 and 0.834 (95th percentile) to 100. Bands: Uncanny ≥ 80, Cousins ≥ 50, Distant ≥ 30. Same kind = label text similarity ≥ 0.90; same photo = cosine > 0.97; near-synonym labels (≥ 0.85) are shown together, not counted as doubt.

**Results** on 44 CC0 photos with the real model: see [`docs/eval.md`](docs/eval.md). Twins average 58.6, strangers 19.9; 6 of 8 twin pairs reach Cousins or better and all 8 stranger pairs stay Distant or below. It misses tire ↔ donut (18) and zebra ↔ striped awning (0).

## Privacy

Photos, vectors and scores stay in the browser's IndexedDB on your device. There is no server, account, analytics or sharing. GPS is used only to measure the walk (and a rounded position to compute sunrise), and only after your first photo. "Delete everything" is under History.

## Run it

```bash
cd web
npm ci
npm run dev      # http://localhost:5173
npm run build    # production build in web/dist/
```

Needs Node 22.12+ and a browser with WebGPU (Chrome or Edge on Android or desktop). The model, `litert-community/embeddinggemma-2-text-vision-440m-litert-lm` (388 MB), downloads once from Hugging Face and is cached; afterwards the app works offline. `render.yaml` deploys it as a static site on Render.

## Layout

- `web/src/twin.ts` scoring, bands, validity rules, What they share, verdicts
- `web/src/day.ts`, `walk.ts`, `sun.ts` the day, the walk unlock, the sunrise boundary
- `web/src/main.ts`, `ui/screens.ts`, `style.css` the app
- `web/src/embed/` the embedder (LiteRT-LM on WebGPU)
- `tools/` vocabulary, calibration, idea generator, palette (Python)
- `data/` vocabulary, calibration, ideas, Wada colors

## Credits

- **EmbeddingGemma 2** (Google), Apache-2.0, via the LiteRT-LM build by litert-community.
- **Gemma 4 E4B** (Google), run locally with Ollama, wrote the idea hints.
- **LiteRT-LM** (`@litert-lm/core`), Google AI Edge.
- **Sanzo Wada**, *A Dictionary of Color Combinations* (1933); colors from [mattdesl/dictionary-of-colour-combinations](https://github.com/mattdesl/dictionary-of-colour-combinations) (MIT, vendored in `data/wada/`).
- **Photos:** CC0 and public-domain images from Wikimedia Commons and Openverse (Flickr, rawpixel); every file, author and license in [`web/tests/fixtures/CREDITS.md`](web/tests/fixtures/CREDITS.md), [`web/public/practice/CREDITS.md`](web/public/practice/CREDITS.md) and [`web/public/demo/CREDITS.md`](web/public/demo/CREDITS.md).
- Fonts: IBM Plex Mono (OFL), Instrument Serif (OFL), via Fontsource.

## License

Apache-2.0. See `LICENSE`.
